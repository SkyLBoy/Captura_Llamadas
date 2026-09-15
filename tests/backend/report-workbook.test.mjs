import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const ExcelJS=require('exceljs'), JSZip=require('jszip');
const {buildClosingWorkbook}=await import('../../dist/modules/reports/report-workbook.js');
const questions=[
 {id:1,versionId:1,version:'ENCUESTAS 2',text:'1. ¿Qué marca de productos de limpieza y mantenimiento para equipo de cómputo/electrónica comercializan o consumen principalmente en su negocio?',type:'single_select',options:['Silimex','Perfect Choice','Prolicom','Vorago','Steren']},
 {id:2,versionId:1,version:'ENCUESTAS 2',text:'2. Al momento de seleccionar una marca de limpiadores técnicos, ¿cuál es el factor determinante en su decisión?',type:'single_select',options:['Calidad','Precio','Disponibilidad','Promocion']},
 {id:3,versionId:1,version:'ENCUESTAS 2',text:'3. Pensando en los limpiadores de aire comprimido que utiliza actualmente, ¿Cómo califica su calidad, durabilidad y eficiencia general?',type:'single_select',options:['Excelente','Aceptable','Deficiente']},
 {id:4,versionId:1,version:'ENCUESTAS 2',text:'4. ¿Qué tipo de características o beneficios valoran más usted o su equipo de ventas al promover una línea específica de accesorios/mantenimiento?',type:'single_select',options:['Precio','Calidad','Beneficios por compras de volumen','Capacitacion']},
 {id:5,versionId:1,version:'ENCUESTAS 2',text:'5. Si le ofrecieran un producto de limpieza técnico de alta calidad garantizada ¿qué tan dispuesto estaría a probarlo o migrar de marca?',type:'single_select',options:['Muy dispuesto','Moderadamente dispuesto','Poco dispuesto','Indiferente']},
];
const input={campaign:'SILIMEX',year:2026,month:9,months:[{month:9,total_marcaciones:3,llamadas:3,backoffice:0,blacklist:1,exitoso:1,colgo:0,nuevos_datos:0,seguimiento:1}],calls:[
 {date:'2026-09-11 14:00:00',client:'TEST001',channel:'SE_ENVIA_PROMOCION_POR_CORREO',disposition:'EXITOSO',phone:'0012345678',agent:'Agente de prueba',durationDays:60/86400},
 {date:'2026-09-11 14:10:00',client:'TEST002',channel:'NUMERO_EQUIVOCADO',disposition:'BLACKLIST',phone:'5555555555',agent:'Agente de prueba',durationDays:30/86400},
 {date:'2026-09-11 14:20:00',client:'TEST003',channel:'BUZON',disposition:'SEGUIMIENTO',phone:'5555555556',agent:'Agente de prueba',durationDays:0},
],previousTpa:40/86400,currentTpa:30/86400,questions,surveys:[
 {id:1,versionId:1,date:'2026-09-11 14:00:00',client:'TEST001',agent:'Agente de prueba',businessName:'Empresa de prueba',branch:'CDMX Suc. Azcapotzalco',state:'completed',answers:questions.map(q=>({questionId:q.id,option:q.options[0],text:null}))},
 {id:2,versionId:1,date:'2026-09-11 14:20:00',client:'TEST003',agent:'Agente de prueba',businessName:'Empresa de prueba 2',branch:'Hermosillo',state:'declined',answers:[]},
]};
for(const campaign of ['PARTNER DELL','SILIMEX']) {
 const buffer=await buildClosingWorkbook({...input,campaign});
 const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
 assert.deepEqual(wb.worksheets.map(s=>s.name),campaign==='SILIMEX'?['CONCENTRADO','SILIMEX','ENCUESTA','RESULTADOS ENCUESTA','Hoja1']:['CONCENTRADO','PARTNER DELL']);
 const sheet=wb.getWorksheet(campaign);
 assert.equal(sheet.getCell('A8').value,'FechaDisposicion');
 assert.equal(sheet.getCell('F9').value,'0012345678');
 assert.equal(sheet.getCell('A9').value.toISOString(),'2026-09-11T14:00:00.000Z');
 assert.equal(sheet.getCell('D1').value.result,3);
  assert.equal(sheet.getCell('G2').value.toISOString(),'1899-12-30T00:00:30.000Z');
  assert.equal(wb.getWorksheet('CONCENTRADO').getCell('E10').value.result,1);
  assert.equal(wb.getWorksheet('CONCENTRADO').getCell('E10').numFmt,'0.00%');
  assert.equal(sheet.getCell('H9').numFmt,'[h]:mm:ss');
  assert.equal(sheet.getCell('A9').numFmt,'yyyy/mm/dd hh:mm:ss');
 assert.equal(wb.getWorksheet('CONCENTRADO').getCell('C9').value,0,'No August sample data');
 const zip=await JSZip.loadAsync(buffer);
 assert.ok(!(await zip.file('xl/sharedStrings.xml').async('string')).includes('SLP1250'),'No reference customer data');
 if(campaign==='SILIMEX') {
  assert.equal(wb.getWorksheet('Hoja1').state,'hidden');
  assert.equal(wb.getWorksheet('ENCUESTA').getCell('F2').value,'Silimex');
  assert.equal(wb.getWorksheet('RESULTADOS ENCUESTA').getCell('E7').value.result,1);
  assert.equal(Object.keys(zip.files).filter(p=>/^xl\/charts\/chart\d+.xml$/.test(p)).length,5);
  const chart=await zip.file('xl/charts/chart1.xml').async('string');
  assert.ok(chart.includes('ENCUESTAS')===false);
  assert.ok(chart.includes('Silimex'));
  assert.ok(!chart.includes('AEROJET'),'No stale chart cache');
  assert.ok(chart.includes('<c:plotVisOnly val="0"/>'),'Hidden source data can be plotted');
  assert.ok(chart.includes('<c:majorUnit val="1"/>'),'Count axes use integer ticks');
 }

 console.log('PASS',campaign,'layout, totals, dates, identifiers, formulas, absence of sample data');
}
const empty=await buildClosingWorkbook({...input,months:[],calls:[],surveys:[],currentTpa:0});
const wb=new ExcelJS.Workbook();await wb.xlsx.load(empty);
const emptyZip=await JSZip.loadAsync(empty);
assert.match(await emptyZip.file('xl/worksheets/sheet2.xml').async('string'), /<c r="D1"[^>]*><f>[^<]+<\/f><v>0<\/v><\/c>/);
assert.equal(wb.getWorksheet('SILIMEX').getCell('G1').value.toISOString(),'1899-12-30T00:00:40.000Z');
assert.match(await emptyZip.file('xl/worksheets/sheet4.xml').async('string'), /<c r="E7"[^>]*><f>[^<]+<\/f><v>0<\/v><\/c>/);
console.log('PASS empty period with previous TPA');
const many=await buildClosingWorkbook({...input,campaign:'PARTNER DELL',calls:Array.from({length:10000},()=>input.calls[0])});
const large=new ExcelJS.Workbook();await large.xlsx.load(many);
assert.equal(large.getWorksheet('PARTNER DELL').getCell('A10008').value.toISOString(),'2026-09-11T14:00:00.000Z');
console.log('PASS 10,000 calls');
