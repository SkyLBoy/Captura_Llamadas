BEGIN;
CREATE TABLE IF NOT EXISTS public.historical_monthly_totals (
 campaign_id integer NOT NULL REFERENCES campaigns, year integer NOT NULL, month integer NOT NULL CHECK(month BETWEEN 1 AND 12),
 total_marcaciones integer NOT NULL, llamadas integer NOT NULL, backoffice integer NOT NULL, blacklist integer NOT NULL,
 exitoso integer NOT NULL, colgo integer NOT NULL, nuevos_datos integer NOT NULL, seguimiento integer NOT NULL,
 tpa_seconds double precision, source_file text NOT NULL, source_sha256 text NOT NULL,
 PRIMARY KEY(campaign_id,year,month)
);
CREATE TABLE IF NOT EXISTS public.historical_survey_records (
 historical_survey_id serial PRIMARY KEY, client_id integer NOT NULL REFERENCES clients,
 campaign_id integer NOT NULL REFERENCES campaigns, agent_id integer NOT NULL REFERENCES users,
 version_id integer NOT NULL REFERENCES questionnaire_versions, completed_at timestamptz NOT NULL,
 business_name text, branch text, answers jsonb NOT NULL, source_file text NOT NULL,
 source_sha256 text NOT NULL, source_row integer NOT NULL, UNIQUE(source_sha256,source_row)
);
ALTER TABLE public.historical_survey_records ADD COLUMN IF NOT EXISTS matched_attempt_id integer REFERENCES call_attempts;
ALTER TABLE public.historical_survey_records ADD COLUMN IF NOT EXISTS link_issue text;
ALTER TABLE public.historical_survey_records ADD COLUMN IF NOT EXISTS raw_data jsonb;
CREATE TABLE IF NOT EXISTS public.call_import_provenance (
 attempt_id integer PRIMARY KEY REFERENCES call_attempts, source_file text NOT NULL,
 source_sha256 text NOT NULL, source_sheet text NOT NULL, source_row integer NOT NULL,
 raw_data jsonb NOT NULL, UNIQUE(source_sha256,source_sheet,source_row)
);
-- Only imported attempts may refer to an inactive historical questionnaire.
CREATE OR REPLACE FUNCTION public.lock_survey_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.attempt_id,NEW.version_id,NEW.campaign_id) IS DISTINCT FROM
 (OLD.attempt_id,OLD.version_id,OLD.campaign_id) THEN RAISE EXCEPTION 'No cambie la identidad de una encuesta'; END IF;
 PERFORM 1 FROM questionnaire_versions v WHERE v.version_id=NEW.version_id
 AND (v.is_active OR EXISTS(SELECT 1 FROM call_attempts a WHERE a.attempt_id=NEW.attempt_id AND a.origin='import')) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Versión inactiva o inexistente'; END IF;
 RETURN NEW;
END $$;
-- Imported independent surveys are completed evidence, without invented call attempts.
CREATE OR REPLACE VIEW public.vw_contactos_finalizados AS
WITH origins AS (
 SELECT client_id,campaign_id,successful,survey_completed,finalized_at,attempt_id FROM contact_finalizations
 UNION ALL SELECT client_id,campaign_id,false,true,completed_at,NULL::integer FROM historical_survey_records
)
SELECT f.client_id,f.campaign_id,c.clave,c.razon_social,cam.name AS campaign,
 bool_or(f.successful) AS successful,bool_or(f.survey_completed) AS survey_completed,
 min(f.finalized_at) AS finalized_at,
 coalesce(array_agg(DISTINCT f.attempt_id ORDER BY f.attempt_id) FILTER(WHERE f.attempt_id IS NOT NULL),'{}'::integer[]) AS attempt_ids
FROM origins f JOIN clients c USING(client_id) JOIN campaigns cam ON cam.campaign_id=f.campaign_id
GROUP BY f.client_id,f.campaign_id,c.clave,c.razon_social,cam.name;
CREATE OR REPLACE VIEW public.vw_contactos_disponibles AS
SELECT a.assignment_id,a.campaign_id,a.agent_id,a.client_id,a.contact_id,c.clave,c.razon_social,c.sucursal
FROM contact_assignments a JOIN clients c USING(client_id) JOIN users u ON u.user_id=a.agent_id
JOIN campaigns cam ON cam.campaign_id=a.campaign_id
WHERE a.ended_at IS NULL AND a.started_at<=now() AND c.is_active AND u.is_active AND cam.is_active
AND NOT EXISTS(SELECT 1 FROM contact_blacklist b WHERE b.client_id=a.client_id AND b.campaign_id=a.campaign_id AND b.ended_at IS NULL)
AND NOT EXISTS(SELECT 1 FROM vw_contactos_finalizados f WHERE f.client_id=a.client_id AND f.campaign_id=a.campaign_id);
CREATE OR REPLACE FUNCTION public.prevent_finalized_contact_call() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.origin='live' THEN
  PERFORM 1 FROM clients WHERE client_id=NEW.client_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM vw_contactos_finalizados f WHERE f.client_id=NEW.client_id AND f.campaign_id=NEW.campaign_id) THEN
   RAISE EXCEPTION 'Contacto finalizado: resultado exitoso o encuesta contestada en esta campaña';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.prevent_finalized_contact_assignment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.ended_at IS NULL THEN
  PERFORM 1 FROM clients WHERE client_id=NEW.client_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM vw_contactos_finalizados f WHERE f.client_id=NEW.client_id AND f.campaign_id=NEW.campaign_id) THEN
   RAISE EXCEPTION 'No se puede asignar nuevamente un contacto finalizado en esta campaña';
  END IF;
 END IF;
 RETURN NEW;
END $$;
GRANT SELECT ON historical_monthly_totals,historical_survey_records,call_import_provenance TO vincco_app;
COMMIT;
