import 'dotenv/config';
import { z } from 'zod';

// Validamos el entorno una sola vez al arrancar; si falta algo, truena aqui
// y no a medio manejo de una peticion.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  PGHOST: z.string().min(1),
  PGPORT: z.coerce.number().default(5432),
  PGDATABASE: z.string().min(1),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET debe ser una cadena larga y aleatoria'),
  APP_TIMEZONE: z.string().default('America/Hermosillo'),
});

export const env = EnvSchema.parse(process.env);
