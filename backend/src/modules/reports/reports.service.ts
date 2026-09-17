import { pool } from '../../db/pool.js';
import { AppError } from '../../utils/errors.js';
import { buildClosingWorkbook, type ClosingData, type ClosingQuestion, type ClosingSurvey } from './report-workbook.js';

interface MonthlyClosingInput { campaignId: number; year: number; month: number }

export async function generateMonthlyClosing(input: MonthlyClosingInput): Promise<{ buffer: Buffer; fileName: string }> {
  const connection=await pool.connect();
  let data: ClosingData;
  try {
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await connection.query("SET LOCAL TIME ZONE 'America/Hermosillo'");
    const campaign=(await connection.query<{name:string}>('SELECT name FROM campaigns WHERE campaign_id=$1',[input.campaignId])).rows[0];
    if(!campaign) throw new AppError(404,'Campaña no encontrada.','CAMPAIGN_NOT_FOUND');
    if(campaign.name!=='SILIMEX' && campaign.name!=='PARTNER DELL') throw new AppError(422,'No hay un formato de cierre configurado para esta campaña.','REPORT_TEMPLATE_NOT_FOUND');
    const args=[input.campaignId,input.year,input.month];
    const monthly=await connection.query(`SELECT *, extract(month from mes)::int AS month FROM vw_concentrado_mensual
      WHERE campaign_id=$1 AND mes>=make_date($2::int,1,1)
      AND mes<make_date($2::int,$3::int,1)+interval '1 month' ORDER BY mes`,args);
    const calls=await connection.query(`SELECT llamada_inicio::text AS date, cliente_clave AS client,
      canalización AS channel, disposición AS disposition, teléfono_marcado AS phone, agente AS agent,
      CASE WHEN duration_issue IS NULL THEN extract(epoch from duration_sec)::float8/86400 ELSE NULL END AS "durationDays"
      FROM vw_historico_detalle WHERE campaign_id=$1 AND state='closed'
      AND llamada_inicio>=make_date($2::int,1,1)
      AND llamada_inicio<make_date($2::int,$3::int,1)+interval '1 month'
      ORDER BY llamada_inicio,attempt_id`,args);
    // Query each calendar month independently, including when the current month is empty.
    const tpa=(await connection.query(`SELECT
      coalesce(max(extract(epoch from tpa_promedio)/86400) FILTER (WHERE mes=make_date($2::int,$3::int,1)),0)::float8 AS current,
      coalesce(max(extract(epoch from tpa_promedio)/86400) FILTER (WHERE mes=make_date($2::int,$3::int,1)-interval '1 month'),0)::float8 AS previous
      FROM vw_concentrado_mensual WHERE campaign_id=$1
      AND mes BETWEEN make_date($2::int,$3::int,1)-interval '1 month' AND make_date($2::int,$3::int,1)`,args)).rows[0];
    data={campaign:campaign.name,year:input.year,month:input.month,months:monthly.rows,
      calls:calls.rows.map(row=>({...row,channel:row.channel??'',disposition:row.disposition??'',durationDays:row.durationDays===null?null:Number(row.durationDays)})),
      previousTpa:Number(tpa.previous),currentTpa:Number(tpa.current),questions:[],surveys:[]};
    const historicalReady=(await connection.query("SELECT to_regclass('public.historical_monthly_totals') IS NOT NULL AND to_regclass('public.historical_survey_records') IS NOT NULL AS ready")).rows[0].ready;
    const validTpa=(await connection.query(`SELECT
      coalesce(avg(extract(epoch from duration_sec)/86400) FILTER(WHERE call_start>=make_date($2::int,$3::int,1)),0)::float8 AS current,
      coalesce(avg(extract(epoch from duration_sec)/86400) FILTER(WHERE call_start<make_date($2::int,$3::int,1)),0)::float8 AS previous
      FROM call_attempts WHERE campaign_id=$1 AND state='closed' AND counts_for_tpa
      AND duration_issue IS NULL AND call_end>=call_start
      AND call_start>=make_date($2::int,$3::int,1)-interval '1 month'
      AND call_start<make_date($2::int,$3::int,1)+interval '1 month'`,args)).rows[0];
    data.currentTpa=Number(validTpa.current);data.previousTpa=Number(validTpa.previous);
    const invalidTimes=data.calls.filter(call=>call.durationDays===null).length;
    if(invalidTimes) data.notes=[`${invalidTimes} llamadas del detalle no tienen duración verificable. La duración se deja vacía y se excluye del promedio TPA; las llamadas sí cuentan en los totales.`];
    if(historicalReady) {
      const historical=(await connection.query('SELECT * FROM historical_monthly_totals WHERE campaign_id=$1 AND year=$2 AND month<=$3 ORDER BY month',args)).rows;
      for(const month of historical) {
        data.months=data.months.filter(row=>row.month!==month.month);data.months.push(month);
        if(month.tpa_seconds!==null&&month.month===input.month)data.currentTpa=Number(month.tpa_seconds)/86400;
        if(month.tpa_seconds!==null&&month.month===input.month-1)data.previousTpa=Number(month.tpa_seconds)/86400;
      }
      if(historical.length) data.notes=[...(data.notes??[]),`Los meses ${historical.map(m=>m.month).join(', ')} de ${input.year} usan los totales del consolidado histórico. Sustituyen el cálculo del detalle de esos meses, sin sumarlo otra vez. El detalle disponible es parcial y puede no coincidir con esos totales. Fuentes: ${[...new Set(historical.map(m=>m.source_file))].join(', ')}.`];
    }
    if(campaign.name==='SILIMEX') {
      const surveys=await connection.query(`SELECT s.survey_id AS id,s.version_id AS "versionId",s.state,
        h.llamada_inicio::text AS date,h.cliente_clave AS client,h.agente AS agent,
        h.cliente_razon_social AS "businessName",coalesce(c.sucursal,'') AS branch
        FROM call_surveys s JOIN vw_historico_detalle h USING(attempt_id)
        JOIN clients c ON c.client_id=h.client_id
        WHERE s.campaign_id=$1 AND h.state='closed'
        AND h.llamada_inicio>=make_date($2::int,$3::int,1)
        AND h.llamada_inicio<make_date($2::int,$3::int,1)+interval '1 month'
        ORDER BY h.llamada_inicio,s.survey_id`,args);
      const independent=historicalReady?(await connection.query(`SELECT -s.historical_survey_id AS id,s.version_id AS "versionId",'completed' AS state,
        (s.completed_at AT TIME ZONE 'America/Hermosillo')::text AS date,c.clave AS client,u.full_name AS agent,
        s.business_name AS "businessName",coalesce(s.branch,'') AS branch,s.answers
        FROM historical_survey_records s JOIN clients c USING(client_id) JOIN users u ON u.user_id=s.agent_id
        WHERE s.campaign_id=$1 AND s.completed_at>=make_date($2::int,$3::int,1)
        AND s.completed_at<make_date($2::int,$3::int,1)+interval '1 month'`,args)).rows:[];
      const versionIds=[...new Set([...surveys.rows,...independent].map(row=>Number(row.versionId)))];
      const questions=await connection.query(`SELECT q.question_id AS id,q.version_id AS "versionId",v.version_name AS version,
        q.question_text AS text,q.question_type AS type,
        coalesce(array_agg(o.option_text ORDER BY o.display_order) FILTER(WHERE o.option_id IS NOT NULL),'{}') AS options
        FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id)
        LEFT JOIN questionnaire_options o USING(question_id)
        WHERE v.campaign_id=$1 AND (v.version_id=ANY($2::int[]) OR (cardinality($2::int[])=0 AND v.is_active))
        GROUP BY q.question_id,q.version_id,v.version_name,q.question_text,q.question_type,q.display_order
        ORDER BY q.version_id,q.display_order`,[input.campaignId,versionIds]);
      data.questions=questions.rows as ClosingQuestion[];
      const surveyIds=surveys.rows.map(row=>Number(row.id));
      const answers=surveyIds.length?(await connection.query(`SELECT survey_id,question_id AS "questionId",option_text AS option,answer_text AS text
        FROM vw_respuestas_encuesta WHERE survey_id=ANY($1::int[]) AND state='completed' ORDER BY survey_id,question_id`,[surveyIds])).rows:[];
      const bySurvey=new Map<number,ClosingSurvey['answers']>();
      answers.forEach(row=>{const entries=bySurvey.get(row.survey_id)??[];entries.push({questionId:row.questionId,option:row.option,text:row.text});bySurvey.set(row.survey_id,entries);});
      data.surveys=surveys.rows.map(row=>({...row,answers:bySurvey.get(row.id)??[]})) as ClosingSurvey[];
      data.surveys.push(...independent as ClosingSurvey[]);
      data.surveys.sort((a,b)=>a.date.localeCompare(b.date)||a.id-b.id);
      if(independent.length)data.notes=[...(data.notes??[]),`${independent.length} encuestas importadas de este mes se conservan como registros independientes por falta de coincidencia de llamada, múltiples respuestas para una llamada o motivos obligatorios ausentes en el archivo. Se conservan las respuestas originales, sin inventar motivos ni generar marcaciones adicionales.`];
    }
    await connection.query('COMMIT');
  } catch(error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
  const buffer=await buildClosingWorkbook(data);
  return {buffer,fileName:`Cierre_${data.campaign.replaceAll(' ','_')}_${input.year}-${String(input.month).padStart(2,'0')}.xlsx`};
}
