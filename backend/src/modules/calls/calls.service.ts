import { sql } from 'kysely';
import { withTransaction } from '../../db/withTransaction.js';
import { AppError } from '../../utils/errors.js';

export interface OpenCallInput {
  idempotencyKey: string;
  agentId: number;
  campaignId: number;
  assignmentId: number;
  clientId: number;
  contactId: number | null;
  dialedNumber: string;
  dialedExtension?: string | null;
}

export interface SurveyAnswerInput {
  questionId: number;
  optionId?: number | null;
  answerText?: string | null;
}

export interface CloseCallInput {
  attemptId: number;
  agentId: number; // para verificar que el agente cierra su propia llamada
  channelCode: string;
  newData?: { businessName?:string;phone?:string;email?:string };
  notes?: string | null;
  // Encuesta opcional (SILIMEX). Si se manda, se completa o declina en la
  // MISMA transaccion que el cierre de la llamada, para que el trigger
  // diferido de integridad (validate_survey) revise todo junto al COMMIT.
  survey?: {
    versionId: number;
    declined: boolean;
    answers?: SurveyAnswerInput[];
  };
}

/**
 * Abre un intento de llamada 'live'. El backend NO calcula duracion ni
 * snapshots -- eso lo hace el trigger validate_attempt al insertar. Aqui
 * solo mandamos los datos que el agente/telefono (MicroSIP) conoce.
 */
export async function openCall(input: OpenCallInput, userId: number) {
  return withTransaction(userId, async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(${input.agentId})`.execute(trx);
    const existing = await trx.selectFrom('call_attempts').selectAll()
      .where('idempotency_key', '=', input.idempotencyKey).executeTakeFirst();
    if (existing) {
      if (existing.agent_id !== input.agentId || existing.assignment_id !== input.assignmentId ||
          existing.client_id !== input.clientId || existing.campaign_id !== input.campaignId ||
          existing.contact_id !== input.contactId || existing.dialed_number !== input.dialedNumber ||
          existing.dialed_extension !== (input.dialedExtension ?? null))
        throw new AppError(409, 'La clave ya se utilizó con otros datos.', 'IDEMPOTENCY_CONFLICT');
      return { attempt_id: existing.attempt_id, call_start: existing.call_start };
    }
    const row = await trx
      .insertInto('call_attempts')
      .values({
        idempotency_key: input.idempotencyKey,
        assignment_id: input.assignmentId,
        campaign_id: input.campaignId,
        client_id: input.clientId,
        agent_id: input.agentId,
        contact_id: input.contactId,
        dialed_number: input.dialedNumber,
        dialed_extension: input.dialedExtension ?? null,
        origin: 'live',
        state: 'open',
        call_start: sql<Date>`clock_timestamp()`,
        // agent_name_snapshot es NOT NULL en la tabla pero lo llena el
        // trigger validate_attempt (BEFORE INSERT) antes de que se valide;
        // mandamos '' como placeholder porque Kysely exige un valor.
        agent_name_snapshot: '',
      })
      .returning(['attempt_id', 'call_start'])
      .executeTakeFirstOrThrow();

    return row;
  });
}

/**
 * Cierra un intento y, si aplica, completa/declina la encuesta en el mismo
 * commit. `channelCode` se resuelve a channel_id de la campana del intento;
 * el channel_id ya trae amarrada la disposicion correcta (ver schema:
 * validate_attempt rellena disposition_id/snapshots a partir del canal).
 */
export async function closeCall(input: CloseCallInput, userId: number) {
  return withTransaction(userId, async (trx) => {
    const attempt = await trx
      .selectFrom('call_attempts')
      .select(['attempt_id', 'campaign_id', 'agent_id', 'state','client_id','contact_id'])
      .where('attempt_id', '=', input.attemptId)
      .forUpdate()
      .executeTakeFirst();

    if (!attempt) throw new AppError(404, 'Intento de llamada no encontrado.', 'ATTEMPT_NOT_FOUND');
    if (attempt.agent_id !== input.agentId) {
      throw new AppError(403, 'No puedes cerrar una llamada de otro agente.', 'FORBIDDEN');
    }
    if (attempt.state === 'closed') {
      throw new AppError(409, 'Este intento ya esta cerrado.', 'ALREADY_CLOSED');
    }

    let channelCode=input.channelCode;
    if(input.newData) {
      const current=await trx.selectFrom('clients').select('razon_social').where('client_id','=',attempt.client_id).forUpdate().executeTakeFirstOrThrow();
      const changed=input.newData.businessName!==undefined && input.newData.businessName!==current.razon_social;
      if(changed) channelCode='NUEVOS_DATOS_RAZON_SOCIAL';
      else if(channelCode!=='NUEVOS_DATOS') throw new AppError(400,'Usa NUEVOS_DATOS para actualizar teléfono o correo.','INVALID_CHANNEL');
      if(changed) await trx.updateTable('clients').set({razon_social:input.newData.businessName}).where('client_id','=',attempt.client_id).execute();
      if(input.newData.phone || input.newData.email) {
        if(!attempt.contact_id) throw new AppError(400,'Selecciona la persona de contacto.','CONTACT_REQUIRED');
        if(input.newData.phone) {
          await trx.updateTable('phone_numbers').set({is_active:false}).where('contact_id','=',attempt.contact_id).where('type','=','main').execute();
          await trx.insertInto('phone_numbers').values({contact_id:attempt.contact_id,type:'main',number:input.newData.phone,normalized_number:input.newData.phone.replace(/\D/g,'')}).onConflict(oc=>oc.columns(['contact_id','number','extension','type']).doUpdateSet({is_active:true})).execute();
        }
        if(input.newData.email) {
          await trx.updateTable('email_addresses').set({is_active:false}).where('contact_id','=',attempt.contact_id).execute();
          await trx.insertInto('email_addresses').values({contact_id:attempt.contact_id,email:input.newData.email}).onConflict(oc=>oc.columns(['contact_id','email']).doUpdateSet({is_active:true})).execute();
        }
      }
    }
    const channel = await trx
      .selectFrom('channels')
      .select(['channel_id'])
      .where('campaign_id', '=', attempt.campaign_id)
      .where('code', '=', channelCode).where('is_active','=',true)
      .executeTakeFirst();
    if (!channel) {
      throw new AppError(400, `Canalizacion "${input.channelCode}" no existe para esta campana.`, 'INVALID_CHANNEL');
    }

    /* Complete the survey before setting the end timestamp. */
    if (input.survey) {
      await upsertSurveyForAttempt(trx, { attemptId: input.attemptId, campaignId: attempt.campaign_id, versionId: input.survey.versionId, declined: input.survey.declined, answers: input.survey.answers ?? [] });
    }
    await trx
      .updateTable('call_attempts')
      .set({
        state: 'closed',
        call_end: sql<Date>`clock_timestamp()`,
        channel_id: channel.channel_id,
        notes: input.notes ?? null,
      })
      .where('attempt_id', '=', input.attemptId)
      .execute();


    // NOTA: los triggers CONSTRAINT ... DEFERRABLE (survey_integrity,
    // answer_integrity, attempt_survey_integrity) corren hasta el COMMIT
    // de withTransaction. Si falta una respuesta obligatoria o la llamada
    // se cierra sin resolver la encuesta pendiente, la transaccion entera
    // truena aqui y el error llega ya traducido por translatePgError.
    return { attemptId: input.attemptId };
  });
}

async function upsertSurveyForAttempt(
  trx: Parameters<Parameters<typeof withTransaction>[1]>[0],
  opts: {
    attemptId: number;
    campaignId: number;
    versionId: number;
    declined: boolean;
    answers: SurveyAnswerInput[];
  },
) {
  const existing = await trx
    .selectFrom('call_surveys')
    .select(['survey_id','version_id'])
    .where('attempt_id', '=', opts.attemptId)
    .executeTakeFirst();

  if(existing && existing.version_id!==opts.versionId) throw new AppError(409,'La encuesta corresponde a otra versión.','SURVEY_VERSION_CONFLICT');
  const survey =
    existing ??
    (await trx
      .insertInto('call_surveys')
      .values({
        attempt_id: opts.attemptId,
        campaign_id: opts.campaignId,
        version_id: opts.versionId,
        state: 'pending',
      })
      .returning(['survey_id'])
      .executeTakeFirstOrThrow());

  if (opts.declined) {
    await trx
      .updateTable('call_surveys')
      .set({ state: 'declined', completed_at: sql<Date>`clock_timestamp()` })
      .where('survey_id', '=', survey.survey_id)
      .execute();
    return;
  }

  for (const answer of opts.answers) {
    await trx
      .insertInto('survey_answers')
      .values({
        survey_id: survey.survey_id,
        version_id: opts.versionId,
        question_id: answer.questionId,
        option_id: answer.optionId ?? null,
        answer_text: answer.answerText ?? null,
      })
      .onConflict((oc) =>
        oc.columns(['survey_id', 'question_id']).doUpdateSet({
          option_id: (eb) => eb.ref('excluded.option_id'),
          answer_text: (eb) => eb.ref('excluded.answer_text'),
        }),
      )
      .execute();
  }

  await trx
    .updateTable('call_surveys')
    .set({ state: 'completed', completed_at: sql<Date>`clock_timestamp()` })
    .where('survey_id', '=', survey.survey_id)
    .execute();
}
