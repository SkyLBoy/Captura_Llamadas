import json,pathlib,collections,re,datetime
root=pathlib.Path(__file__).parent
allkeys={}
for agent in ['ordaz','abechuco']:
 data=json.loads((root/f'{agent}-data.json').read_text(encoding='utf-8'))
 base=[r for r in data['BASE'][1:] if r['values'][0] and str(r['values'][2]).upper()!='SUCURSAL' and str(r['values'][1]).upper()!='SUCURSAL']
 calls=[r for r in data['LLAMADAS'][1:] if r['values'][0] not in [None,0,''] or r['values'][13] not in [None,0,'']]
 surveys=[r for r in data['ENCUESTAS 2'][1:] if any(r['values'][i] not in [None,0,''] for i in [6,7,8,9,10,11,12])]
 keys=collections.Counter(str(r['values'][0]).strip().upper() for r in base)
 allkeys[agent]=set(keys)
 callkeys=collections.Counter((str(r['values'][0]),str(r['values'][2]).strip()) for r in calls)
 issues=[]
 for r in calls:
  v=r['values']; start=v[0]; end=v[15]
  try:
   s=datetime.datetime.fromisoformat(start)
   e=datetime.datetime.combine(s.date(),datetime.time.fromisoformat(end))
   if e<s: issues.append({'row':r['row'],'kind':'end_before_start','start':start,'end':end,'channel':v[13]})
  except: issues.append({'row':r['row'],'kind':'invalid_time','start':start,'end':end})
 out={'agent':agent,'base':len(base),'duplicateKeys':[k for k,n in keys.items() if n>1],'statuses':dict(collections.Counter(str(r['values'][12]) for r in base)),
 'calls':len(calls),'dates':dict(collections.Counter(str(r['values'][0])[:10] for r in calls)),
 'channels':dict(collections.Counter(str(r['values'][13]) for r in calls)), 'dispositions':dict(collections.Counter((str(r['values'][13]),str(r['values'][14])) for r in calls)) if False else list(collections.Counter((str(r['values'][13]),str(r['values'][14])) for r in calls).items()),
 'missingBase':sorted(set(str(r['values'][2]).strip() for r in calls)-set(keys)),
 'duplicateCalls':[k for k,n in callkeys.items() if n>1], 'surveysWithAnswers':len(surveys),
 'surveyOptions':{str(i):dict(collections.Counter(str(r['values'][i]) for r in surveys)) for i in [6,7,8,10,11]},
 'unmatchedSurveys':[r['row'] for r in surveys if (str(r['values'][0]),str(r['values'][1]).strip()) not in callkeys],
 'timeIssues':len(issues),'timeExamples':issues[:10], 'baseOldColumns':{str(i):dict(collections.Counter(str(r['values'][i]) for r in base if len(r['values'])>i and r['values'][i])) for i in [17,19,21]}}
 (root/f'{agent}-analysis.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(out,ensure_ascii=False))
print('shared keys',len(allkeys['ordaz']&allkeys['abechuco']),sorted(allkeys['ordaz']&allkeys['abechuco'])[:20])
