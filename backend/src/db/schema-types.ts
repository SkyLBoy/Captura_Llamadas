import type { ColumnType, Generated } from 'kysely';

// Este archivo describe, tabla por tabla, exactamente lo que ya existe en
// schema.sql. No genera DDL ni lo modifica: es solo el "contrato" en
// TypeScript para que Kysely tipe las consultas. Si el DBA cambia el
// schema.sql, este archivo debe actualizarse a mano (o regenerarse con
// kysely-codegen apuntando a la base real).

type TimestampTz = ColumnType<Date, Date | string, Date | string>;

export interface UsersTable {
  user_id: Generated<number>;
  username: string;
  password_hash: string;
  full_name: string;
  role: 'agent' | 'admin';
  is_active: Generated<boolean>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface CampaignsTable {
  campaign_id: Generated<number>;
  name: string; // 'PARTNER DELL' | 'SILIMEX'
  description: Generated<string | null>;
  is_active: Generated<boolean>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface DispositionsTable {
  disposition_id: Generated<number>;
  campaign_id: number;
  code: string;
  description: string;
  counts_for_tpa: boolean;
  is_active: Generated<boolean>;
  updated_at: Generated<TimestampTz>;
}

export interface ChannelsTable {
  channel_id: Generated<number>;
  campaign_id: number;
  code: string;
  description: string;
  disposition_id: Generated<number | null>;
  is_active: Generated<boolean>;
  updated_at: Generated<TimestampTz>;
}

export interface ClientsTable {
  client_id: Generated<number>;
  source_namespace: string;
  clave: string;
  marca: Generated<string | null>;
  tipo_compra: Generated<string | null>;
  razon_social: Generated<string | null>;
  sucursal: Generated<string | null>;
  is_active: Generated<boolean>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface ContactPersonsTable {
  contact_id: Generated<number>;
  client_id: number;
  nombre: Generated<string | null>;
  ejecutivo: Generated<string | null>;
  is_active: Generated<boolean>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface PhoneNumbersTable {
  phone_id: Generated<number>;
  contact_id: number;
  type: 'main' | 'reference1' | 'reference2' | 'mobile' | 'other';
  number: string;
  normalized_number: Generated<string | null>;
  extension: Generated<string>;
  is_active: Generated<boolean>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface EmailAddressesTable {
  email_id: Generated<number>;
  contact_id: number;
  email: string;
  is_active: Generated<boolean>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface ContactAssignmentsTable {
  assignment_id: Generated<number>;
  client_id: number;
  contact_id: Generated<number | null>;
  campaign_id: number;
  agent_id: number;
  started_at: Generated<TimestampTz>;
  ended_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface CallAttemptsTable {
  attempt_id: Generated<number>;
  idempotency_key: string;
  assignment_id: number;
  campaign_id: number;
  client_id: number;
  agent_id: number;
  contact_id: Generated<number | null>;
  dialed_number: string;
  dialed_extension: Generated<string | null>;
  client_key_snapshot: Generated<string>;
  business_name_snapshot: Generated<string | null>;
  contact_name_snapshot: Generated<string | null>;
  agent_name_snapshot: Generated<string>;
  origin: 'live' | 'import';
  state: 'open' | 'closed';
  call_start: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  call_end: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  duration_issue: Generated<string | null>;
  // duration_sec es columna GENERATED en Postgres; nunca se escribe desde la app.
  duration_sec: ColumnType<string, never, never>;
  channel_id: Generated<number | null>;
  disposition_id: Generated<number | null>;
  channel_code_snapshot: Generated<string | null>;
  disposition_code_snapshot: Generated<string | null>;
  counts_for_tpa: Generated<boolean | null>;
  notes: Generated<string | null>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface ContactBlacklistTable {
  blacklist_id: Generated<number>;
  client_id: number;
  campaign_id: number;
  attempt_id: number;
  reason: string;
  started_at: Generated<TimestampTz>;
  ended_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  updated_at: Generated<TimestampTz>;
}

export interface QuestionnaireVersionsTable {
  version_id: Generated<number>;
  campaign_id: number;
  version_name: string;
  effective_from: Generated<string | null>;
  effective_to: Generated<string | null>;
  is_active: Generated<boolean>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface QuestionnaireQuestionsTable {
  question_id: Generated<number>;
  version_id: number;
  code: string;
  question_text: string;
  question_type: 'single_select' | 'text';
  required: Generated<boolean>;
  display_order: number;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface QuestionnaireOptionsTable {
  option_id: Generated<number>;
  question_id: number;
  option_text: string;
  requires_reason: Generated<boolean>;
  display_order: number;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface CallSurveysTable {
  survey_id: Generated<number>;
  attempt_id: number;
  campaign_id: number;
  version_id: number;
  state: 'pending' | 'completed' | 'declined';
  started_at: Generated<TimestampTz>;
  completed_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface SurveyAnswersTable {
  answer_id: Generated<number>;
  survey_id: number;
  version_id: number;
  question_id: number;
  option_id: Generated<number | null>;
  answer_text: Generated<string | null>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface ImportLogTable {
  import_id: Generated<number>;
  file_name: string;
  file_sha256: string;
  import_date: Generated<TimestampTz>;
  user_id: number;
  campaign_id: number;
  rows_processed: Generated<number>;
  result: 'pending' | 'success' | 'error' | 'partial';
  error_message: Generated<string | null>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

export interface ImportDetailTable {
  detail_id: Generated<number>;
  import_id: number;
  sheet_name: string;
  row_number: number;
  source_data: unknown; // JSONB
  client_id: Generated<number | null>;
  attempt_id: Generated<number | null>;
  survey_id: Generated<number | null>;
  result: 'imported' | 'duplicate' | 'rejected';
  error_message: Generated<string | null>;
  created_at: Generated<TimestampTz>;
  updated_at: Generated<TimestampTz>;
}

// --- Vistas de solo lectura usadas por los modulos de consulta/reportes ---

export interface VwContactosDisponiblesTable {
  assignment_id: number;
  campaign_id: number;
  agent_id: number;
  client_id: number;
  contact_id: Generated<number | null>;
  clave: string;
  razon_social: Generated<string | null>;
  sucursal: Generated<string | null>;
}

export interface VwCatalogoPendienteTable {
  campaign: string;
  code: string;
  description: string;
}

export interface VwHistoricoDetalleTable {
  attempt_id: number;
  campaign_id: number;
  campaña: string;
  agent_id: number;
  agente: string;
  client_id: number;
  cliente_clave: string;
  cliente_razon_social: Generated<string | null>;
  contacto_nombre: Generated<string | null>;
  teléfono_marcado: string;
  extensión: Generated<string | null>;
  llamada_inicio: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  llamada_fin: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  state: 'open' | 'closed';
  origin: 'live' | 'import';
  duration_sec: string;
  duration_issue: Generated<string | null>;
  canalización: Generated<string | null>;
  disposición: Generated<string | null>;
  notes: Generated<string | null>;
  encuesta_estado: 'pending' | 'completed' | 'declined' | null;
  encuesta_version: Generated<string | null>;
}

export interface VwConcentradoMensualTable {
  campaign_id: number;
  campaña: string;
  mes: TimestampTz;
  total_marcaciones: string;
  intentos_cerrados: string;
  intentos_abiertos: string;
  llamadas: string;
  porcentaje_contestacion: Generated<string | null>;
  backoffice: string;
  blacklist: string;
  exitoso: string;
  seguimiento: string;
  colgo: string;
  nuevos_datos: string;
  duracion_tpa: string;
  tpa_promedio: string;
}

export interface VwTpaTable {
  campaign_id: number;
  campaña: string;
  mes: TimestampTz;
  total_intentos_para_tpa: string;
  duracion_tpa: string;
  tpa_promedio: string;
  tpa_mes_anterior: string;
  hay_datos_mes_anterior: boolean;
}

export interface VwResultadosEncuestaTable {
  campaign_id: number;
  version_id: number;
  version_name: string;
  mes: TimestampTz;
  question_id: number;
  question_text: string;
  option_id: number;
  option_text: string;
  cantidad: string;
}

export interface VwEstadosEncuestaTable {
  campaign_id: number;
  version_id: number;
  mes: TimestampTz;
  state: 'pending' | 'completed' | 'declined';
  cantidad: string;
}

export interface Database {
  users: UsersTable;
  campaigns: CampaignsTable;
  dispositions: DispositionsTable;
  channels: ChannelsTable;
  clients: ClientsTable;
  contact_persons: ContactPersonsTable;
  phone_numbers: PhoneNumbersTable;
  email_addresses: EmailAddressesTable;
  contact_assignments: ContactAssignmentsTable;
  call_attempts: CallAttemptsTable;
  contact_blacklist: ContactBlacklistTable;
  questionnaire_versions: QuestionnaireVersionsTable;
  questionnaire_questions: QuestionnaireQuestionsTable;
  questionnaire_options: QuestionnaireOptionsTable;
  call_surveys: CallSurveysTable;
  survey_answers: SurveyAnswersTable;
  import_log: ImportLogTable;
  import_detail: ImportDetailTable;
  vw_contactos_disponibles: VwContactosDisponiblesTable;
  vw_catalogo_pendiente: VwCatalogoPendienteTable;
  vw_historico_detalle: VwHistoricoDetalleTable;
  vw_concentrado_mensual: VwConcentradoMensualTable;
  vw_tpa: VwTpaTable;
  vw_resultados_encuesta: VwResultadosEncuestaTable;
  vw_estados_encuesta: VwEstadosEncuestaTable;
}
