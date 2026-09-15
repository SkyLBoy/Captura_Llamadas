-- Exclusiones permanentes por cliente y campaña. Ejecutar como postgres.
-- No elimina ni modifica llamadas, encuestas ni asignaciones existentes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.contact_finalizations (
    attempt_id INTEGER PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES public.clients(client_id) ON DELETE RESTRICT,
    campaign_id INTEGER NOT NULL REFERENCES public.campaigns(campaign_id) ON DELETE RESTRICT,
    successful BOOLEAN NOT NULL,
    survey_completed BOOLEAN NOT NULL,
    finalized_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(attempt_id,client_id,campaign_id)
        REFERENCES public.call_attempts(attempt_id,client_id,campaign_id) ON DELETE RESTRICT,
    CHECK(successful OR survey_completed)
);
CREATE INDEX IF NOT EXISTS ix_finalizations_client_campaign
    ON public.contact_finalizations(client_id,campaign_id);

CREATE OR REPLACE FUNCTION public.protect_contact_finalization() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'La exclusión del contacto es permanente';
    END IF;
    PERFORM 1 FROM public.clients WHERE client_id=NEW.client_id FOR UPDATE;
    IF TG_OP='UPDATE' AND (
        (NEW.attempt_id,NEW.client_id,NEW.campaign_id,NEW.finalized_at,NEW.created_at)
        IS DISTINCT FROM (OLD.attempt_id,OLD.client_id,OLD.campaign_id,OLD.finalized_at,OLD.created_at)
        OR (OLD.successful AND NOT NEW.successful)
        OR (OLD.survey_completed AND NOT NEW.survey_completed)
    ) THEN RAISE EXCEPTION 'No se permite retirar ni cambiar el origen de una exclusión permanente'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.call_attempts a
        WHERE a.attempt_id=NEW.attempt_id AND a.client_id=NEW.client_id
          AND a.campaign_id=NEW.campaign_id AND a.state='closed'
          AND (NOT NEW.successful OR a.disposition_code_snapshot='EXITOSO'
               OR (TG_OP='UPDATE' AND OLD.successful))
          AND (NOT NEW.survey_completed OR EXISTS(SELECT 1 FROM public.call_surveys s
               WHERE s.attempt_id=a.attempt_id AND s.state='completed')
               OR (TG_OP='UPDATE' AND OLD.survey_completed))) THEN
        RAISE EXCEPTION 'La exclusión requiere una llamada cerrada exitosa o una encuesta completada';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_contact_finalization ON public.contact_finalizations;
CREATE TRIGGER protect_contact_finalization BEFORE INSERT OR UPDATE OR DELETE ON public.contact_finalizations
    FOR EACH ROW EXECUTE FUNCTION public.protect_contact_finalization();

CREATE OR REPLACE FUNCTION public.record_contact_finalization(p_attempt_id INTEGER) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.contact_finalizations(attempt_id,client_id,campaign_id,successful,survey_completed,finalized_at)
    SELECT a.attempt_id,a.client_id,a.campaign_id,
        a.disposition_code_snapshot='EXITOSO',COALESCE(s.state='completed',false),
        COALESCE(a.call_end,s.completed_at,a.created_at)
    FROM public.call_attempts a LEFT JOIN public.call_surveys s USING(attempt_id)
    WHERE a.attempt_id=p_attempt_id AND a.state='closed'
      AND (a.disposition_code_snapshot='EXITOSO' OR s.state='completed')
    ON CONFLICT(attempt_id) DO UPDATE SET
        successful=contact_finalizations.successful OR EXCLUDED.successful,
        survey_completed=contact_finalizations.survey_completed OR EXCLUDED.survey_completed
    WHERE (EXCLUDED.successful AND NOT contact_finalizations.successful)
       OR (EXCLUDED.survey_completed AND NOT contact_finalizations.survey_completed);
END $$;
CREATE OR REPLACE FUNCTION public.apply_contact_finalization() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM public.record_contact_finalization(NEW.attempt_id);
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS apply_contact_finalization ON public.call_attempts;
CREATE TRIGGER apply_contact_finalization AFTER INSERT OR UPDATE ON public.call_attempts
    FOR EACH ROW EXECUTE FUNCTION public.apply_contact_finalization();
DROP TRIGGER IF EXISTS apply_contact_finalization ON public.call_surveys;
CREATE TRIGGER apply_contact_finalization AFTER INSERT OR UPDATE ON public.call_surveys
    FOR EACH ROW EXECUTE FUNCTION public.apply_contact_finalization();

-- Se bloquean solo intentos NUEVOS. Un cierre en curso o un reintento idempotente
-- conserva su historial; importar llamadas históricas tampoco crea llamadas live.
CREATE OR REPLACE FUNCTION public.prevent_finalized_contact_call() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.origin='live' THEN
        PERFORM 1 FROM public.clients WHERE client_id=NEW.client_id FOR UPDATE;
        IF EXISTS(SELECT 1 FROM public.contact_finalizations f
            WHERE f.client_id=NEW.client_id AND f.campaign_id=NEW.campaign_id) THEN
            RAISE EXCEPTION 'Contacto finalizado: ya tuvo un resultado Exitoso o una encuesta contestada en esta campaña';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_prevent_finalized_contact_call ON public.call_attempts;
CREATE TRIGGER zz_prevent_finalized_contact_call BEFORE INSERT ON public.call_attempts
    FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_contact_call();

CREATE OR REPLACE FUNCTION public.prevent_finalized_contact_assignment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.ended_at IS NULL THEN
        PERFORM 1 FROM public.clients WHERE client_id=NEW.client_id FOR UPDATE;
        IF EXISTS(SELECT 1 FROM public.contact_finalizations f
            WHERE f.client_id=NEW.client_id AND f.campaign_id=NEW.campaign_id) THEN
            RAISE EXCEPTION 'No se puede asignar nuevamente un contacto finalizado en esta campaña';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_prevent_finalized_contact_assignment ON public.contact_assignments;
CREATE TRIGGER zz_prevent_finalized_contact_assignment BEFORE INSERT ON public.contact_assignments
    FOR EACH ROW EXECUTE FUNCTION public.prevent_finalized_contact_assignment();

DROP TRIGGER IF EXISTS audit_changes ON public.contact_finalizations;
CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.contact_finalizations
    FOR EACH ROW EXECUTE FUNCTION public.trg_audit_log('attempt_id');

-- Reconocer los resultados guardados antes de esta migración, sin inventar llamadas.
INSERT INTO public.contact_finalizations(attempt_id,client_id,campaign_id,successful,survey_completed,finalized_at)
SELECT a.attempt_id,a.client_id,a.campaign_id,a.disposition_code_snapshot='EXITOSO',
    COALESCE(s.state='completed',false),COALESCE(a.call_end,s.completed_at,a.created_at)
FROM public.call_attempts a LEFT JOIN public.call_surveys s USING(attempt_id)
WHERE a.state='closed' AND (a.disposition_code_snapshot='EXITOSO' OR s.state='completed')
ON CONFLICT(attempt_id) DO NOTHING;

CREATE OR REPLACE VIEW public.vw_contactos_finalizados AS
SELECT f.client_id,f.campaign_id,c.clave,c.razon_social,cam.name AS campaign,
    bool_or(f.successful) AS successful,bool_or(f.survey_completed) AS survey_completed,
    min(f.finalized_at) AS finalized_at,
    array_agg(f.attempt_id ORDER BY f.attempt_id) AS attempt_ids
FROM public.contact_finalizations f JOIN public.clients c USING(client_id)
JOIN public.campaigns cam ON cam.campaign_id=f.campaign_id
GROUP BY f.client_id,f.campaign_id,c.clave,c.razon_social,cam.name;

CREATE OR REPLACE VIEW public.vw_contactos_disponibles AS
SELECT a.assignment_id,a.campaign_id,a.agent_id,a.client_id,a.contact_id,c.clave,c.razon_social,c.sucursal
FROM public.contact_assignments a JOIN public.clients c USING(client_id) JOIN public.users u ON u.user_id=a.agent_id
JOIN public.campaigns cam ON cam.campaign_id=a.campaign_id
WHERE a.ended_at IS NULL AND a.started_at<=now() AND c.is_active AND u.is_active AND cam.is_active
AND NOT EXISTS(SELECT 1 FROM public.contact_blacklist b WHERE b.client_id=a.client_id
    AND b.campaign_id=a.campaign_id AND b.ended_at IS NULL)
AND NOT EXISTS(SELECT 1 FROM public.contact_finalizations f WHERE f.client_id=a.client_id AND f.campaign_id=a.campaign_id);

DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='vincco_app') THEN
        GRANT SELECT,INSERT,UPDATE ON public.contact_finalizations TO vincco_app;
        GRANT SELECT ON public.vw_contactos_finalizados,public.vw_contactos_disponibles TO vincco_app;
    END IF;
END $$;
COMMIT;
