import { chartPng } from '../../utils/chart.js';
import ExcelJS from 'exceljs';
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { AppError } from '../../utils/errors.js';



interface MonthlyClosingInput {
  campaignId: number;
  year: number;
  month: number; // 1-12
}

/**
 * Arma el archivo de cierre mensual. Para PARTNER DELL: CONCENTRADO,
 * HISTORICO, INDICADORES, TPA. Para SILIMEX ademas ENCUESTAS, tabla de
 * RESULTADOS y una hoja con graficas (una imagen por pregunta).
 *
 * ExcelJS no genera graficos nativos de Excel de forma confiable; por eso
 * las graficas se renderizan como PNG (chartjs-node-canvas) y se insertan
 * como imagenes. Visualmente son graficas normales, pero no son objetos de
 * grafico editables dentro de Excel. Si en algun momento eso es
 * indispensable, se necesitaria un paso adicional en otra herramienta
 * (p.ej. un script de Python con xlsxwriter) solo para esa hoja.
 */
export async function generateMonthlyClosing(input: MonthlyClosingInput): Promise<{ buffer: Buffer; fileName: string }> {
  const connection = await pool.connect();
  try {
  await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const campaign = await connection.query<{ name: string }>(
    'SELECT name FROM campaigns WHERE campaign_id = $1',
    [input.campaignId],
  );
  if (campaign.rowCount === 0) throw new AppError(404, 'Campana no encontrada.', 'CAMPAIGN_NOT_FOUND');
  const campaignName = campaign.rows[0]!.name;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Vincco - Sistema de Telemarketing';
  workbook.created = new Date();

  await addConcentradoSheet(workbook, input, connection);
  await addIndicadoresSheet(workbook, input, connection);
  await addTpaSheet(workbook, input, connection);
  await addHistoricoSheet(workbook, input, connection);

  if (campaignName === 'SILIMEX') {
    await addEncuestasSheets(workbook, input, connection);
  }

  await connection.query('COMMIT');
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const fileName = `Cierre_${campaignName.replace(/\s+/g, '_')}_${input.year}-${String(input.month).padStart(2, '0')}.xlsx`;
  return { buffer: Buffer.from(arrayBuffer), fileName };
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}

async function addConcentradoSheet(workbook: ExcelJS.Workbook, input: MonthlyClosingInput, connection: PoolClient) {
  const { rows } = await connection.query(
    `SELECT * FROM vw_concentrado_mensual
     WHERE campaign_id = $1 AND extract(year from mes) = $2 AND extract(month from mes) <= $3 ORDER BY mes`,
    [input.campaignId, input.year, input.month],
  );

  const sheet = workbook.addWorksheet('CONCENTRADO');
  if (rows.length === 0) {
    sheet.addRow(['Sin datos para el periodo seleccionado.']);
    return;
  }
  sheet.addRow(['CAMPAÑA','MES','TOTAL DE MARCACIONES','LLAMADAS','% CONTESTACION','BACKOFFICE','BLACKLIST','EXITOSO','COLGO','NUEVOS DATOS','SEGUIMIENTO']);
  for(const r of rows) {
    const row=sheet.addRow([r.campaña,Number(String(r.mes instanceof Date ? r.mes.toISOString():r.mes).slice(5,7)),Number(r.total_marcaciones),Number(r.llamadas),Number(r.porcentaje_contestacion)/100,...['backoffice','blacklist','exitoso','colgo','nuevos_datos','seguimiento'].map(k=>Number(r[k]))]);
    row.getCell(5).numFmt='0.00%';
  }
  sheet.columns.forEach(c=>c.width=22);
  styleHeader(sheet);
}

async function addIndicadoresSheet(workbook: ExcelJS.Workbook, input: MonthlyClosingInput, connection: PoolClient) {
  const { rows } = await connection.query(
    `SELECT sum(total_marcaciones)::float8 AS total_marcaciones,sum(intentos_cerrados)::float8 AS intentos_cerrados, sum(llamadas)::float8 AS llamadas, coalesce(100.0*sum(llamadas)/nullif(sum(total_marcaciones),0),0)::float8 AS porcentaje_contestacion,sum(exitoso)::float8 AS exitoso,sum(seguimiento)::float8 AS seguimiento,sum(backoffice)::float8 AS backoffice,sum(blacklist)::float8 AS blacklist,sum(colgo)::float8 AS colgo,sum(nuevos_datos)::float8 AS nuevos_datos
     FROM vw_concentrado_mensual
     WHERE campaign_id = $1 AND mes < make_date($2::int,$3::int,1)+interval '1 month'`,
    [input.campaignId, input.year, input.month],
  );

  const sheet = workbook.addWorksheet('INDICADORES');
  sheet.addRow(['Indicador', 'Valor']);
  if (rows.length > 0) {
    const r = rows[0];
    sheet.addRow(['Total de marcaciones', r.total_marcaciones]);
    sheet.addRow(['Intentos cerrados', r.intentos_cerrados]);
    sheet.addRow(['Llamadas que cuentan para TPA', r.llamadas]);
    sheet.addRow(['% de contestacion', r.porcentaje_contestacion]);
    sheet.addRow(['Exitoso', r.exitoso]);
    sheet.addRow(['Seguimiento', r.seguimiento]);
    sheet.addRow(['Backoffice', r.backoffice]);
    sheet.addRow(['Blacklist', r.blacklist??0]);
    sheet.addRow(['Colgo',r.colgo??0]);
    sheet.addRow(['Nuevos datos',r.nuevos_datos??0]);
  } else {
    sheet.addRow(['Sin datos para el periodo seleccionado.', '']);
  }
  styleHeader(sheet);
}

async function addTpaSheet(workbook: ExcelJS.Workbook, input: MonthlyClosingInput, connection: PoolClient) {
  const { rows } = await connection.query(
    `SELECT extract(epoch from tpa_promedio)::float8/86400 AS actual, extract(epoch from tpa_mes_anterior)::float8/86400 AS anterior FROM vw_tpa
     WHERE campaign_id = $1 AND extract(year from mes) = $2 AND extract(month from mes) = $3`,
    [input.campaignId, input.year, input.month],
  );

  const sheet = workbook.addWorksheet('TPA');
  if (rows.length === 0) rows.push({anterior:0,actual:0});
  sheet.addRow(['TPA DE MES ANTERIOR',Number(rows[0].anterior)]).getCell(2).numFmt='[h]:mm:ss';
  sheet.addRow(['TPA DE MES ACTUAL',Number(rows[0].actual)]).getCell(2).numFmt='[h]:mm:ss';
  styleHeader(sheet);
}

async function addHistoricoSheet(workbook: ExcelJS.Workbook, input: MonthlyClosingInput, connection: PoolClient) {
  const { rows } = await connection.query(
    `SELECT *, llamada_inicio::text AS fecha, extract(epoch from duration_sec)::float8/86400 AS duracion FROM vw_historico_detalle
     WHERE campaign_id = $1
       AND llamada_inicio IS NOT NULL
       AND llamada_inicio < make_date($2::int,$3::int,1) + interval '1 month'
     ORDER BY llamada_inicio`,
    [input.campaignId, input.year, input.month],
  );

  const campaign = (await connection.query('SELECT name FROM campaigns WHERE campaign_id=$1',[input.campaignId])).rows[0];
  const sheet = workbook.addWorksheet(campaign.name);
  for (const name of ['INDICADORES','TPA']) {
    const source = workbook.getWorksheet(name)!;
    source.eachRow(row => { const copied=sheet.addRow(row.values); row.eachCell((cell,col)=>copied.getCell(col).numFmt=cell.numFmt); });
    sheet.addRow([]);
    workbook.removeWorksheet(source.id);
  }
  if (rows.length === 0) {
    sheet.addRow(['Sin llamadas registradas en el periodo seleccionado.']);
    return;
  }
  sheet.columns=Array.from({length:8},()=>({width:24}));
  const header=sheet.addRow(['FechaDisposicion','Campaña','NombreCliente','Disposicion','EstatusDisposicion','Numero Telefonico','NombreAgente','Duración Tramite']);
  header.font={bold:true};
  for(const r of rows) sheet.addRow([r.fecha,r.campaña,r.cliente_clave,r.canalización,r.disposición,r.teléfono_marcado,r.agente,Number(r.duracion)]).getCell(8).numFmt='[h]:mm:ss';
  sheet.autoFilter={from:{row:header.number,column:1},to:{row:header.number,column:8}};
}

async function addEncuestasSheets(workbook: ExcelJS.Workbook, input: MonthlyClosingInput, connection: PoolClient) {
  const { rows: resultados } = await connection.query(
    `SELECT * FROM vw_resultados_encuesta
     WHERE campaign_id = $1 AND extract(year from mes) = $2 AND extract(month from mes) = $3
     ORDER BY question_id, option_id`,
    [input.campaignId, input.year, input.month],
  );

  const { rows: estados } = await connection.query(
    `SELECT * FROM vw_estados_encuesta
     WHERE campaign_id = $1 AND extract(year from mes) = $2 AND extract(month from mes) = $3`,
    [input.campaignId, input.year, input.month],
  );

  const detail = await connection.query(`SELECT r.*, h.llamada_inicio::text AS fecha, h.cliente_clave, h.agente FROM vw_respuestas_encuesta r JOIN vw_historico_detalle h USING(attempt_id) WHERE r.campaign_id=$1 AND h.state='closed' AND r.state='completed' AND extract(year from h.llamada_inicio)=$2 AND extract(month from h.llamada_inicio)=$3 ORDER BY r.survey_id,r.question_id`,[input.campaignId,input.year,input.month]);
  const surveySheet=workbook.addWorksheet('ENCUESTAS');
  const questions=new Map<string,string>();
  for(const a of detail.rows) questions.set(`${a.version_id}:${a.question_id}`,`${a.version_name}: ${a.question_text}`);
  surveySheet.addRow(['Fecha','Cliente','Agente','Versión',...Array.from(questions.values()).flatMap(q=>[q,`${q} - Motivo`])]);
  const surveys=new Map<number,typeof detail.rows>();
  for(const a of detail.rows) surveys.set(a.survey_id,[...(surveys.get(a.survey_id)??[]),a]);
  for(const answers of surveys.values()) {
    const a=answers[0]!;
    surveySheet.addRow([a.fecha,a.cliente_clave,a.agente,a.version_name,...Array.from(questions.keys()).flatMap(key=>{
      const answer=answers.find(x=>`${x.version_id}:${x.question_id}`===key);
      return [answer?.option_text??'',answer?.answer_text??''];
    })]);
  }
  const estadosSheet = workbook.addWorksheet('ENCUESTAS_ESTADOS');
  estadosSheet.state='hidden';
  estadosSheet.addRow(['Version', 'Estado', 'Cantidad']);
  estados.forEach((r: Record<string, unknown>) => estadosSheet.addRow([r.version_id, r.state, r.cantidad]));
  styleHeader(estadosSheet);

  const resultadosSheet = workbook.addWorksheet('DATOS ENCUESTA');
  resultadosSheet.state = 'hidden';
  resultadosSheet.addRow(['Pregunta', 'Opcion', 'Cantidad']);
  resultados.forEach((r: Record<string, unknown>) =>
    resultadosSheet.addRow([r.question_text, r.option_text, r.cantidad]),
  );
  styleHeader(resultadosSheet);

  // Una grafica de barras por pregunta, insertada como imagen en su propia hoja.
  const graficasSheet = workbook.addWorksheet('RESULTADOS ENCUESTA');
  const byQuestion = groupBy(resultados as Array<{ question_text: string; option_text: string; cantidad: string }>, (r) => `${(r as any).version_id}:${(r as any).question_id}`);

  let rowCursor = 1;
  for (const [question, options] of byQuestion) {
    const labels = options.map((o) => o.option_text);
    const data = options.map((o) => Number(o.cantidad));

    const imageBuffer = await chartPng(options[0]!.question_text, labels, data);

    // Ver nota de tipos en import.service.ts: discrepancia estructural de
    // Buffer entre versiones de @types/node, no un problema en runtime.
    const imageId = workbook.addImage({
      buffer: Buffer.from(imageBuffer) as unknown as ExcelJS.Buffer,
      extension: 'png',
    });
    graficasSheet.addImage(imageId, {
      tl: { col: 0, row: rowCursor },
      ext: { width: 700, height: 400 },
    });
    rowCursor += 22; // deja espacio suficiente antes de la siguiente imagen
  }

  if (byQuestion.length === 0) {
    graficasSheet.addRow(['Sin respuestas de encuesta en el periodo seleccionado.']);
  }
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Array<[K, T[]]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return Array.from(map.entries());
}
