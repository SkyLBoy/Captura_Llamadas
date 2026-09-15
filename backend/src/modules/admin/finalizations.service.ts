import { sql } from 'kysely';
import { db } from '../../db/kysely.js';

interface FinalizedContact {
  client_id: number;
  campaign_id: number;
  clave: string;
  razon_social: string | null;
  campaign: string;
  successful: boolean;
  survey_completed: boolean;
  finalized_at: string;
  attempt_ids: number[];
}

export async function listFinalizedContacts(query: {campaignId?: number; search: string; page: number}) {
  const result = await sql<{total: number; contacts: FinalizedContact[]}>`
    WITH filtered AS (
      SELECT * FROM public.vw_contactos_finalizados
      WHERE (${query.campaignId ?? null}::integer IS NULL OR campaign_id=${query.campaignId ?? null})
        AND (clave ILIKE ${'%' + query.search + '%'} OR razon_social ILIKE ${'%' + query.search + '%'})
    )
    SELECT (SELECT count(*)::integer FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(p ORDER BY p.finalized_at DESC,p.client_id,p.campaign_id)
        FROM (SELECT * FROM filtered ORDER BY finalized_at DESC,client_id,campaign_id
              LIMIT 50 OFFSET ${(query.page - 1) * 50}) p), '[]'::jsonb) AS contacts
  `.execute(db);
  return result.rows[0]!;
}
