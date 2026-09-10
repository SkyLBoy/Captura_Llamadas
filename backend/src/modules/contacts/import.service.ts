import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema-types.js';
import { withTransaction } from '../../db/withTransaction.js';
import { AppError } from '../../utils/errors.js';

/**
 * IMPORTANTE - ajustar a tu layout real de Excel:
 * No tengo el archivo real de bases de contactos, asi que este mapeo de
 * columnas es un punto de partida razonable segun los campos que ya existen
 * en `clients` / `contact_persons` / `phone_numbers` / `email_addresses`.
 * Cambia `COLUMN_MAP` para que calce con los encabezados reales de tus
 * archivos de PARTNER DELL y SILIMEX (pueden incluso diferir entre campanas;
 * en ese caso separa esta funcion en dos variantes).
 */
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
} as const;

interface ImportSummary {
  importId: number;
  rowsProcessed: number;
  imported: number;
  duplicate: number;
  rejected: number;
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
  const colIndex = (label: string) => headerRow.findIndex((v) => (v ?? '').toString().trim().toUpperCase() === label);

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
  };

  if ([idx.clave,idx.razonSocial,idx.telefonoPrincipal,idx.nombreContacto,idx.email].some(i=>i===-1)) {
    throw new AppError(
      400,
      `La hoja BASE debe incluir CLAVE, RAZON SOCIAL, TEL, CONTACTO y CORREO.`,
      'MISSING_COLUMN',
    );
  }

  return withTransaction(opts.userId, async (trx) => {
    const agent=await trx.selectFrom('users').select('user_id').where('user_id','=',opts.agentId).where('role','=','agent').where('is_active','=',true).executeTakeFirst();
    if(!agent) throw new AppError(400,'Selecciona un agente activo.','INVALID_AGENT');
    // Un solo intento por (campana, hash de archivo) puede llegar a 'success'.
    // El indice unico parcial uq_successful_import lo garantiza; aqui damos
    // un mensaje mas claro antes de dejar que truene el insert.
    await sql`SELECT pg_advisory_xact_lock(${opts.campaignId})`.execute(trx);
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
      rowsProcessed++;
      const sourceData = Object.fromEntries(
        Object.entries(idx).map(([key, i]) => [key, cell(i) ?? null]),
      );

      await sql`SAVEPOINT import_row`.execute(trx);
      try {
        const clave=cellToString(cell(idx.clave));
        if(!clave) throw new AppError(400,'Falta CLAVE.','MISSING_CLIENT_KEY');
        const razonSocial = cellToString(cell(idx.razonSocial));
        const existingClient = await trx
          .selectFrom('clients')
          .select(['client_id','razon_social'])
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
              sucursal: cellToString(cell(idx.sucursal)),
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
              marca: cellToString(cell(idx.marca)),
              tipo_compra: cellToString(cell(idx.tipoCompra)),
              razon_social: razonSocial,
              sucursal: cellToString(cell(idx.sucursal)),
            })
            .where('client_id', '=', client.client_id)
            .execute();
        }

        const nombreContacto = cellToString(cell(idx.nombreContacto));
        let contactId: number | null = null;
        let newContactCreated=false;
        {
          const existingContact = await trx
            .selectFrom('contact_persons')
            .select('contact_id')
            .where('client_id', '=', client.client_id)
            .where('nombre', nombreContacto === null ? 'is' : '=', nombreContacto)
            .executeTakeFirst();

          const contact =
            existingContact ??
            (await trx
              .insertInto('contact_persons')
              .values({
                client_id: client.client_id,
                nombre: nombreContacto,
                ejecutivo: cellToString(cell(idx.ejecutivo)),
              })
              .returning(['contact_id'])
              .executeTakeFirstOrThrow());
          contactId = contact.contact_id;
          newContactCreated=!existingContact;

          await upsertPhone(trx, contact.contact_id, 'main', cellToString(cell(idx.telefonoPrincipal)),cellToString(cell(idx.extension))??'');
          await upsertPhone(trx, contact.contact_id, 'reference1', cellToString(cell(idx.telefonoRef1)));
          await upsertPhone(trx, contact.contact_id, 'reference2', cellToString(cell(idx.telefonoRef2)));
          await upsertPhone(trx, contact.contact_id, 'mobile', cellToString(cell(idx.celular)));

          const email = cellToString(cell(idx.email));
          if (email) {
            await trx
              .insertInto('email_addresses')
              .values({ contact_id: contact.contact_id, email })
              .onConflict((oc) => oc.columns(['contact_id', 'email']).doNothing())
              .execute();
          }
        }

        const assignment = await trx.selectFrom('contact_assignments').select(['agent_id']).where('client_id', '=', client.client_id).where('campaign_id', '=', opts.campaignId).where('ended_at', 'is', null).executeTakeFirst();
        if (assignment && assignment.agent_id !== opts.agentId) throw new AppError(409, 'Contacto asignado a otro agente.', 'ASSIGNMENT_CONFLICT');
        if (!assignment) await trx.insertInto('contact_assignments').values({ client_id: client.client_id, contact_id: contactId, campaign_id: opts.campaignId, agent_id: opts.agentId }).execute();
        await trx
          .insertInto('import_detail')
          .values({
            import_id: importLog.import_id,
            sheet_name: sheet.name,
            row_number: rowNumber,
            source_data: JSON.stringify(sourceData),
            client_id: client.client_id,
            result: isNewClient || newContactCreated ? 'imported' : 'duplicate',
          })
          .execute();

        if (isNewClient || newContactCreated) imported++;
        else duplicate++;
        await sql`RELEASE SAVEPOINT import_row`.execute(trx);
      } catch (err) {
        await sql`ROLLBACK TO SAVEPOINT import_row`.execute(trx);
        await sql`RELEASE SAVEPOINT import_row`.execute(trx);
        rejected++;
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

    return { importId: importLog.import_id, rowsProcessed, imported, duplicate, rejected };
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
    const namespace = await namespaceForCampaign(trx, opts.campaignId);
    const unassigned = await trx
      .selectFrom('clients as c')
      .select('c.client_id')
      .where('c.is_active', '=', true)
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
      await trx
        .insertInto('contact_assignments')
        .values({ client_id: row.client_id, campaign_id: opts.campaignId, agent_id: agentId })
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
    if ('result' in v) return cellToString((v as { result: unknown }).result);
    throw new AppError(400, 'Celda sin valor legible; recalcula y guarda el Excel.', 'INVALID_CELL');
  }
  const s = String(v).trim();
  return s.length ? s : null;
}
