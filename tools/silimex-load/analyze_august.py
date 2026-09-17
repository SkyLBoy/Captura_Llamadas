import json,pathlib,collections
root=pathlib.Path(__file__).parent
data=json.loads((root/'agosto-data.json').read_text(encoding='utf8'))
print('AUGUST HEADERS',json.dumps(data['SILIMEX'][:12],ensure_ascii=False))
print('CONCENTRADO',json.dumps(data['CONCENTRADO'],ensure_ascii=False))
rows=[r for r in data['SILIMEX'] if isinstance(r['values'][0],str) and r['values'][0].startswith('2026-')]
print('CALL DETAIL',len(rows),'MONTHS',collections.Counter(r['values'][0][:7] for r in rows))
print('AGENTS',collections.Counter(str(r['values'][6]) for r in rows))
print('CHANNELS',collections.Counter((str(r['values'][3]),str(r['values'][4])) for r in rows))
surveys=data['ENCUESTA'][1:]
print('SURVEYS',len(surveys),'MONTHS',collections.Counter(str(r['values'][0])[:7] for r in surveys),'AGENTS',collections.Counter(str(r['values'][2]) for r in surveys))
sep=json.loads((root/'abechuco12-data.json').read_text(encoding='utf8'))
calls=[r for r in sep['LLAMADAS'][1:] if r['values'][0] or r['values'][13]]
answers=[r for r in sep['ENCUESTAS 2'][1:] if any(r['values'][i] for i in [6,7,8,9,10,11,12])]
print('SEP12',len(calls),collections.Counter(str(r['values'][0])[:10] for r in calls),'SURVEYS',len(answers),'CHANNELS',collections.Counter((r['values'][13],r['values'][14]) for r in calls))
print('SEP12 SURVEY OPTIONS',{i:dict(collections.Counter(str(r['values'][i]) for r in answers)) for i in [6,7,8,10,11]})
print('SEP12 BASE DELTA',sum(a['values'][:16]!=b['values'][:16] for a,b in zip(sep['BASE'],json.loads((root/'abechuco-data.json').read_text(encoding='utf8'))['BASE'])))
known=set()
for agent in ['ordaz','abechuco']:
 source=json.loads((root/f'{agent}-data.json').read_text(encoding='utf8'))
 known.update(str(r['values'][0]).strip().upper() for r in source['BASE'][1:] if r['values'][0])
missing=[r for r in rows if str(r['values'][2]).strip().upper() not in known]
print('HISTORY MISSING CURRENT BASE',len(missing),'uniqueClients',len(set(str(r['values'][2]).strip() for r in missing)))
print('DETAIL DUPLICATES',sum(n-1 for n in collections.Counter(tuple(r['values']) for r in rows).values() if n>1))
index=collections.Counter((r['values'][0],str(r['values'][2]).strip().upper(),r['values'][6]) for r in rows)
missingSurveys=[r for r in surveys if (r['values'][0],str(r['values'][1]).strip().upper(),r['values'][2]) not in index]
print('UNMATCHED HISTORICAL SURVEYS',len(missingSurveys),'examples',[(r['row'],r['values'][:3]) for r in missingSurveys[:4]])
categories=collections.Counter()
examples=[]
for survey in missingSurveys:
 v=survey['values']; candidates=[r for r in rows if r['values'][0][:10]==v[0][:10] and str(r['values'][2]).strip().upper()==str(v[1]).strip().upper() and r['values'][6]==v[2]]
 categories[len(candidates)]+=1
 if len(examples)<6:examples.append({'surveyRow':survey['row'],'surveyDate':v[0],'calls':[(r['row'],r['values'][0],r['values'][3],r['values'][7]) for r in candidates]})
print('SAME DAY CANDIDATES',categories,'EXAMPLES',examples)
