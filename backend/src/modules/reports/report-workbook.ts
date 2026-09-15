import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import layouts from './reference-layout.json' with { type: 'json' };
import chartTemplate from './chart-template.json' with { type: 'json' };

export interface ClosingMonth {
  month: number; total_marcaciones: number; llamadas: number;
  backoffice: number; blacklist: number; exitoso: number; colgo: number;
  nuevos_datos: number; seguimiento: number;
}
export interface ClosingCall {
  date: string; client: string; channel: string; disposition: string;
  phone: string; agent: string; durationDays: number;
}
export interface ClosingQuestion {
  id: number; versionId: number; version: string; text: string;
  type: string; options: string[];
}
export interface ClosingSurvey {
  id: number; versionId: number; date: string; client: string; agent: string;
  businessName: string; branch: string; state: string;
  answers: { questionId: number; option: string | null; text: string | null }[];
}
export interface ClosingData {
  campaign: 'PARTNER DELL' | 'SILIMEX'; year: number; month: number;
  months: ClosingMonth[]; calls: ClosingCall[];
  previousTpa: number; currentTpa: number;
  questions: ClosingQuestion[]; surveys: ClosingSurvey[];
}
interface Layout {
  columns: Partial<ExcelJS.Column>[];
  rows: { height?: number; cells: {col: number; value?: ExcelJS.CellValue; style: Partial<ExcelJS.Style>}[] }[];
  properties: Partial<ExcelJS.WorksheetProperties>; pageSetup: Partial<ExcelJS.PageSetup>;
  views: Partial<ExcelJS.WorksheetView>[]; merges: string[];
}
const references = layouts as unknown as Record<string, Record<string, Layout>>;
const clone = <T>(value: T): T => structuredClone(value);
function applyLayout(sheet: ExcelJS.Worksheet, layout: Layout) {
  sheet.columns = clone(layout.columns);
  sheet.properties = {...sheet.properties, ...clone(layout.properties)};
  sheet.pageSetup = clone(layout.pageSetup);
  sheet.views = clone(layout.views);
  layout.rows.forEach((row, index) => {
    const target = sheet.getRow(index + 1);
    if (row.height) target.height = row.height;
    row.cells.forEach(cell => {
      target.getCell(cell.col).style = clone(cell.style);
      if (cell.value !== undefined) target.getCell(cell.col).value = cell.value;
    });
  });
  layout.merges.forEach(range => sheet.mergeCells(range));
}
function rowStyle(sheet: ExcelJS.Worksheet, index: number, layout: Layout, sample: number) {
  const row = sheet.getRow(index), source = layout.rows[sample - 1]!;
  row.height = source.height ?? 15;
  source.cells.forEach(cell => row.getCell(cell.col).style = clone(cell.style));
  return row;
}
function formula(sheet: ExcelJS.Worksheet, address: string, expression: string, result: number) {
  sheet.getCell(address).value = {formula: expression, result};
}
// The database returns Hermosillo wall-clock timestamps, without an offset.
// Treat those components as an Excel serial; do not convert through the server timezone.
function excelDate(value: string): Date {
  const date = new Date(value.replace(' ', 'T').replace(/Z$/, '') + 'Z');
  if (!Number.isFinite(date.getTime())) throw new Error('Fecha inválida en el reporte.');
  return date;
}
const dispositionLabel = (value: string) => ({BACKOFFICE:'Backoffice',BLACKLIST:'Blacklist',EXITOSO:'Exitoso',SEGUIMIENTO:'Seguimiento',NO_CONTESTA:'No Contesta'}[value] ?? value.replaceAll('_',' '));
const xml = (value: string | number) => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
interface Chart { title: string; labels: string[]; values: number[]; labelRange: string; valueRange: string }

export async function buildClosingWorkbook(data: ClosingData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Vincco'; workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  const ref = references[data.campaign]!;
  const concentrated = workbook.addWorksheet('CONCENTRADO');
  applyLayout(concentrated, ref.CONCENTRADO!);
  const keys = ['total_marcaciones','llamadas','backoffice','blacklist','exitoso','colgo','nuevos_datos','seguimiento'] as const;
  const totals = Object.fromEntries(keys.map(key => [key, 0])) as Record<typeof keys[number],number>;
  for (let month=1;month<=12;month++) {
    const source = month<=data.month ? data.months.find(row=>row.month===month) : undefined;
    const values = keys.map(key=>Number(source?.[key] ?? 0));
    keys.forEach((key,index)=>totals[key]+=values[index]!);
    const index=month+1;
    // Keep twelve month rows; only the selected closing month is emphasized.
    const row=concentrated.getRow(index);
    row.values=[data.campaign,month,values[0],values[1],0,...values.slice(2)];
    rowStyle(concentrated,index,ref.CONCENTRADO!,month===data.month?9:2);
    if(month===data.month) row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8F1FA'}};cell.font={...cell.font,bold:true};});
    formula(concentrated,`E${index}`,`IF(C${index}=0,0,D${index}/C${index})`,values[0] ? values[1]!/values[0]! : 0);
  }
  const history=workbook.addWorksheet(data.campaign);
  applyLayout(history,ref[data.campaign]!);
  formula(history,'D1',"SUM('CONCENTRADO'!C2:C13)",totals.total_marcaciones);
  formula(history,'D2',"SUM('CONCENTRADO'!D2:D13)",totals.llamadas);
  history.getCell('G1').value=data.previousTpa;
  history.getCell('G2').value=data.currentTpa;
  for (const [address,column,key] of [['C5','F','backoffice'],['C6','G','blacklist'],['E5','H','exitoso'],['E6','I','colgo'],['G5','J','nuevos_datos'],['G6','K','seguimiento']] as const) {
    formula(history,address,`SUM('CONCENTRADO'!${column}2:${column}13)`,totals[key]);
  }
  data.calls.forEach((call,index)=>{
    const row=history.getRow(index+9);
    row.values=[excelDate(call.date),data.campaign,call.client,call.channel.replaceAll('_',' '),dispositionLabel(call.disposition),call.phone,call.agent,call.durationDays];
    rowStyle(history,index+9,ref[data.campaign]!,9);
    row.getCell(1).numFmt='yyyy/mm/dd hh:mm:ss';
    row.getCell(8).numFmt='[h]:mm:ss';
    row.getCell(6).numFmt='@';
  });
  if (data.calls.length===0) history.getCell('A9').value='Sin llamadas registradas en el periodo seleccionado.';
  history.autoFilter={from:'A8',to:`H${Math.max(9,data.calls.length+8)}`};
  history.getColumn(4).width=Math.max(history.getColumn(4).width??0,45);
  history.getColumn(7).width=Math.max(history.getColumn(7).width??0,30);
  const charts: Chart[]=[];
  if(data.campaign==='SILIMEX') {
    const surveys=workbook.addWorksheet('ENCUESTA'); applyLayout(surveys,ref.ENCUESTA!);
    // Current questionnaire columns follow the reference's five identification columns.
    // IDs remain distinct across questionnaire versions, even if wording is identical.
    const versions=new Set(data.questions.map(q=>q.versionId));
    const header=['FECHA','CLAVE DE CLIENTE','AGENTE','RAZON SOCIAL','SUCURSAL'];
    const columns=new Map<number,{answer:number;reason:number}>();
    for(const question of data.questions) {
      columns.set(question.id,{answer:header.length+1,reason:header.length+2});
      header.push(versions.size>1?`${question.version}: ${question.text}`:question.text,'¿CUÁL? / MOTIVO');
    }
    const stateColumn=header.length+1; header.push('ESTADO DE ENCUESTA');
    const versionColumn=header.length+1; header.push('VERSIÓN');
    surveys.getRow(1).values=header;
    for(let col=1;col<=header.length;col++) {
      surveys.getCell(1,col).style=clone(ref.ENCUESTA!.rows[0]!.cells.find(c=>c.col===(col<=5?col:6))!.style);
      surveys.getCell(1,col).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF244062'}};
      surveys.getCell(1,col).font={...surveys.getCell(1,col).font,bold:true,color:{argb:'FFFFFFFF'}};
      if(col>5) surveys.getColumn(col).width=col>=stateColumn?25:columns.size && [...columns.values()].some(c=>c.reason===col)?25:45;
    }
    surveys.getRow(1).height=90;
    surveys.views=[{state:'frozen',ySplit:1,topLeftCell:'A2',showGridLines:false}];
    data.surveys.forEach((survey,index)=>{
      const row=surveys.getRow(index+2); row.height=15;
      row.values=[excelDate(survey.date),survey.client,survey.agent,survey.businessName,survey.branch];
      row.getCell(1).style=clone(ref.ENCUESTA!.rows[1]!.cells[0]!.style);
      for(const answer of survey.answers) {
        const column=columns.get(answer.questionId);
        if(!column) throw new Error('La encuesta contiene una pregunta no incluida en el reporte.');
        const question=data.questions.find(q=>q.id===answer.questionId)!;
        row.getCell(column.answer).value=question.type==='text'?answer.text:answer.option;
        row.getCell(column.reason).value=question.type==='text'?null:answer.text;
      }
      row.getCell(stateColumn).value=survey.state==='declined'?'No Desea Contestar Encuesta':survey.state==='completed'?'Completada':'Pendiente';
      row.getCell(versionColumn).value=data.questions.find(q=>q.versionId===survey.versionId)?.version??String(survey.versionId);
    });
    surveys.autoFilter={from:'A1',to:{row:Math.max(2,data.surveys.length+1),column:header.length}};
    const results=workbook.addWorksheet('RESULTADOS ENCUESTA');applyLayout(results,ref['RESULTADOS ENCUESTA']!);
    for(const [address,from] of [['E3','C5'],['E4','C6'],['E5','E5'],['E6','G6']] as const) {
      const cell=history.getCell(from).value as ExcelJS.CellFormulaValue;
      formula(results,address,`'SILIMEX'!${from}`,Number(cell.result));
    }
    const declined=data.surveys.filter(s=>s.state==='declined').length;
    const stateLetter=surveys.getColumn(stateColumn).letter;
    formula(results,'E7',`COUNTIF('ENCUESTA'!${stateLetter}2:${stateLetter}${Math.max(2,data.surveys.length+1)},"No Desea Contestar Encuesta")`,declined);
    const hidden=workbook.addWorksheet('Hoja1');applyLayout(hidden,ref.Hoja1!);hidden.state='hidden';
    let cursor=1;
    for(const question of data.questions) {
      const column=columns.get(question.id)!;
      const letter=surveys.getColumn(column.answer).letter;
      const title=versions.size>1?`${question.version}: ${question.text}`:question.text;
      hidden.getCell(cursor,2).value=title;hidden.getCell(cursor,3).value='CANTIDAD';
      hidden.getCell(cursor,2).style=clone(ref.Hoja1!.rows[0]!.cells.find(c=>c.col===2)!.style);
      const counts=new Map<string,number>();
      question.options.forEach(option=>counts.set(option,0));
      for(const survey of data.surveys.filter(s=>s.state==='completed'&&s.versionId===question.versionId)) {
        const answer=survey.answers.find(a=>a.questionId===question.id);
        const value=question.type==='text'?answer?.text:answer?.option;
        if(value) counts.set(value,(counts.get(value)??0)+1);
      }
      const entries=counts.size?[...counts]:[['Sin respuestas',0] as [string,number]];
      const start=cursor+1;
      entries.forEach(([label,count],i)=>{
        hidden.getCell(start+i,2).value=label;
        const criteria=`SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(B${start+i},"~","~~"),"*","~*"),"?","~?")`;
        formula(hidden,`C${start+i}`,`COUNTIF('ENCUESTA'!${letter}2:${letter}${Math.max(2,data.surveys.length+1)},${criteria})`,count);
      });
      const end=start+entries.length-1;
      charts.push({title,labels:entries.map(e=>e[0]),values:entries.map(e=>e[1]),labelRange:`'Hoja1'!$B$${start}:$B$${end}`,valueRange:`'Hoja1'!$C$${start}:$C$${end}`});
      cursor=end+3;
    }
    if(!data.questions.length) results.getCell('B10').value='Sin encuestas registradas en el periodo seleccionado.';
  }
  const buffer=Buffer.from(await workbook.xlsx.writeBuffer());
  return charts.length ? addNativeCharts(buffer,charts) : buffer;
}

async function addNativeCharts(buffer: Buffer, charts: Chart[]): Promise<Buffer> {
  // ExcelJS cannot serialize native charts. Preserve the reference chart's XML
  // styling and replace its title, source references and caches explicitly.
  const zip=await JSZip.loadAsync(buffer);
  const chartNs='http://schemas.openxmlformats.org/drawingml/2006/chart';
  const relNs='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const packageNs='http://schemas.openxmlformats.org/package/2006/relationships';
  let anchors='',relations='',content='';
  charts.forEach((chart,index)=>{
    const n=index+1;
    let source=chartTemplate.xml;
    source=source.replace(/<c:title>[\s\S]*?<\/c:title>/,`<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:t>${xml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`);
    const cat=`<c:cat><c:strRef><c:f>${xml(chart.labelRange)}</c:f><c:strCache><c:ptCount val="${chart.labels.length}"/>${chart.labels.map((v,i)=>`<c:pt idx="${i}"><c:v>${xml(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
    const val=`<c:val><c:numRef><c:f>${xml(chart.valueRange)}</c:f><c:numCache><c:formatCode>0</c:formatCode><c:ptCount val="${chart.values.length}"/>${chart.values.map((v,i)=>`<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>`;
    source=source.replace(/<c:cat>[\s\S]*?<\/c:cat>/,cat).replace(/<c:val>[\s\S]*?<\/c:val>/,val);
    source=source.replace('<c:plotVisOnly val="1"/>','<c:plotVisOnly val="0"/>');
    source=source.replace('</c:valAx>',`<c:majorUnit val="${Math.max(1,Math.ceil(Math.max(...chart.values)/5))}"/></c:valAx>`);
    zip.file(`xl/charts/chart${n}.xml`,source);
    // Two columns below the disposition table; row space grows for large option sets.
    const row=10+Math.floor(index/2)*26, col=(index%2)*7;
    anchors+=`<xdr:twoCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${col+7}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row+24}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${n}" name="Gráfica ${n}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${chartNs}"><c:chart xmlns:c="${chartNs}" xmlns:r="${relNs}" r:id="rId${n}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    relations+=`<Relationship Id="rId${n}" Type="${relNs}/chart" Target="../charts/chart${n}.xml"/>`;
    content+=`<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`;
  });
  zip.file('xl/drawings/drawing1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${anchors}</xdr:wsDr>`);
  zip.file('xl/drawings/_rels/drawing1.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${packageNs}">${relations}</Relationships>`);
  const path='xl/worksheets/sheet4.xml';
  const sheet=await zip.file(path)!.async('string');
  zip.file(path,sheet.replace('</worksheet>','<drawing r:id="rIdReportCharts"/></worksheet>'));
  zip.file('xl/worksheets/_rels/sheet4.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${packageNs}"><Relationship Id="rIdReportCharts" Type="${relNs}/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
  const types=await zip.file('[Content_Types].xml')!.async('string');
  zip.file('[Content_Types].xml',types.replace('</Types>',`${content}<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
