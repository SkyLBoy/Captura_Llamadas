BEGIN;

CREATE TABLE public.work_rounds (
    round_id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL
        REFERENCES public.campaigns(campaign_id),
    agent_id INTEGER NOT NULL
        REFERENCES public.users(user_id),
    name VARCHAR(150) NOT NULL
        CHECK (length(btrim(name)) > 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    created_by_user_id INTEGER
        REFERENCES public.users(user_id),

    CONSTRAINT work_rounds_dates_check
        CHECK (ended_at IS NULL OR ended_at >= started_at),

    CONSTRAINT work_rounds_identity_unique
        UNIQUE (round_id, campaign_id, agent_id)
);

-- Una sola ronda vigente por campaña y agente.
CREATE UNIQUE INDEX uq_active_work_round
    ON public.work_rounds(campaign_id, agent_id)
    WHERE ended_at IS NULL;

-- Vincula cada asignación con su ronda.
ALTER TABLE public.contact_assignments
    ADD COLUMN round_id INTEGER;

ALTER TABLE public.contact_assignments
    ADD CONSTRAINT contact_assignments_round_fk
    FOREIGN KEY (round_id, campaign_id, agent_id)
    REFERENCES public.work_rounds(round_id, campaign_id, agent_id);

CREATE INDEX ix_contact_assignments_round
    ON public.contact_assignments(round_id);

GRANT SELECT, INSERT, UPDATE
    ON public.work_rounds TO vincco_app;

GRANT USAGE, SELECT
    ON SEQUENCE public.work_rounds_round_id_seq TO vincco_app;

COMMIT;