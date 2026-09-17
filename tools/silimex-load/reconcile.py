import json,pathlib,collections,datetime
root=pathlib.Path(__file__).parent
read=lambda name:json.loads((root/f'{name}-data.json').read_text(encoding='utf8'))
september=[]
surveys=[]
invalid=[]
for file in ['ordaz','abechuco12','abechuco']:
 d=read(file)
 calls=[r for r in d['LLAMADAS'][1:] if r['values'][0] or r['values'][13]]
 for r in calls:
  v=r['values']; start=datetime.datetime.fromisoformat(v[0]); end=None
  try: end=datetime.datetime.combine(start.date(),datetime.time.fromisoformat(v[15])) if v[15] else None
  except (ValueError,TypeError): pass
  if end is None or end<start:invalid.append({'source':file,'row':r['row'],'start':v[0],'end':v[15]})
  september.append({'source':file,'sheet':'LLAMADAS','row':r['row'],'date':v[0],'agent':v[11],'key':v[2],'channel':v[13],'disposition':v[14],'phone':v[1]})
 for r in d['ENCUESTAS 2'][1:]:
  if any(r['values'][i] for i in [6,7,8,9,10,11,12]):surveys.append({'source':file,'row':r['row'],'values':r['values'][:13]})
aug=read('agosto')
augrows=[r for r in aug['SILIMEX'] if isinstance(r['values'][0],str) and r['values'][0].startswith('2026-')]
summary={'septemberCalls':len(september),'septemberSurveys':len(surveys),'septemberDates':dict(collections.Counter(r['date'][:10] for r in september)),
 'septemberDuplicateIdentities':sum(n-1 for n in collections.Counter((r['date'],r['agent'],r['key'],r['phone']) for r in september).values() if n>1),
 'invalidEndTimes':len(invalid),'historicalDetailRows':len(augrows),'historicalExactDuplicateRows':sum(n-1 for n in collections.Counter(tuple(r['values']) for r in augrows).values() if n>1),
 'historicalSurveys':len(aug['ENCUESTA'])-1,'historicalDates':dict(collections.Counter(r['values'][0][:7] for r in augrows))}
(root/'reconciliation-results.json').write_text(json.dumps({'summary':summary,'september':september,'surveys':surveys,'timeIssues':invalid},ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(summary,ensure_ascii=False))
