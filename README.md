# Captura de llamadas

Aplicación interna para PARTNER DELL y SILIMEX. MicroSIP realiza las llamadas; esta aplicación registra los resultados, encuestas y reportes.

## Organización

```text
backend/src/       Código TypeScript del servidor
  config/          Variables de entorno
  db/              Conexiones, transacciones y tipos SQL
  middleware/      Autenticación y roles
  modules/         auth, admin, contacts, calls, surveys, reports
  plugins/         Sesiones
  utils/           Utilidades compartidas
  app.ts           Configuración de Fastify
  server.ts        Entrada del servidor
frontend/          Espacio reservado para la interfaz
database/          schema.sql vigente y migrations/
tests/database/    Pruebas aisladas del esquema
tools/pglite/      Motor local utilizado por esas pruebas
docs/              Documentación del proyecto
archive/           Archivos anteriores y respaldos; no usar para instalar
dist/              Salida generada por la compilación
```

## Comandos

Ejecutar desde la raíz `Captura_Llamadas`, donde están package.json y package-lock.json:

```powershell
npm ci
Copy-Item .env.example .env
# Completar .env con la conexión a PostgreSQL y el secreto de sesión.
npm run typecheck
npm run dev
```

No sobrescribir un `.env` existente. Para compilar: `npm run build`; para ejecutar la compilación: `npm start`. La configuración usa `backend/src` como origen y `dist/server.js` como entrada compilada.

El esquema de inicialización es exclusivamente `database/schema.sql`. Las copias anteriores están en `archive`. No se ha ejecutado este esquema contra una base de producción.

`npm run test:db` ejecuta pruebas en PGlite aislado, sin conectarse a PostgreSQL del servidor. Estas pruebas no validan las rutas HTTP ni sustituyen las pruebas del backend.

## Estado

Se corrigieron los flujos del backend y se añadieron pruebas de integración. Consulta [docs/backend.md](docs/backend.md) para configuración, contratos HTTP y límites de validación. El frontend y la puesta en marcha de PostgreSQL en la red local están pendientes.
