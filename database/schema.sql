-- Captura de llamadas: PostgreSQL 14 o posterior.
-- Inicialización de una base VACÍA. No es una migración ni es repetible.
-- Ejecutar con: psql -X -v ON_ERROR_STOP=1 -d BASE_VACIA -f schema.sql
-- No crea usuarios del sistema ni contraseñas. El backend usa hashes Argon2/bcrypt.
-- MicroSIP realiza las llamadas; esta base registra atención y encuesta.
BEGIN;
SET LOCAL TIME ZONE 'America/Hermosillo';

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('agent','admin')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE campaigns (
    campaign_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO campaigns(name) VALUES ('PARTNER DELL'), ('SILIMEX');

CREATE TABLE dispositions (
    disposition_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    description VARCHAR(150) NOT NULL,
    counts_for_tpa BOOLEAN NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(campaign_id,code), UNIQUE(disposition_id,campaign_id)
);
CREATE TABLE channels (
    channel_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns ON DELETE RESTRICT,
    code VARCHAR(80) NOT NULL,
    description VARCHAR(200) NOT NULL,
    disposition_id INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(campaign_id,code), UNIQUE(channel_id,campaign_id),
    UNIQUE(channel_id,campaign_id,disposition_id),
    FOREIGN KEY(disposition_id,campaign_id)
        REFERENCES dispositions(disposition_id,campaign_id) ON DELETE RESTRICT,
    CHECK (NOT is_active OR disposition_id IS NOT NULL)
);

CREATE TABLE clients (
    client_id SERIAL PRIMARY KEY,
    -- Un espacio de claves por fuente evita asumir que CLAVE es única globalmente.
    source_namespace VARCHAR(100) NOT NULL,
    clave VARCHAR(50) NOT NULL,
    marca VARCHAR(100), tipo_compra VARCHAR(100),
    razon_social VARCHAR(250), sucursal VARCHAR(150),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(source_namespace,clave)
);
CREATE TABLE contact_persons (
    contact_id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients ON DELETE RESTRICT,
    nombre VARCHAR(200),
    ejecutivo VARCHAR(150), -- Texto original del Excel; no determina permisos.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(contact_id,client_id)
);
CREATE TABLE phone_numbers (
    phone_id SERIAL PRIMARY KEY,
    contact_id INTEGER NOT NULL REFERENCES contact_persons ON DELETE RESTRICT,
    type VARCHAR(20) NOT NULL CHECK(type IN ('main','reference1','reference2','mobile','other')),
    number VARCHAR(40) NOT NULL CHECK(length(btrim(number)) > 0),
    normalized_number VARCHAR(30), -- Normalización por país a cargo del importador.
    extension VARCHAR(20) NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(contact_id,number,extension,type)
);
CREATE INDEX ix_phone_normalized ON phone_numbers(normalized_number);
CREATE TABLE email_addresses (
    email_id SERIAL PRIMARY KEY,
    contact_id INTEGER NOT NULL REFERENCES contact_persons ON DELETE RESTRICT,
    email VARCHAR(320) NOT NULL CHECK(length(btrim(email)) > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(contact_id,email)
);
CREATE TABLE contact_assignments (
    assignment_id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients ON DELETE RESTRICT,
    contact_id INTEGER,
    campaign_id INTEGER NOT NULL REFERENCES campaigns ON DELETE RESTRICT,
    agent_id INTEGER NOT NULL REFERENCES users ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(contact_id,client_id) REFERENCES contact_persons(contact_id,client_id),
    UNIQUE(assignment_id,campaign_id,client_id,agent_id),
    CHECK(ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX uq_active_assignment ON contact_assignments(client_id,campaign_id)
    WHERE ended_at IS NULL;

CREATE TABLE call_attempts (
    attempt_id SERIAL PRIMARY KEY,
    -- El backend genera la clave UNA VEZ y la reutiliza al reintentar.
    idempotency_key UUID NOT NULL UNIQUE,
    assignment_id INTEGER NOT NULL,
    campaign_id INTEGER NOT NULL REFERENCES campaigns ON DELETE RESTRICT,
    client_id INTEGER NOT NULL REFERENCES clients ON DELETE RESTRICT,
    agent_id INTEGER NOT NULL REFERENCES users ON DELETE RESTRICT,
    contact_id INTEGER,
    dialed_number VARCHAR(40) NOT NULL CHECK(length(btrim(dialed_number)) > 0),
    dialed_extension VARCHAR(20),
    client_key_snapshot VARCHAR(50) NOT NULL,
    business_name_snapshot VARCHAR(250),
    contact_name_snapshot VARCHAR(200),
    agent_name_snapshot VARCHAR(150) NOT NULL,
    origin VARCHAR(20) NOT NULL DEFAULT 'live' CHECK(origin IN ('live','import')),
    state VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(state IN ('open','closed')),
    call_start TIMESTAMPTZ,
    call_end TIMESTAMPTZ,
    duration_issue TEXT,
    duration_sec INTERVAL GENERATED ALWAYS AS (
        CASE WHEN call_start IS NOT NULL AND call_end IS NOT NULL AND call_end >= call_start
             THEN call_end-call_start ELSE INTERVAL '0 seconds' END
    ) STORED,
    channel_id INTEGER,
    disposition_id INTEGER,
    channel_code_snapshot VARCHAR(80),
    disposition_code_snapshot VARCHAR(50),
    counts_for_tpa BOOLEAN,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(attempt_id,campaign_id), UNIQUE(attempt_id,client_id,campaign_id),
    FOREIGN KEY(assignment_id,campaign_id,client_id,agent_id)
        REFERENCES contact_assignments(assignment_id,campaign_id,client_id,agent_id) ON DELETE RESTRICT,
    FOREIGN KEY(contact_id,client_id) REFERENCES contact_persons(contact_id,client_id) ON DELETE RESTRICT,
    FOREIGN KEY(channel_id,campaign_id) REFERENCES channels(channel_id,campaign_id) ON DELETE RESTRICT,
    FOREIGN KEY(channel_id,campaign_id,disposition_id)
        REFERENCES channels(channel_id,campaign_id,disposition_id) ON DELETE RESTRICT,
    CHECK(state <> 'open' OR (origin='live' AND call_start IS NOT NULL AND call_end IS NULL
          AND channel_id IS NULL AND disposition_id IS NULL)),
    CHECK(state <> 'closed' OR (channel_id IS NOT NULL AND disposition_id IS NOT NULL
          AND channel_code_snapshot IS NOT NULL AND disposition_code_snapshot IS NOT NULL
          AND counts_for_tpa IS NOT NULL)),
    CHECK(origin <> 'live' OR (call_start IS NOT NULL AND (state='open' OR
          (call_end IS NOT NULL AND call_end >= call_start)))),
    CHECK(origin <> 'import' OR state='closed'),
    CHECK(state <> 'closed' OR (call_start IS NOT NULL AND call_end IS NOT NULL AND call_end >= call_start)
          OR length(btrim(duration_issue)) > 0 AND duration_issue IS NOT NULL)
);
CREATE UNIQUE INDEX uq_one_open_attempt_per_agent ON call_attempts(agent_id) WHERE state='open';
CREATE INDEX ix_call_attempts_period ON call_attempts(campaign_id,call_start);
CREATE INDEX ix_call_attempts_agent ON call_attempts(agent_id,call_start);
CREATE INDEX ix_call_attempts_assignment ON call_attempts(assignment_id);

-- Alcance por campaña, conservado del esquema revisado; confirmar antes de producción.
CREATE TABLE contact_blacklist (
    blacklist_id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients ON DELETE RESTRICT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns ON DELETE RESTRICT,
    attempt_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(attempt_id,client_id,campaign_id)
        REFERENCES call_attempts(attempt_id,client_id,campaign_id) ON DELETE RESTRICT,
    CHECK(ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX uq_active_blacklist ON contact_blacklist(client_id,campaign_id) WHERE ended_at IS NULL;

CREATE TABLE questionnaire_versions (
    version_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES campaigns ON DELETE RESTRICT,
    version_name VARCHAR(80) NOT NULL,
    effective_from DATE, effective_to DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(campaign_id,version_name), UNIQUE(version_id,campaign_id),
    CHECK(effective_to IS NULL OR effective_from IS NOT NULL AND effective_to >= effective_from)
);
CREATE TABLE questionnaire_questions (
    question_id SERIAL PRIMARY KEY,
    version_id INTEGER NOT NULL REFERENCES questionnaire_versions ON DELETE RESTRICT,
    code VARCHAR(40) NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(20) NOT NULL CHECK(question_type IN ('single_select','text')),
    required BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL CHECK(display_order > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(version_id,code), UNIQUE(version_id,display_order), UNIQUE(question_id,version_id)
);
CREATE TABLE questionnaire_options (
    option_id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questionnaire_questions ON DELETE RESTRICT,
    option_text TEXT NOT NULL,
    requires_reason BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL CHECK(display_order > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(question_id,display_order), UNIQUE(option_id,question_id)
);
CREATE TABLE call_surveys (
    survey_id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL UNIQUE,
    campaign_id INTEGER NOT NULL,
    version_id INTEGER NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed','declined')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(survey_id,version_id),
    FOREIGN KEY(attempt_id,campaign_id) REFERENCES call_attempts(attempt_id,campaign_id) ON DELETE RESTRICT,
    FOREIGN KEY(version_id,campaign_id) REFERENCES questionnaire_versions(version_id,campaign_id) ON DELETE RESTRICT,
    CHECK((state='pending' AND completed_at IS NULL) OR
          (state IN ('completed','declined') AND completed_at IS NOT NULL AND completed_at >= started_at))
);
CREATE TABLE survey_answers (
    answer_id SERIAL PRIMARY KEY,
    survey_id INTEGER NOT NULL,
    version_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    option_id INTEGER,
    answer_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(survey_id,question_id),
    FOREIGN KEY(survey_id,version_id) REFERENCES call_surveys(survey_id,version_id) ON DELETE RESTRICT,
    FOREIGN KEY(question_id,version_id) REFERENCES questionnaire_questions(question_id,version_id) ON DELETE RESTRICT,
    FOREIGN KEY(option_id,question_id) REFERENCES questionnaire_options(option_id,question_id) ON DELETE RESTRICT
);

CREATE TABLE import_log (
    import_id SERIAL PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_sha256 CHAR(64) NOT NULL,
    import_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id INTEGER NOT NULL REFERENCES users ON DELETE RESTRICT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns ON DELETE RESTRICT,
    rows_processed INTEGER NOT NULL DEFAULT 0 CHECK(rows_processed >= 0),
    result VARCHAR(20) NOT NULL CHECK(result IN ('pending','success','error','partial')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_successful_import ON import_log(campaign_id,file_sha256) WHERE result='success';
CREATE TABLE import_detail (
    detail_id SERIAL PRIMARY KEY,
    import_id INTEGER NOT NULL REFERENCES import_log ON DELETE RESTRICT,
    sheet_name TEXT NOT NULL,
    row_number INTEGER NOT NULL CHECK(row_number > 0),
    source_data JSONB NOT NULL,
    client_id INTEGER REFERENCES clients ON DELETE RESTRICT,
    attempt_id INTEGER REFERENCES call_attempts ON DELETE RESTRICT,
    survey_id INTEGER REFERENCES call_surveys ON DELETE RESTRICT,
    result VARCHAR(20) NOT NULL CHECK(result IN ('imported','duplicate','rejected')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(import_id,sheet_name,row_number)
);
CREATE TABLE audit_log (
    audit_id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    operation VARCHAR(10) NOT NULL CHECK(operation IN ('INSERT','UPDATE','DELETE')),
    changed_by_user_id INTEGER REFERENCES users ON DELETE RESTRICT,
    database_user TEXT NOT NULL DEFAULT current_user,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_values JSONB, new_values JSONB
);

-- Comprobaciones operativas. El backend sigue siendo responsable de autenticar
-- y autorizar; app.user_id es contexto de auditoría, NO una credencial.
CREATE FUNCTION validate_assignment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND (NEW.client_id,NEW.campaign_id,NEW.agent_id,NEW.contact_id,NEW.started_at)
       IS DISTINCT FROM (OLD.client_id,OLD.campaign_id,OLD.agent_id,OLD.contact_id,OLD.started_at) THEN
        RAISE EXCEPTION 'Cierre la asignación y cree otra; no cambie su identidad histórica';
    END IF;
    IF TG_OP='INSERT' THEN
        IF NOT EXISTS(SELECT 1 FROM users WHERE user_id=NEW.agent_id AND role='agent' AND is_active) THEN
            RAISE EXCEPTION 'Se requiere un agente activo';
        END IF;
        PERFORM 1 FROM clients WHERE client_id=NEW.client_id FOR UPDATE;
        IF NEW.ended_at IS NULL AND EXISTS(SELECT 1 FROM contact_blacklist
           WHERE client_id=NEW.client_id AND campaign_id=NEW.campaign_id AND ended_at IS NULL) THEN
            RAISE EXCEPTION 'Cliente en Blacklist';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER validate_assignment BEFORE INSERT OR UPDATE ON contact_assignments
    FOR EACH ROW EXECUTE FUNCTION validate_assignment();

CREATE FUNCTION validate_attempt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_channel channels%ROWTYPE; v_disp dispositions%ROWTYPE; v_asg contact_assignments%ROWTYPE;
BEGIN
    IF TG_OP='INSERT' THEN
        SELECT * INTO STRICT v_asg FROM contact_assignments WHERE assignment_id=NEW.assignment_id FOR UPDATE;
        SELECT clave,razon_social INTO NEW.client_key_snapshot,NEW.business_name_snapshot
            FROM clients WHERE client_id=NEW.client_id;
        SELECT full_name INTO NEW.agent_name_snapshot FROM users WHERE user_id=NEW.agent_id;
        IF NEW.contact_id IS NOT NULL THEN
            SELECT nombre INTO NEW.contact_name_snapshot FROM contact_persons WHERE contact_id=NEW.contact_id;
        END IF;
        IF NEW.origin='live' THEN
            IF v_asg.ended_at IS NOT NULL OR v_asg.started_at > NEW.call_start THEN
                RAISE EXCEPTION 'Asignación no vigente';
            END IF;
            IF NOT EXISTS(SELECT 1 FROM users WHERE user_id=NEW.agent_id AND role='agent' AND is_active)
               OR NOT EXISTS(SELECT 1 FROM clients WHERE client_id=NEW.client_id AND is_active)
               OR NOT EXISTS(SELECT 1 FROM campaigns WHERE campaign_id=NEW.campaign_id AND is_active) THEN
                RAISE EXCEPTION 'Agente, cliente o campaña inactivos';
            END IF;
        END IF;
    ELSE
        IF (NEW.assignment_id,NEW.client_id,NEW.campaign_id,NEW.agent_id,NEW.contact_id,
            NEW.dialed_number,NEW.dialed_extension,NEW.idempotency_key,NEW.origin,
            NEW.client_key_snapshot,NEW.business_name_snapshot,NEW.contact_name_snapshot,NEW.agent_name_snapshot)
           IS DISTINCT FROM
           (OLD.assignment_id,OLD.client_id,OLD.campaign_id,OLD.agent_id,OLD.contact_id,
            OLD.dialed_number,OLD.dialed_extension,OLD.idempotency_key,OLD.origin,
            OLD.client_key_snapshot,OLD.business_name_snapshot,OLD.contact_name_snapshot,OLD.agent_name_snapshot) THEN
            RAISE EXCEPTION 'No se permite alterar la identidad o el número histórico de una llamada';
        END IF;
        IF OLD.state='closed' AND NEW.state='open' THEN RAISE EXCEPTION 'No se permite reabrir un intento cerrado'; END IF;
    END IF;
    PERFORM 1 FROM clients WHERE client_id=NEW.client_id FOR UPDATE;
    IF NEW.origin='live' AND (TG_OP='INSERT' OR OLD.state='open') AND EXISTS(
        SELECT 1 FROM contact_blacklist WHERE client_id=NEW.client_id AND campaign_id=NEW.campaign_id AND ended_at IS NULL
    ) THEN RAISE EXCEPTION 'Cliente en Blacklist'; END IF;
    IF NEW.state='closed' THEN
        SELECT * INTO v_channel FROM channels WHERE channel_id=NEW.channel_id AND campaign_id=NEW.campaign_id;
        IF NOT FOUND OR v_channel.disposition_id IS NULL OR NOT v_channel.is_active THEN
            RAISE EXCEPTION 'Canalización inexistente, inactiva o pendiente de clasificación';
        END IF;
        IF NEW.disposition_id IS NOT NULL AND NEW.disposition_id<>v_channel.disposition_id THEN
            RAISE EXCEPTION 'Disposición incompatible con la canalización';
        END IF;
        SELECT * INTO STRICT v_disp FROM dispositions WHERE disposition_id=v_channel.disposition_id;
        IF NOT v_disp.is_active THEN RAISE EXCEPTION 'Disposición inactiva'; END IF;
        NEW.disposition_id := v_disp.disposition_id;
        NEW.channel_code_snapshot := v_channel.code;
        NEW.disposition_code_snapshot := v_disp.code;
        NEW.counts_for_tpa := v_disp.counts_for_tpa;
    ELSE
        NEW.channel_code_snapshot := NULL; NEW.disposition_code_snapshot := NULL; NEW.counts_for_tpa := NULL;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER validate_attempt BEFORE INSERT OR UPDATE ON call_attempts
    FOR EACH ROW EXECUTE FUNCTION validate_attempt();

CREATE FUNCTION apply_blacklist() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.state='closed' AND NEW.disposition_code_snapshot='BLACKLIST' THEN
        INSERT INTO contact_blacklist(client_id,campaign_id,attempt_id,reason)
        VALUES(NEW.client_id,NEW.campaign_id,NEW.attempt_id,NEW.channel_code_snapshot)
        ON CONFLICT(client_id,campaign_id) WHERE ended_at IS NULL DO NOTHING;
    END IF;
    -- Una corrección no retira automáticamente un bloqueo; lo hace el administrador con auditoría.
    RETURN NEW;
END $$;
CREATE TRIGGER apply_blacklist AFTER INSERT OR UPDATE ON call_attempts
    FOR EACH ROW EXECUTE FUNCTION apply_blacklist();

CREATE FUNCTION validate_blacklist() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM clients WHERE client_id=NEW.client_id FOR UPDATE;
    IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM call_attempts WHERE attempt_id=NEW.attempt_id
       AND client_id=NEW.client_id AND campaign_id=NEW.campaign_id AND state='closed'
       AND disposition_code_snapshot='BLACKLIST') THEN
        RAISE EXCEPTION 'El bloqueo requiere una llamada clasificada como Blacklist';
    END IF;
    IF TG_OP='UPDATE' AND (NEW.client_id,NEW.campaign_id,NEW.attempt_id,NEW.reason,NEW.started_at)
       IS DISTINCT FROM (OLD.client_id,OLD.campaign_id,OLD.attempt_id,OLD.reason,OLD.started_at) THEN
        RAISE EXCEPTION 'Conserve el origen del bloqueo; finalícelo y registre otro si corresponde';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER validate_blacklist BEFORE INSERT OR UPDATE ON contact_blacklist
    FOR EACH ROW EXECUTE FUNCTION validate_blacklist();

-- Validación diferida: permite insertar respuestas y cerrar encuesta/llamada en
-- cualquier orden DENTRO DE LA MISMA TRANSACCIÓN, pero nunca confirmar incompletas.
CREATE FUNCTION validate_survey(p_id INTEGER) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE s call_surveys%ROWTYPE; a call_attempts%ROWTYPE;
BEGIN
    SELECT * INTO s FROM call_surveys WHERE survey_id=p_id;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT * INTO STRICT a FROM call_attempts WHERE attempt_id=s.attempt_id;
    IF a.state='closed' AND (s.state='pending' OR (a.origin='live' AND a.call_end<s.completed_at)) THEN
        RAISE EXCEPTION 'Complete o decline la encuesta antes de finalizar la atención';
    END IF;
    IF s.state='declined' AND EXISTS(SELECT 1 FROM survey_answers WHERE survey_id=p_id) THEN
        RAISE EXCEPTION 'Una negativa no debe contener respuestas';
    END IF;
    IF EXISTS(SELECT 1 FROM survey_answers r JOIN questionnaire_questions q USING(question_id)
        LEFT JOIN questionnaire_options o USING(option_id)
        WHERE r.survey_id=p_id AND
          ((q.question_type='single_select' AND r.option_id IS NULL)
           OR (q.question_type='text' AND (r.option_id IS NOT NULL OR NULLIF(btrim(r.answer_text),'') IS NULL))
           OR (o.requires_reason AND NULLIF(btrim(r.answer_text),'') IS NULL))) THEN
        RAISE EXCEPTION 'Respuesta incompleta o incompatible con el tipo de pregunta';
    END IF;
    IF s.state='completed' AND (
       NOT EXISTS(SELECT 1 FROM questionnaire_questions WHERE version_id=s.version_id)
       OR EXISTS(SELECT 1 FROM questionnaire_questions q WHERE q.version_id=s.version_id AND q.required
          AND NOT EXISTS(SELECT 1 FROM survey_answers r WHERE r.survey_id=p_id AND r.question_id=q.question_id))) THEN
        RAISE EXCEPTION 'Faltan respuestas obligatorias';
    END IF;
END $$;
CREATE FUNCTION check_survey_deferred() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_id INTEGER;
BEGIN
    IF TG_TABLE_NAME='call_attempts' THEN
        FOR v_id IN SELECT survey_id FROM call_surveys WHERE attempt_id=NEW.attempt_id LOOP
            PERFORM validate_survey(v_id);
        END LOOP;
    ELSE
        IF TG_OP<>'DELETE' THEN PERFORM validate_survey(NEW.survey_id); END IF;
        IF TG_OP<>'INSERT' THEN PERFORM validate_survey(OLD.survey_id); END IF;
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER survey_integrity AFTER INSERT OR UPDATE ON call_surveys
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_survey_deferred();
CREATE CONSTRAINT TRIGGER answer_integrity AFTER INSERT OR UPDATE OR DELETE ON survey_answers
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_survey_deferred();
CREATE CONSTRAINT TRIGGER attempt_survey_integrity AFTER INSERT OR UPDATE ON call_attempts
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_survey_deferred();

CREATE FUNCTION protect_questionnaire() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_id INTEGER; old_id INTEGER;
BEGIN
    IF TG_TABLE_NAME='questionnaire_options' THEN
        IF TG_OP<>'DELETE' THEN SELECT version_id INTO v_id FROM questionnaire_questions WHERE question_id=NEW.question_id; END IF;
        IF TG_OP<>'INSERT' THEN SELECT version_id INTO old_id FROM questionnaire_questions WHERE question_id=OLD.question_id; END IF;
    ELSE
        IF TG_OP<>'DELETE' THEN v_id:=NEW.version_id; END IF;
        IF TG_OP<>'INSERT' THEN old_id:=OLD.version_id; END IF;
    END IF;
    -- Serializa cambios de definición con el inicio de encuestas.
    PERFORM 1 FROM questionnaire_versions WHERE version_id IN (v_id,old_id) ORDER BY version_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM call_surveys WHERE version_id IN (v_id,old_id)) THEN
        RAISE EXCEPTION 'Cuestionario usado: cree otra versión para cambiar su definición';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER protect_question BEFORE INSERT OR UPDATE OR DELETE ON questionnaire_questions
    FOR EACH ROW EXECUTE FUNCTION protect_questionnaire();
CREATE TRIGGER protect_option BEFORE INSERT OR UPDATE OR DELETE ON questionnaire_options
    FOR EACH ROW EXECUTE FUNCTION protect_questionnaire();
CREATE TRIGGER protect_version BEFORE UPDATE OR DELETE ON questionnaire_versions
    FOR EACH ROW EXECUTE FUNCTION protect_questionnaire();
CREATE FUNCTION lock_survey_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND (NEW.attempt_id,NEW.version_id,NEW.campaign_id) IS DISTINCT FROM
       (OLD.attempt_id,OLD.version_id,OLD.campaign_id) THEN RAISE EXCEPTION 'No cambie la identidad de una encuesta'; END IF;
    PERFORM 1 FROM questionnaire_versions WHERE version_id=NEW.version_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Versión inactiva o inexistente'; END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER lock_survey_version BEFORE INSERT OR UPDATE ON call_surveys
    FOR EACH ROW EXECUTE FUNCTION lock_survey_version();

CREATE FUNCTION set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;
DO $$ DECLARE t TEXT; BEGIN
    FOR t IN SELECT table_name FROM information_schema.columns
       WHERE table_schema='public' AND column_name='updated_at' AND table_name IN (
       'users','campaigns','dispositions','channels','clients','contact_persons','phone_numbers','email_addresses',
       'contact_assignments','call_attempts','contact_blacklist','questionnaire_versions','questionnaire_questions',
       'questionnaire_options','call_surveys','survey_answers','import_log','import_detail') LOOP
        EXECUTE format('CREATE TRIGGER stamp_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',t);
    END LOOP;
END $$;
CREATE FUNCTION trg_audit_log() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE o JSONB; n JSONB; actor INTEGER;
BEGIN
    IF TG_OP<>'INSERT' THEN o:=to_jsonb(OLD); END IF;
    IF TG_OP<>'DELETE' THEN n:=to_jsonb(NEW); END IF;
    actor:=NULLIF(current_setting('app.user_id',true),'')::INTEGER;
    INSERT INTO audit_log(table_name,record_id,operation,changed_by_user_id,old_values,new_values)
    VALUES(TG_TABLE_NAME,(COALESCE(n,o)->>TG_ARGV[0])::INTEGER,TG_OP,actor,o,n);
    RETURN NULL;
END $$;
-- Clave primaria explícita para cada tabla. No se auditan contraseñas.
DO $$ DECLARE t TEXT; k TEXT; BEGIN
    FOR t,k IN SELECT * FROM (VALUES
      ('clients','client_id'),('contact_persons','contact_id'),('phone_numbers','phone_id'),
      ('email_addresses','email_id'),('contact_assignments','assignment_id'),('call_attempts','attempt_id'),
      ('contact_blacklist','blacklist_id'),('call_surveys','survey_id'),('survey_answers','answer_id'),
      ('channels','channel_id'),('dispositions','disposition_id')) AS x(t,k) LOOP
        EXECUTE format('CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION trg_audit_log(%L)',t,k);
    END LOOP;
END $$;

-- Catálogos: se cargan solo correspondencias confirmadas. Las pendientes están
-- presentes, inactivas y sin disposición; nunca se eliminan silenciosamente por JOIN.
INSERT INTO dispositions(campaign_id,code,description,counts_for_tpa)
SELECT c.campaign_id,d.code,d.label,d.tpa FROM campaigns c CROSS JOIN (VALUES
 ('BACKOFFICE','Backoffice',TRUE),('BLACKLIST','Blacklist',TRUE),('EXITOSO','Exitoso',TRUE),
 ('NO_CONTESTA','No Contesta',FALSE),('SEGUIMIENTO','Seguimiento',TRUE)) AS d(code,label,tpa);
INSERT INTO channels(campaign_id,code,description,disposition_id,is_active)
SELECT c.campaign_id,ch.code,ch.label,d.disposition_id,d.disposition_id IS NOT NULL
FROM campaigns c CROSS JOIN (VALUES
 ('NO_LE_INTERESA_INFORMACION','NO LE INTERESA INFORMACIÓN','BLACKLIST'),
 ('NUMERO_EQUIVOCADO','NUMERO EQUIVOCADO','BLACKLIST'),
 ('NUEVOS_DATOS_RAZON_SOCIAL','NUEVOS DATOS: cambio de razón social','BLACKLIST'),
 ('BLACKLIST','BLACKLIST','BLACKLIST'),
 ('NO_CONTESTA','NO CONTESTA','NO_CONTESTA'),
 ('BUZON','BUZON','SEGUIMIENTO'),
 ('SE_ENVIA_PROMOCION_POR_CORREO','SE ENVIA PROMOCION POR CORREO','EXITOSO'),
 ('AGENDA_LLAMADA','AGENDA LLAMADA',NULL),('CLIENTE_INACTIVO','CLIENTE INACTIVO',NULL),
 ('COLGO','COLGO',NULL),('NO_LE_INTERESA_PROMOCION','NO LE INTERESA PROMOCION',NULL),
 ('NO_LE_INTERESA_PROMOCION_DEL_MES','NO LE INTERESA PROMOCION DEL MES',NULL),
 ('NUEVOS_DATOS','NUEVOS DATOS',NULL),('QUEJA','QUEJA',NULL),('SE_CORTA_LLAMADA','SE CORTA LLAMADA',NULL),
 ('SE_MENCIONA_PROMOCION','SE MENCIONA PROMOCION',NULL),('SOLICITA_COTIZACION','SOLICITA COTIZACION',NULL)
) AS ch(code,label,disp)
LEFT JOIN dispositions d ON d.campaign_id=c.campaign_id AND d.code=ch.disp;

-- ENCUESTAS 2: se añaden preguntas/opciones desde el Excel en el bloque siguiente.
INSERT INTO questionnaire_versions(campaign_id,version_name)
SELECT campaign_id,'ENCUESTAS 2' FROM campaigns WHERE name='SILIMEX';

-- Preguntas y opciones verificadas en ENCUESTAS 2 / DATOS (AS:AW).
INSERT INTO questionnaire_questions(version_id,code,question_text,question_type,display_order)
SELECT version_id,'Q1','1. ¿Qué marca de productos de limpieza y mantenimiento para equipo de cómputo/electrónica comercializan o consumen principalmente en su negocio?','single_select',1
FROM questionnaire_versions v JOIN campaigns c USING(campaign_id) WHERE c.name='SILIMEX' AND version_name='ENCUESTAS 2';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'Silimex',false,1
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q1';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'Perfect Choice',false,2
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q1';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'Prolicom',false,3
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q1';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'Vorago',false,4
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q1';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'Steren',false,5
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q1';
INSERT INTO questionnaire_questions(version_id,code,question_text,question_type,display_order)
SELECT version_id,'Q2','2. Al momento de seleccionar una marca de limpiadores técnicos (duster/aire comprimido, limpiadores de pantallas y circuitos), ¿cuál es el factor determinante en su decisión?','single_select',2
FROM questionnaire_versions v JOIN campaigns c USING(campaign_id) WHERE c.name='SILIMEX' AND version_name='ENCUESTAS 2';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'Calidad',false,1
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q2';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'Precio',false,2
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q2';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'Disponibilidad',false,3
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q2';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'Promocion',false,4
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q2';
INSERT INTO questionnaire_questions(version_id,code,question_text,question_type,display_order)
SELECT version_id,'Q3','3. Pensando en los limpiadores de aire comprimido que utiliza actualmente, ¿Cómo califica su calidad, durabilidad y eficiencia general?','single_select',3
FROM questionnaire_versions v JOIN campaigns c USING(campaign_id) WHERE c.name='SILIMEX' AND version_name='ENCUESTAS 2';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'a) Excelente',false,1
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q3';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'b) Aceptable',false,2
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q3';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'c) Deficiente -> Explicar Razón',true,3
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q3';
INSERT INTO questionnaire_questions(version_id,code,question_text,question_type,display_order)
SELECT version_id,'Q4','4. ¿Qué tipo de características o beneficios valoran más usted o su equipo de ventas al promover una línea específica de accesorios/mantenimiento?','single_select',4
FROM questionnaire_versions v JOIN campaigns c USING(campaign_id) WHERE c.name='SILIMEX' AND version_name='ENCUESTAS 2';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'a) Precio',false,1
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q4';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'b) Calidad',false,2
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q4';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'c) Beneficios por compras de volumen',false,3
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q4';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'d) Capacitacion',false,4
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q4';
INSERT INTO questionnaire_questions(version_id,code,question_text,question_type,display_order)
SELECT version_id,'Q5','5. Si le ofrecieran un producto de limpieza técnico de alta calidad garantizada ¿qué tan dispuesto estaría a probarlo o migrar de marca?','single_select',5
FROM questionnaire_versions v JOIN campaigns c USING(campaign_id) WHERE c.name='SILIMEX' AND version_name='ENCUESTAS 2';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'a) Muy dispuesto',false,1
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q5';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'b) Moderadamente dispuesto',false,2
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q5';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'c) Poco dispuesto',false,3
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q5';
INSERT INTO questionnaire_options(question_id,option_text,requires_reason,display_order)
SELECT q.question_id,'d) Indiferente -> Explicar Razón',true,4
FROM questionnaire_questions q JOIN questionnaire_versions v USING(version_id) JOIN campaigns c USING(campaign_id)
WHERE c.name='SILIMEX' AND v.version_name='ENCUESTAS 2' AND q.code='Q5';

-- Vistas: una fila por intento en histórico, respuestas en una vista separada.
CREATE VIEW vw_contactos_disponibles AS
SELECT a.assignment_id,a.campaign_id,a.agent_id,a.client_id,a.contact_id,c.clave,c.razon_social,c.sucursal
FROM contact_assignments a JOIN clients c USING(client_id) JOIN users u ON u.user_id=a.agent_id
JOIN campaigns cam ON cam.campaign_id=a.campaign_id
WHERE a.ended_at IS NULL AND a.started_at<=now() AND c.is_active AND u.is_active AND cam.is_active
AND NOT EXISTS(SELECT 1 FROM contact_blacklist b WHERE b.client_id=a.client_id
    AND b.campaign_id=a.campaign_id AND b.ended_at IS NULL);
CREATE VIEW vw_catalogo_pendiente AS SELECT c.name AS campaign,ch.code,ch.description
FROM channels ch JOIN campaigns c USING(campaign_id) WHERE ch.disposition_id IS NULL;
CREATE VIEW vw_historico_detalle AS
SELECT a.attempt_id,a.campaign_id,c.name AS campaña,a.agent_id,a.agent_name_snapshot AS agente,
 a.client_id,a.client_key_snapshot AS cliente_clave,a.business_name_snapshot AS cliente_razon_social,
 a.contact_name_snapshot AS contacto_nombre,a.dialed_number AS teléfono_marcado,a.dialed_extension AS extensión,
 a.call_start AT TIME ZONE 'America/Hermosillo' AS llamada_inicio,
 a.call_end AT TIME ZONE 'America/Hermosillo' AS llamada_fin,a.state,a.origin,a.duration_sec,a.duration_issue,
 a.channel_code_snapshot AS canalización,a.disposition_code_snapshot AS disposición,a.notes,
 s.state AS encuesta_estado,v.version_name AS encuesta_version
FROM call_attempts a JOIN campaigns c USING(campaign_id)
LEFT JOIN call_surveys s USING(attempt_id) LEFT JOIN questionnaire_versions v ON v.version_id=s.version_id;
CREATE VIEW vw_respuestas_encuesta AS
SELECT s.survey_id,s.attempt_id,s.campaign_id,s.version_id,v.version_name,s.state,
 q.question_id,q.code,q.question_text,o.option_id,o.option_text,r.answer_text
FROM call_surveys s JOIN questionnaire_versions v USING(version_id)
JOIN survey_answers r ON r.survey_id=s.survey_id JOIN questionnaire_questions q ON q.question_id=r.question_id
LEFT JOIN questionnaire_options o ON o.option_id=r.option_id;
CREATE VIEW vw_resultados_encuesta AS
SELECT s.campaign_id,s.version_id,v.version_name,
 date_trunc('month',a.call_start AT TIME ZONE 'America/Hermosillo') AS mes,
 q.question_id,q.question_text,o.option_id,o.option_text,COUNT(*) AS cantidad
FROM call_surveys s JOIN call_attempts a USING(attempt_id) JOIN questionnaire_versions v USING(version_id)
JOIN survey_answers r ON r.survey_id=s.survey_id JOIN questionnaire_questions q ON q.question_id=r.question_id
JOIN questionnaire_options o ON o.option_id=r.option_id
WHERE s.state='completed' AND a.state='closed'
GROUP BY s.campaign_id,s.version_id,v.version_name,mes,q.question_id,q.question_text,o.option_id,o.option_text;
CREATE VIEW vw_estados_encuesta AS
SELECT s.campaign_id,s.version_id,date_trunc('month',a.call_start AT TIME ZONE 'America/Hermosillo') AS mes,
 s.state,COUNT(*) AS cantidad FROM call_surveys s JOIN call_attempts a USING(attempt_id)
GROUP BY s.campaign_id,s.version_id,mes,s.state;

-- LLAMADAS del concentrado: se conserva la interpretación previa de atendidas
-- (disposición distinta de NO_CONTESTA). Confirmar antes de emitir un cierre real.
CREATE VIEW vw_concentrado_mensual AS
SELECT a.campaign_id,c.name AS campaña,
 date_trunc('month',a.call_start AT TIME ZONE 'America/Hermosillo') AS mes,
 COUNT(*) AS total_marcaciones,
 COUNT(*) FILTER(WHERE a.state='closed') AS intentos_cerrados,
 COUNT(*) FILTER(WHERE a.state='open') AS intentos_abiertos,
 COUNT(*) FILTER(WHERE a.state='closed' AND a.counts_for_tpa) AS llamadas,
 ROUND(100.0*COUNT(*) FILTER(WHERE a.state='closed' AND a.counts_for_tpa)/NULLIF(COUNT(*),0),2) AS porcentaje_contestacion,
 COUNT(*) FILTER(WHERE a.state='closed' AND a.disposition_code_snapshot='BACKOFFICE') AS backoffice,
 COUNT(*) FILTER(WHERE a.state='closed' AND a.disposition_code_snapshot='BLACKLIST') AS blacklist,
 COUNT(*) FILTER(WHERE a.state='closed' AND a.disposition_code_snapshot='EXITOSO') AS exitoso,
 COUNT(*) FILTER(WHERE a.state='closed' AND a.disposition_code_snapshot='SEGUIMIENTO') AS seguimiento,
 COUNT(*) FILTER(WHERE a.state='closed' AND a.channel_code_snapshot='COLGO') AS colgo,
 COUNT(*) FILTER(WHERE a.state='closed' AND a.channel_code_snapshot='NUEVOS_DATOS') AS nuevos_datos,
 COALESCE(SUM(a.duration_sec) FILTER(WHERE a.state='closed' AND a.counts_for_tpa),INTERVAL '0 seconds') AS duracion_tpa,
 COALESCE(AVG(a.duration_sec) FILTER(WHERE a.state='closed' AND a.counts_for_tpa),INTERVAL '0 seconds') AS tpa_promedio
FROM call_attempts a JOIN campaigns c USING(campaign_id)
WHERE a.call_start IS NOT NULL GROUP BY a.campaign_id,c.name,mes;
CREATE VIEW vw_total_intentos AS SELECT campaign_id,campaña,mes,EXTRACT(YEAR FROM mes)::INTEGER AS ano,
 total_marcaciones AS total_intentos FROM vw_concentrado_mensual;
CREATE VIEW vw_llamadas_atendidas AS SELECT campaign_id,campaña,mes,llamadas AS llamadas_atendidas FROM vw_concentrado_mensual;
CREATE VIEW vw_porcentaje_contestacion AS SELECT campaign_id,campaña,mes,total_marcaciones,llamadas,porcentaje_contestacion FROM vw_concentrado_mensual;
CREATE VIEW vw_tpa AS SELECT a.campaign_id,a.campaña,a.mes,a.llamadas AS total_intentos_para_tpa,
 a.duracion_tpa,a.tpa_promedio,COALESCE(p.tpa_promedio,INTERVAL '0 seconds') AS tpa_mes_anterior,
 p.campaign_id IS NOT NULL AS hay_datos_mes_anterior
FROM vw_concentrado_mensual a LEFT JOIN vw_concentrado_mensual p
 ON p.campaign_id=a.campaign_id AND p.mes=a.mes-INTERVAL '1 month';
CREATE VIEW vw_concentrado_por_disposition AS SELECT campaign_id,
 date_trunc('month',call_start AT TIME ZONE 'America/Hermosillo') AS mes,
 disposition_code_snapshot AS disposition,COUNT(*) AS cantidad FROM call_attempts
WHERE state='closed' GROUP BY campaign_id,mes,disposition_code_snapshot;
CREATE VIEW vw_intentos_sin_fecha AS SELECT attempt_id,campaign_id,agent_id,state,duration_issue
FROM call_attempts WHERE call_start IS NULL;

-- El backend debe usar SET LOCAL app.user_id = 'ID_AUTENTICADO' en cada transacción,
-- filtrar por agente y reutilizar idempotency_key. No dar acceso SQL a los navegadores.
-- Los catálogos pendientes, el alcance de claves/bloqueos y LLAMADAS requieren
-- confirmación. No se inventan reglas ni se activan correspondencias pendientes.
COMMIT;
