# Backend: operación y cambios

Ejecutar los comandos desde la raíz `Captura_Llamadas` con Node 22 y npm.

## Preparación

1. `npm ci`
2. Crear `.env` a partir de `.env.example`, sin sobrescribir una configuración existente. Completar la conexión a PostgreSQL y un SESSION_SECRET aleatorio de al menos 32 caracteres.
3. Inicializar una base vacía con `database/schema.sql` si todavía no existe. No es una migración para una base existente. Estas correcciones del backend no requieren modificar el esquema.
4. Para crear al primer administrador, establecer localmente `BOOTSTRAP_USERNAME`, `BOOTSTRAP_FULL_NAME` y `BOOTSTRAP_PASSWORD` (12 caracteres mínimo), ejecutar `npm run bootstrap:admin` y retirar esas variables. La contraseña no debe enviarse como argumento ni guardarse en el repositorio. El comando se niega a crear otro administrador si ya existe uno.
5. `npm run build` y `npm start`, o `npm run dev` para desarrollo.

En producción las cookies requieren HTTPS. Las sesiones se mantienen en memoria y se cierran al reiniciar el servidor; las llamadas abiertas permanecen en PostgreSQL y pueden recuperarse después de volver a iniciar sesión. El frontend sigue pendiente.

## Contratos para el frontend

- `POST /api/contacts/import`: multipart con archivo, `campaignId` y **`agentId`**. Lee exclusivamente BASE; asigna sus contactos al agente indicado. No reparte automáticamente la base de un agente entre otros. Encabezados obligatorios: CLAVE, RAZON SOCIAL, TEL, CONTACTO, CORREO; también reconoce MARCA, TIPO DE COMPRA, EXT, REF1, REF2, CELULAR, EJECUTIVO y SUCURSAL. Lee resultados guardados de fórmulas; si falta un valor legible, la fila se rechaza. Los errores SQL de una fila no cancelan las demás. No modifica silenciosamente una razón social distinta durante una reimportación.
- `GET /api/campaigns`, `GET /api/catalogs?campaignId=…` y `GET /api/admin/users`: datos para los selectores. El último requiere administrador.
- `GET /api/contacts/:clientId?campaignId=…`: ficha, teléfonos y correos, limitada a la asignación del agente; el administrador puede consultar las asignaciones disponibles.
- `POST /api/calls`: requiere **`idempotencyKey` UUID** generado una vez por el frontend y conservado al reintentar la solicitud. La misma clave con los mismos datos devuelve el intento original; no genera otra llamada.
- `GET /api/calls/open`: recupera el intento abierto del usuario; devuelve `attempt: null` si no existe. Reconstruir el contador con `call_start`, sin abrir otra llamada al recargar la página.
- `POST /api/calls/:attemptId/close`: guarda encuesta y cierre en una transacción. La hora final se toma en PostgreSQL después de guardar la encuesta. Dos cierres no pueden sobrescribir el mismo intento; el segundo recibe 409.
- El cierre acepta `newData: { phone?, email?, businessName? }`. Para teléfono/correo se requiere una persona de contacto y la canalización NUEVOS_DATOS. Un cambio real de razón social fuerza NUEVOS_DATOS_RAZON_SOCIAL y Blacklist. Los números y nombres históricos de las llamadas se conservan.
- `GET /api/admin/catalogo-pendiente`: devuelve identificadores para clasificar canalizaciones. Los cambios de catálogo y liberaciones de Blacklist registran al administrador en auditoría.

## Reportes

`GET /api/reports/monthly-closing?campaignId=…&year=…&month=…` requiere administrador. Genera CONCENTRADO hasta el mes seleccionado y una hoja con el nombre de la campaña, indicadores, TPA y llamadas acumuladas hasta ese cierre. SILIMEX agrega ENCUESTAS, RESULTADOS ENCUESTA y hojas auxiliares ocultas. Las gráficas se insertan como imágenes PNG; no son gráficos editables de Excel. Las consultas comparten una transacción de lectura consistente.

Se sustituyó la dependencia nativa anterior de gráficas, que fallaba al instalarse en este Windows/Node, por `@napi-rs/canvas`. Referencia técnica: https://github.com/Brooooooklyn/canvas

## Validación y límites

`npm run typecheck` comprueba TypeScript. `npm run test:backend` compila y ejecuta pruebas de servicios reales y rutas HTTP mediante Fastify.inject, con SQL en PGlite aislado. Incluye importación parcial, asignaciones, idempotencia, recuperación, encuestas, Excel con gráficas, cambios de datos, auditoría y revocación de sesión. El adaptador de pruebas serializa conexiones; no sustituye pruebas de concurrencia contra un servidor PostgreSQL por red. `npm run test:db` conserva las pruebas independientes del esquema.

No se conectó ni migró una base de producción. Sigue siendo necesario configurar PostgreSQL y validar el despliegue en la red local.

Las correspondencias de canalización que aún no definiste permanecen inactivas, incluida NUEVOS_DATOS hasta que el administrador le asigne disposición. Las pruebas activan una correspondencia solo dentro de su base aislada. La columna LLAMADAS del cierre mantiene el criterio de llamadas atendidas del esquema, distinto del total de intentos; debe confirmarse contra tu cierre real antes de entregar reportes.
