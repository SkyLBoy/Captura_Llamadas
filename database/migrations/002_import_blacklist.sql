-- Ejecutar una vez en la base existente, como propietario de las tablas.
BEGIN;
ALTER TABLE contact_blacklist ALTER COLUMN attempt_id DROP NOT NULL;
ALTER TABLE contact_blacklist ADD COLUMN IF NOT EXISTS import_detail_id INTEGER REFERENCES import_detail(detail_id) ON DELETE RESTRICT;
ALTER TABLE contact_blacklist DROP CONSTRAINT IF EXISTS blacklist_one_source;
ALTER TABLE contact_blacklist ADD CONSTRAINT blacklist_one_source CHECK (num_nonnulls(attempt_id,import_detail_id)=1);
CREATE OR REPLACE FUNCTION validate_blacklist() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM clients WHERE client_id=NEW.client_id FOR UPDATE;
    IF TG_OP='INSERT' THEN
        IF NEW.attempt_id IS NOT NULL THEN
            IF NOT EXISTS(SELECT 1 FROM call_attempts WHERE attempt_id=NEW.attempt_id
                AND client_id=NEW.client_id AND campaign_id=NEW.campaign_id AND state='closed'
                AND disposition_code_snapshot='BLACKLIST') THEN
                RAISE EXCEPTION 'El bloqueo requiere una llamada clasificada como Blacklist';
            END IF;
        ELSE
            IF NOT EXISTS(SELECT 1 FROM import_detail d JOIN import_log l USING(import_id)
                WHERE d.detail_id=NEW.import_detail_id AND d.client_id=NEW.client_id
                  AND l.campaign_id=NEW.campaign_id AND d.result IN ('imported','duplicate')
                  AND d.source_data->>'status'='BLACKLIST') THEN
                RAISE EXCEPTION 'El bloqueo requiere una fila importada con STATUS BLACKLIST';
            END IF;
        END IF;
    END IF;
    IF TG_OP='UPDATE' AND (NEW.client_id,NEW.campaign_id,NEW.attempt_id,NEW.import_detail_id,NEW.reason,NEW.started_at)
       IS DISTINCT FROM (OLD.client_id,OLD.campaign_id,OLD.attempt_id,OLD.import_detail_id,OLD.reason,OLD.started_at) THEN
        RAISE EXCEPTION 'Conserve el origen del bloqueo; finalícelo y registre otro si corresponde';
    END IF;
    RETURN NEW;
END $$;
COMMIT;
