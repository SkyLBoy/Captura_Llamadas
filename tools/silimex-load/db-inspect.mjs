import 'dotenv/config';
import pg from 'pg';
const db=new pg.Client({host:process.env.PGHOST,port:Number(process.env.PGPORT||5432),database:process.env.PGDATABASE,user:process.env.PGUSER,password:process.env.PGPASSWORD});
await db.connect();
try {
 for(const [name,sql] of Object.entries({
 identity:'SELECT current_database(),current_user',
 users:'SELECT user_id,username,full_name,role,is_active FROM users ORDER BY user_id',
 campaigns:'SELECT campaign_id,name FROM campaigns',
 tables:"SELECT tablename,tableowner,has_table_privilege(current_user,quote_ident(tablename),'TRUNCATE') AS can_truncate FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
 channels:"SELECT c.channel_id,c.code,c.description,c.is_active,d.code AS disposition FROM channels c LEFT JOIN dispositions d USING(disposition_id) JOIN campaigns p ON p.campaign_id=c.campaign_id WHERE p.name='SILIMEX' ORDER BY c.code",
 questions:"SELECT q.question_id,q.code,q.question_text,q.question_type,q.required,o.option_id,o.option_text,o.requires_reason FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id) LEFT JOIN questionnaire_options o USING(question_id) WHERE c.name='SILIMEX' ORDER BY q.question_id,o.option_id",
 })) console.log(name,JSON.stringify((await db.query(sql)).rows));
} finally { await db.end(); }
