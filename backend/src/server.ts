import { env } from './config/env.js';
import { buildApp } from './app.js';

async function main() {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(`Servidor de telemarketing escuchando en el puerto ${env.PORT}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('No se pudo arrancar el servidor:', err);
  process.exit(1);
});
