import { sql } from 'kysely';
import { withTransaction } from '../../db/withTransaction.js';
import { AppError } from '../../utils/errors.js';

interface StartRoundInput {
  campaignId: number;
  agentId: number;
  name: string;
  expectedRoundId: number | null;
}

export async function startWorkRound(
  input: StartRoundInput,
  adminId: number,
) {
  return withTransaction(adminId, async trx => {
    // Coordinar con importaciones e inicio de llamadas.
    await sql`
      SELECT pg_advisory_xact_lock(${input.campaignId})
    `.execute(trx);

    await sql`
      SELECT pg_advisory_xact_lock(${input.agentId})
    `.execute(trx);

    const campaign = await trx
      .selectFrom('campaigns')
      .select('campaign_id')
      .where('campaign_id', '=', input.campaignId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    const agent = await trx
      .selectFrom('users')
      .select('user_id')
      .where('user_id', '=', input.agentId)
      .where('role', '=', 'agent')
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!campaign || !agent) {
      throw new AppError(
        400,
        'Selecciona una campaña y un agente activos.',
        'INVALID_ROUND_TARGET',
      );
    }

    const name = input.name.trim();

    if (!name || name.length > 150) {
      throw new AppError(
        400,
        'El nombre de la ronda debe tener entre 1 y 150 caracteres.',
        'INVALID_ROUND_NAME',
      );
    }

    const currentRound = await trx
      .selectFrom('work_rounds')
      .select('round_id')
      .where('campaign_id', '=', input.campaignId)
      .where('agent_id', '=', input.agentId)
      .where('ended_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();

    if ((currentRound?.round_id ?? null) !== input.expectedRoundId) {
      throw new AppError(
        409,
        'La ronda cambió. Consulta nuevamente el resumen.',
        'ROUND_CHANGED',
      );
    }

    const openCall = await trx
      .selectFrom('call_attempts')
      .select('attempt_id')
      .where('agent_id', '=', input.agentId)
      .where('state', '=', 'open')
      .executeTakeFirst();

    if (openCall) {
      throw new AppError(
        409,
        'El agente debe cerrar su llamada abierta antes de habilitar otra ronda.',
        'OPEN_CALL_EXISTS',
      );
    }

    const eligible = await trx
      .selectFrom('contact_assignments as a')
      .innerJoin('clients as c', 'c.client_id', 'a.client_id')
      .select([
        'a.assignment_id',
        'a.client_id',
        'a.contact_id',
      ])
      .where('a.campaign_id', '=', input.campaignId)
      .where('a.agent_id', '=', input.agentId)
      .where('a.ended_at', 'is', null)
      .where('c.is_active', '=', true)
      .where(eb => eb.not(eb.exists(eb.selectFrom('contact_finalizations as f').select('f.attempt_id')
        .whereRef('f.client_id', '=', 'a.client_id').whereRef('f.campaign_id', '=', 'a.campaign_id'))))
      .where(eb =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('contact_blacklist as b')
              .select('b.blacklist_id')
              .whereRef('b.client_id', '=', 'a.client_id')
              .whereRef('b.campaign_id', '=', 'a.campaign_id')
              .where('b.ended_at', 'is', null),
          ),
        ),
      )
      .forUpdate()
      .execute();

    const clock = await sql<{ timestamp: string }>`
      SELECT clock_timestamp()::text AS timestamp
    `.execute(trx);

    const timestamp = clock.rows[0]!.timestamp;
    const roundTime = sql<Date>`${timestamp}::timestamptz`;

    if (currentRound) {
      await trx
        .updateTable('work_rounds')
        .set({ ended_at: roundTime })
        .where('round_id', '=', currentRound.round_id)
        .execute();
    }

    const newRound = await trx
      .insertInto('work_rounds')
      .values({
        campaign_id: input.campaignId,
        agent_id: input.agentId,
        name,
        started_at: roundTime,
        created_by_user_id: adminId,
      })
      .returning(['round_id', 'name'])
      .executeTakeFirstOrThrow();

    for (const assignment of eligible) {
      await trx
        .updateTable('contact_assignments')
        .set({ ended_at: roundTime })
        .where('assignment_id', '=', assignment.assignment_id)
        .execute();

      await trx
        .insertInto('contact_assignments')
        .values({
          client_id: assignment.client_id,
          contact_id: assignment.contact_id,
          campaign_id: input.campaignId,
          agent_id: input.agentId,
          round_id: newRound.round_id,
          started_at: roundTime,
        })
        .execute();
    }

    return {
      round: newRound,
      enabledContacts: eligible.length,
    };
  });
}