import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema-types.js';
import { withTransaction } from '../../db/withTransaction.js';
import { AppError } from '../../utils/errors.js';

// BASE contiene clientes; DATOS se consulta únicamente para resolver sucursales.
const COLUMN_MAP = {
  clave: 'CLAVE',
  marca: 'MARCA',
  tipoCompra: 'TIPO DE COMPRA',
  razonSocial: 'RAZON SOCIAL',
  sucursal: 'SUCURSAL',
  nombreContacto: 'CONTACTO',
  ejecutivo: 'EJECUTIVO',
  telefonoPrincipal: 'TEL',
  telefonoRef1: 'REF1',
  telefonoRef2: 'REF2',
  celular: 'CELULAR',
  email: 'CORREO',
  extension:'EXT',
  status: 'STATUS',
  nuevoNumero: 'NUEVO NUMERO',
  nuevoCorreo: 'NUEVO CORREO',
  nuevoContacto: 'NUEVO CONTACTO',
} as const;

interface ImportSummary {
  importId: number;
  rowsProcessed: number;
  imported: number;
  duplicate: number;
  rejected: number;
  updated: number;
  blacklisted: number;
  finalized: number;
  skipped: number;
  issues: { row: number; message: string }[];
}

export async function importContactsFromExcel(opts: {
  fileBuffer: Buffer;
  fileName: string;
  campaignId: number;
  userId: number;
  agentId: number;
  sheetName?: string;
}): Promise<ImportSummary> {
  const fileSha256 = crypto.createHash('sha256').update(opts.fileBuffer).digest('hex');

  const workbook = new ExcelJS.Workbook();
  // Los tipos de ExcelJS a veces no calzan exacto con la version de
  // @types/node instalada (discrepancia estructural de Buffer, no un
  // problema real en tiempo de ejecucion).
  await workbook.xlsx.load(Buffer.from(opts.fileBuffer) as unknown as ExcelJS.Buffer);
  const sheet = opts.sheetName ? workbook.getWorksheet(opts.sheetName) : workbook.getWorksheet('BASE');
  if (!sheet) {
    throw new AppError(400, 'El archivo no tiene hojas legibles.', 'EMPTY_WORKBOOK');
  }

  const headerRow = sheet.getRow(1).values as (string | undefined)[];
  const colIndex = (label: string) => headerRow.findIndex((v) => normalizeLabel(cellToString(v) ?? '') === label);

  const idx = {
    clave: colIndex(COLUMN_MAP.clave),
    marca: colIndex(COLUMN_MAP.marca),
    tipoCompra: colIndex(COLUMN_MAP.tipoCompra),
    razonSocial: colIndex(COLUMN_MAP.razonSocial),
    sucursal: colIndex(COLUMN_MAP.sucursal),
    nombreContacto: colIndex(COLUMN_MAP.nombreContacto),
    ejecutivo: colIndex(COLUMN_MAP.ejecutivo),
    telefonoPrincipal: colIndex(COLUMN_MAP.telefonoPrincipal),
    telefonoRef1: colIndex(COLUMN_MAP.telefonoRef1),
    telefonoRef2: colIndex(COLUMN_MAP.telefonoRef2),
    celular: colIndex(COLUMN_MAP.celular),
    email: colIndex(COLUMN_MAP.email),
    extension:colIndex(COLUMN_MAP.extension),
    status: colIndex(COLUMN_MAP.status),
    nuevoNumero: colIndex(COLUMN_MAP.nuevoNumero),
    nuevoCorreo: colIndex(COLUMN_MAP.nuevoCorreo),
    nuevoContacto: colIndex(COLUMN_MAP.nuevoContacto),
  };

  if ([idx.clave,idx.razonSocial,idx.telefonoPrincipal,idx.nombreContacto,idx.email].some(i=>i===-1)) {
    throw new AppError(
      400,
      `La hoja BASE debe incluir CLAVE, RAZON SOCIAL, TEL, CONTACTO y CORREO.`,
      'MISSING_COLUMN',
    );
  }

  // Relación de clientes y sucursales del formato SILIMEX.
const branchNameByCode = new Map<string, string>();
const branchCodeByClient = new Map<string, string>();

const normalizeKey = (value: string) => value.trim().toUpperCase();
const dataSheet = workbook.getWorksheet('DATOS');

if (dataSheet) {
  const header = (column: number) =>
    normalizeKey(cellToString(dataSheet.getCell(1, column).value) ?? '');

  // Verificamos la estructura antes de interpretar sus columnas.
  const matchesSilimexLayout =
    header(1) === 'CLAVE' &&
    header(14) === 'CLAVE' &&
    header(16) === 'CLAVE' &&
    ['SUC', 'SUCURSAL'].includes(header(17));

  if (matchesSilimexLayout) {
    for (let rowNumber = 2; rowNumber <= dataSheet.rowCount; rowNumber++) {
      const row = dataSheet.getRow(rowNumber);

      // P:Q contiene el catálogo independiente de sucursales.
      const catalogCode = cellToString(row.getCell(16).value);
      const branchName = cellToString(row.getCell(17).value);

      if (catalogCode && branchName) {
        const code = normalizeKey(catalogCode);
        const previousName = branchNameByCode.get(code);

        if (previousName && previousName !== branchName) {
          throw new AppError(
            400,
            `La sucursal ${code} tiene nombres distintos en DATOS.`,
            'BRANCH_NAME_CONFLICT',
          );
        }

        branchNameByCode.set(code, branchName);
      }

      // A identifica al cliente; O contiene su código de sucursal.
      const clientKey = cellToString(row.getCell(1).value);
      const branchCode = cellToString(row.getCell(15).value);

      if (clientKey && branchCode) {
        const key = normalizeKey(clientKey);
        const code = normalizeKey(branchCode);
        const previousCode = branchCodeByClient.get(key);

        if (previousCode && previousCode !== code) {
          throw new AppError(
            400,
            `El cliente ${key} tiene sucursales distintas en DATOS.`,
            'CLIENT_BRANCH_CONFLICT',
          );
        }

        branchCodeByClient.set(key, code);
      }
    }
  }
}

  return withTransaction(opts.userId, async (trx) => {
    const schema = await sql<{ready: boolean}>`SELECT EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='contact_blacklist' AND column_name='import_detail_id'
    ) AS ready`.execute(trx);
    if (!schema.rows[0]?.ready) {
      throw new AppError(409, 'Falta aplicar la migración 002_import_blacklist.sql en PostgreSQL antes de importar.', 'IMPORT_MIGRATION_REQUIRED');
    }
    await trx.selectFrom('contact_finalizations').select('attempt_id').limit(1).execute();
    const agent=await trx.selectFrom('users').select('user_id').where('user_id','=',opts.agentId).where('role','=','agent').where('is_active','=',true).executeTakeFirst();
    if(!agent) throw new AppError(400,'Selecciona un agente activo.','INVALID_AGENT');
    // Un solo intento por (campana, hash de archivo) puede llegar a 'success'.
    // El indice unico parcial uq_successful_import lo garantiza; aqui damos
    // un mensaje mas claro antes de dejar que truene el insert.
    await sql`SELECT pg_advisory_xact_lock(${opts.campaignId})`.execute(trx);
    const workRound = await trx
      .selectFrom('work_rounds')
      .select('round_id')
      .where('campaign_id', '=', opts.campaignId)
      .where('agent_id', '=', opts.agentId)
      .where('ended_at', 'is', null)
      .where(sql<boolean>`started_at <= CURRENT_TIMESTAMP`)
      .forUpdate()
      .executeTakeFirst();

    if (!workRound) {
      throw new AppError(
        409,
        'El agente no tiene una ronda activa para esta campaña. Habilita una ronda antes de importar.',
        'NO_ACTIVE_ROUND',
      );
    }
    const already = await trx
      .selectFrom('import_log')
      .select('import_id')
      .where('campaign_id', '=', opts.campaignId)
      .where('file_sha256', '=', fileSha256)
      .where('result', '=', 'success')
      .executeTakeFirst();
    if (already) {
      throw new AppError(409, 'Este archivo ya fue importado exitosamente para esta campana.', 'DUPLICATE_IMPORT');
    }

    const importLog = await trx
      .insertInto('import_log')
      .values({
        file_name: opts.fileName,
        file_sha256: fileSha256,
        user_id: opts.userId,
        campaign_id: opts.campaignId,
        rows_processed: 0,
        result: 'pending',
      })
      .returning(['import_id'])
      .executeTakeFirstOrThrow();

    const sourceNamespace = await namespaceForCampaign(trx, opts.campaignId);

    let updated = 0;
    let blacklisted = 0;
    let finalizedCount = 0;
    let skipped = 0;
    const issues: { row: number; message: string }[] = [];
    const seenKeys = new Set<string>();
    let imported = 0;
    let duplicate = 0;
    let rejected = 0;
    let rowsProcessed = 0;

    const lastRow = sheet.rowCount;
    for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const values = row.values as unknown[];
      const cell = (i: number) => (i > 0 ? values[i] : undefined);

      if (values.every(v => v === null || v === undefined || v === '')) continue;
      {
        const normalizeLabel = (value: unknown) =>
          typeof value === 'string' ? value.trim().toUpperCase() : '';
        const  isBranchDirectoryRow =
          normalizeLabel(cell(idx.marca)) === 'SUCURSAL' ||
          normalizeLabel(cell(idx.tipoCompra)) === 'SUCURSAL';

        if (isBranchDirectoryRow) {
          skipped++;
          continue;
        }
        rowsProcessed++;
      }
      const sourceData = Object.fromEntries(
        Object.entries(idx).map(([key, i]) => [key, cell(i) ?? null]),
      );

      await sql`SAVEPOINT import_row`.execute(trx);
      try {
        const clave=cellToString(cell(idx.clave))?.toUpperCase();
        if(!clave) throw new AppError(400,'Falta CLAVE.','MISSING_CLIENT_KEY');
        if (seenKeys.has(clave)) throw new AppError(400,'CLAVE repetida dentro de BASE; conserva una sola fila por cliente.','DUPLICATE_KEY');
        const status = normalizeLabel(cellToString(cell(idx.status)) ?? '');
        if (!['', 'BLACKLIST', 'NUEVOS DATOS'].includes(status)) {
          throw new AppError(400, `STATUS no reconocido: ${status}.`, 'INVALID_STATUS');
        }
        sourceData.status = status;
        const newPhone = cellToString(cell(idx.nuevoNumero));
        const newEmail = cellToString(cell(idx.nuevoCorreo));
        const newName = cellToString(cell(idx.nuevoContacto));
        if (newPhone && (!normalizePhone(newPhone) || newPhone.length > 40 || !/^[+\d\s().-]+$/.test(newPhone))) {
          throw new AppError(400,'NUEVO NUMERO debe contener un teléfono de al menos 10 dígitos, sin correos ni instrucciones.','INVALID_NEW_PHONE');
        }
        const newEmails = newEmail ? splitEmails(newEmail) : [];
        if (newEmail && (!newEmails.length || newEmails.some(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
          throw new AppError(400,'NUEVO CORREO contiene una dirección no válida.','INVALID_NEW_EMAIL');
        }
        const razonSocial = cellToString(cell(idx.razonSocial));
        const explicitBranch = cellToString(cell(idx.sucursal));
        const branchCode = branchCodeByClient.get(normalizeKey(clave));
        const mappedBranch = branchCode
          ? branchNameByCode.get(branchCode)
          : undefined;

        if (branchCode && !mappedBranch) {
          throw new AppError(
            400,
            `La sucursal ${branchCode} del cliente ${clave} no está en el catálogo.`,
            'UNKNOWN_BRANCH',
          );
        }

        const sucursal = mappedBranch
          ?? (explicitBranch
            ? branchNameByCode.get(normalizeKey(explicitBranch)) ?? explicitBranch
            : null);
        const existingClient = await trx
          .selectFrom('clients')
          .select(['client_id','razon_social','sucursal','marca','tipo_compra'])
          .where('source_namespace', '=', sourceNamespace)
          .where('clave', '=', clave)
          .executeTakeFirst();

        const client =
          existingClient ??
          (await trx
            .insertInto('clients')
            .values({
              source_namespace: sourceNamespace,
              clave,
              marca: cellToString(cell(idx.marca)),
              tipo_compra: cellToString(cell(idx.tipoCompra)),
              razon_social: razonSocial,
              sucursal: sucursal,
            })
            .returning(['client_id'])
            .executeTakeFirstOrThrow());

        const isNewClient = !existingClient;

        if (existingClient && existingClient.razon_social !== razonSocial) throw new AppError(409,'La razón social cambió; registra el cambio desde una llamada.','BUSINESS_NAME_CHANGED');
        // Si ya existia, refrescamos los campos "descriptivos" (no historicos).
        if (existingClient) {
          await trx
            .updateTable('clients')
            .set({
              marca: cellToString(cell(idx.marca)) ?? existingClient.marca,
              tipo_compra: cellToString(cell(idx.tipoCompra)) ?? existingClient.tipo_compra,
              razon_social: razonSocial,
              sucursal: sucursal ?? existingClient.sucursal,
            })
            .where('client_id', '=', client.client_id)
            .execute();
        }

        // La asignación identifica a la persona aunque su nombre se haya corregido.
        const assignment = await trx.selectFrom('contact_assignments')
          .select(['agent_id', 'round_id', 'contact_id'])
          .where('client_id', '=', client.client_id).where('campaign_id', '=', opts.campaignId)
          .where('ended_at', 'is', null).executeTakeFirst();
        if (assignment && assignment.agent_id !== opts.agentId) {
          throw new AppError(409, 'Contacto asignado a otro agente.', 'ASSIGNMENT_CONFLICT');
        }
        // El bloqueo existente nunca se elimina por reimportar una fila sin STATUS.
        const block = await trx.selectFrom('contact_blacklist').select('blacklist_id')
          .where('client_id', '=', client.client_id).where('campaign_id', '=', opts.campaignId)
          .where('ended_at', 'is', null).executeTakeFirst();
        const finalized = await trx.selectFrom('contact_finalizations').select('attempt_id')
          .where('client_id', '=', client.client_id).where('campaign_id', '=', opts.campaignId).executeTakeFirst();
        if (assignment && assignment.round_id !== workRound.round_id && !block && !finalized && status !== 'BLACKLIST') {
          throw new AppError(409,'La asignación no pertenece a la ronda activa.','ASSIGNMENT_ROUND_CONFLICT');
        }
        const previous = await trx.selectFrom('import_detail').select('source_data')
          .where('client_id', '=', client.client_id).where('result', '!=', 'rejected')
          .orderBy('detail_id', 'desc').executeTakeFirst();
        const previousData = previous?.source_data as Record<string, unknown> | undefined;
        // Un Excel antiguo no debe deshacer una corrección hecha después en la app.
        const applyPhone = !!newPhone && cellToString(previousData?.nuevoNumero) !== newPhone;
        const applyEmail = !!newEmail && cellToString(previousData?.nuevoCorreo) !== newEmail;
        const applyName = !!newName && cellToString(previousData?.nuevoContacto) !== newName;
        const nombreContacto = cellToString(cell(idx.nombreContacto));
        const sourceContactId = assignment?.contact_id ??
          (typeof previousData?.contactId === 'number' ? previousData.contactId : null);
        const existingContact = sourceContactId
          ? await trx.selectFrom('contact_persons').select('contact_id')
              .where('contact_id', '=', sourceContactId).where('client_id', '=', client.client_id).executeTakeFirst()
          : await trx.selectFrom('contact_persons').select('contact_id')
              .where('client_id', '=', client.client_id)
              .where('nombre', nombreContacto === null ? 'is' : '=', nombreContacto)
              .orderBy('contact_id').executeTakeFirst();
        const contact = existingContact ?? await trx.insertInto('contact_persons').values({
          client_id: client.client_id, nombre: nombreContacto,
          ejecutivo: cellToString(cell(idx.ejecutivo)),
        }).returning('contact_id').executeTakeFirstOrThrow();
        const contactId = contact.contact_id;
        sourceData.contactId = contactId;
        const newContactCreated = !existingContact;
        if (applyName) await trx.updateTable('contact_persons').set({nombre: newName})
          .where('contact_id', '=', contactId).execute();
        // BASE original solo inicializa la persona; no resucita teléfonos retirados.
        if (newContactCreated) {
          await upsertPhone(trx, contactId, 'main', cellToString(cell(idx.telefonoPrincipal)), cellToString(cell(idx.extension)) ?? '');
          await upsertPhone(trx, contactId, 'reference1', cellToString(cell(idx.telefonoRef1)));
          await upsertPhone(trx, contactId, 'reference2', cellToString(cell(idx.telefonoRef2)));
          await upsertPhone(trx, contactId, 'mobile', cellToString(cell(idx.celular)));
          const email = cellToString(cell(idx.email));
          if (email) for (const address of splitEmails(email)) {
            await trx.insertInto('email_addresses').values({contact_id: contactId, email: address})
              .onConflict(oc => oc.columns(['contact_id','email']).doNothing()).execute();
          }
        }
        if (applyPhone && newPhone) {
          await trx.updateTable('phone_numbers').set({is_active: false})
            .where('contact_id','=',contactId).where('type','=','main').where('is_active','=',true).execute();
          await trx.insertInto('phone_numbers').values({contact_id: contactId, type: 'main',
            number: newPhone, extension: '', normalized_number: normalizePhone(newPhone)})
            .onConflict(oc => oc.columns(['contact_id','number','extension','type']).doUpdateSet({is_active: true})).execute();
        }
        if (applyEmail && newEmail) {
          await trx.updateTable('email_addresses').set({is_active: false})
            .where('contact_id','=',contactId).where('is_active','=',true).execute();
          for (const address of newEmails) {
            await trx.insertInto('email_addresses').values({contact_id: contactId, email: address})
              .onConflict(oc => oc.columns(['contact_id','email']).doUpdateSet({is_active: true})).execute();
          }
        }
        if (!assignment && !block && !finalized) await trx.insertInto('contact_assignments').values({
          client_id: client.client_id, contact_id: contactId, campaign_id: opts.campaignId,
          agent_id: opts.agentId, round_id: workRound.round_id,
        }).execute();
        const changed = newContactCreated || applyName || applyEmail || applyPhone ||
          (!!existingClient && !!sucursal && sucursal !== existingClient.sucursal);
        const detail = await trx
          .insertInto('import_detail')
          .values({
            import_id: importLog.import_id,
            sheet_name: sheet.name,
            row_number: rowNumber,
            source_data: JSON.stringify(sourceData),
            client_id: client.client_id,
            result: isNewClient || changed ? 'imported' : 'duplicate',
          })
          .returning('detail_id').executeTakeFirstOrThrow();
        if (status === 'BLACKLIST' && !block) {
          await trx.insertInto('contact_blacklist').values({
            client_id: client.client_id, campaign_id: opts.campaignId,
            import_detail_id: detail.detail_id,
            reason: 'BLACKLIST importado de BASE (sin fecha histórica de bloqueo)',
          }).execute();
        }
        if (isNewClient || changed) imported++;
        else duplicate++;
        if (!isNewClient && changed) updated++;
        if (block || status === 'BLACKLIST') blacklisted++;
        if (finalized) finalizedCount++;
        seenKeys.add(clave);
        await sql`RELEASE SAVEPOINT import_row`.execute(trx);
      } catch (err) {
        await sql`ROLLBACK TO SAVEPOINT import_row`.execute(trx);
        await sql`RELEASE SAVEPOINT import_row`.execute(trx);
        rejected++;
        if (issues.length < 50) issues.push({row: rowNumber, message: err instanceof Error ? err.message : 'Error desconocido'});
        await trx
          .insertInto('import_detail')
          .values({
            import_id: importLog.import_id,
            sheet_name: sheet.name,
            row_number: rowNumber,
            source_data: JSON.stringify(sourceData),
            result: 'rejected',
            error_message: err instanceof Error ? err.message : 'Error desconocido',
          })
          .execute();
      }
    }

    const result = rejected === 0 ? 'success' : rowsProcessed === rejected ? 'error' : 'partial';
    await trx
      .updateTable('import_log')
      .set({ rows_processed: rowsProcessed, result })
      .where('import_id', '=', importLog.import_id)
      .execute();

    return { importId: importLog.import_id, rowsProcessed, imported, duplicate, rejected, updated, blacklisted, finalized: finalizedCount, skipped, issues };
  });
}

/**
 * Distribuye entre agentes los clientes de una campana que aun no tienen una
 * asignacion activa (uq_active_assignment exige que sea a lo mas una por
 * cliente+campana). Reparto round-robin simple para parejo entre agentes.
 */
export async function distributeContacts(opts: {
  campaignId: number;
  agentIds: number[];
  userId: number;
}): Promise<{ assigned: number }> {
  if (opts.agentIds.length === 0) {
    throw new AppError(400, 'Selecciona al menos un agente para repartir.', 'NO_AGENTS');
  }

  return withTransaction(opts.userId, async (trx) => {
    await sql`SELECT pg_advisory_xact_lock(${opts.campaignId})`.execute(trx);
    const activeRounds = await trx
      .selectFrom('work_rounds')
      .select(['round_id', 'agent_id'])
      .where('campaign_id', '=', opts.campaignId)
      .where('agent_id', 'in', opts.agentIds)
      .where('ended_at', 'is', null)
      .where(sql<boolean>`started_at <= CURRENT_TIMESTAMP`)
      .forUpdate()
      .execute();

    const roundByAgent = new Map(
      activeRounds.map(round => [round.agent_id, round.round_id])
    );

    if (opts.agentIds.some(agentId => !roundByAgent.has(agentId))) {
      throw new AppError(
        409,
        'Todos los agentes seleccionados deben tener una ronda activa en esta campaña.',
        'NO_ACTIVE_ROUND',
      );
    }
    const namespace = await namespaceForCampaign(trx, opts.campaignId);
    const unassigned = await trx
      .selectFrom('clients as c')
      .select('c.client_id')
      .where('c.is_active', '=', true)
      .where(eb => eb.not(eb.exists(eb.selectFrom('contact_finalizations as f').select('f.attempt_id')
        .whereRef('f.client_id', '=', 'c.client_id').where('f.campaign_id', '=', opts.campaignId))))
      .where('c.source_namespace', '=', namespace)
      .where(eb => eb.not(eb.exists(eb.selectFrom('contact_blacklist as b').select('b.blacklist_id').whereRef('b.client_id', '=', 'c.client_id').where('b.campaign_id', '=', opts.campaignId).where('b.ended_at', 'is', null))))
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('contact_assignments as ca')
              .select('ca.assignment_id')
              .whereRef('ca.client_id', '=', 'c.client_id')
              .where('ca.campaign_id', '=', opts.campaignId)
              .where('ca.ended_at', 'is', null),
          ),
        ),
      )
      .execute();

    let i = 0;
    for (const row of unassigned) {
      const agentId = opts.agentIds[i % opts.agentIds.length]!;
      const roundId = roundByAgent.get(agentId)!;

      if (roundId === undefined) {
        throw new AppError(
          400,
          'No se encontró la ronda del agente',
          'NO_ACTIVE_ROUND',
        );
      }

      await trx
        .insertInto('contact_assignments')
        .values({ 
          client_id: row.client_id, 
          campaign_id: opts.campaignId, 
          agent_id: agentId, 
          round_id: roundId
        })
        .execute();
      i++;
    }

    return { assigned: unassigned.length };
  });
}

async function namespaceForCampaign(trx: Kysely<Database>, campaignId: number): Promise<string> {
  const campaign = await trx
    .selectFrom('campaigns')
    .select('name')
    .where('campaign_id', '=', campaignId)
    .executeTakeFirst();
  if (!campaign) throw new AppError(404, 'Campana no encontrada.', 'CAMPAIGN_NOT_FOUND');
  // Asuncion de diseno: cada campana es su propio espacio de claves porque
  // PARTNER DELL y SILIMEX vienen de fuentes de datos distintas. Ajusta si
  // en realidad comparten un mismo universo de clientes con la misma CLAVE.
  return `campaign:${campaign.name}`;
}

async function upsertPhone(trx: Kysely<Database>, contactId: number, type: string, number: string | null, extension = '') {
  if (!number) return;
  await trx
    .insertInto('phone_numbers')
    .values({
      contact_id: contactId,
      type: type as 'main' | 'reference1' | 'reference2' | 'mobile' | 'other',
      number,
      extension,
      normalized_number: normalizePhone(number),
    })
    .onConflict((oc) => oc.columns(['contact_id', 'number', 'extension', 'type']).doNothing())
    .execute();
}

// Normalizacion basica MX: deja solo digitos y toma los ultimos 10.
// Ajustar si manejan numeros internacionales.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

function cellToString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v !== null && 'text' in (v as Record<string, unknown>)) {
    return String((v as { text: unknown }).text).trim() || null;
  }
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map(part => String(part.text ?? '')).join('').trim() || null;
    if ('result' in v) return cellToString((v as { result: unknown }).result);
    throw new AppError(400, 'Celda sin valor legible; recalcula y guarda el Excel.', 'INVALID_CELL');
  }
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeLabel(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
}

function splitEmails(value: string): string[] {
  return [...new Set(value.split(/[\/;,\r\n]+/).map(email => email.trim()).filter(Boolean))];
}
