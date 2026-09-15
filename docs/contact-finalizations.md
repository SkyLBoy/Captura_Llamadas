# Contactos finalizados

Un cliente queda excluido indefinidamente de nuevas llamadas dentro de la misma campaña cuando una llamada cerrada tiene disposición EXITOSO o su encuesta está completada. Los dos motivos pueden coexistir. Una encuesta rechazada no basta para excluirlo; si la llamada fue Exitoso, sí queda finalizado por ese motivo.

## Activación

En pgAdmin, conectado a `vincco_telemarketing` como `postgres`, ejecutar completo `database/migrations/003_contact_finalizations.sql`. No ejecutar schema.sql sobre una base existente. La migración conserva clientes, llamadas, encuestas, asignaciones y Blacklist; reconoce los casos existentes y registra su origen. Es repetible sin duplicar exclusiones.

La cuenta del backend es `vincco_app`; el propietario de las tablas es `postgres`. Por eso la migración se entrega para ejecutarla desde la conexión del propietario. Antes de aplicarla, las consultas nuevas muestran un mensaje específico de migración pendiente.

Para una base vacía, schema.sql ya contiene las exclusiones; también se requiere la migración 001 de rondas siguiendo las instrucciones existentes.

## Implementación

- `contact_finalizations` guarda cada llamada de origen, el cliente, la campaña, los motivos y la fecha. Las filas son permanentes y auditadas. No se cambian los resultados históricos del reporte.
- Los triggers de llamadas y encuestas registran la exclusión en la misma transacción. Si una encuesta está incompleta y falla su validación, se revierte también la exclusión.
- `vw_contactos_disponibles` filtra los finalizados. El backend y PostgreSQL rechazan nuevos intentos, incluso con una ficha abierta de antes. Un reintento con la misma clave sigue devolviendo la llamada existente; no crea otra.
- Las nuevas rondas y la distribución de contactos excluyen a los finalizados. La importación puede actualizar datos permitidos, pero no elimina la exclusión ni crea una asignación nueva para ellos.
- Los contactos finalizados se identifican por cliente y campaña, no solo por el texto del número telefónico. La regla afecta a todos los agentes de esa campaña. Otra campaña conserva su propio estado.
- Finalización y Blacklist son independientes. Liberar Blacklist no deshace una finalización. No se añade una acción para reactivar un finalizado, conforme a la decisión de exclusión indefinida.
- La pantalla `/gestion/contactos-finalizados`, accesible desde Gestión, permite buscar, filtrar por campaña y consultar los motivos, la fecha y las llamadas de origen. Solo los administradores tienen acceso.
- En el resumen de rondas, los grupos son excluyentes: Blacklist tiene prioridad; luego finalizados; después inactivos restantes; finalmente elegibles. Por ello suman el total de asignados sin duplicar un cliente que cumpla más de una condición.

La fecha es la de cierre de la llamada de origen; en históricos sin hora de fin se usa la finalización de encuesta o la fecha de registro disponible. La exclusión permanece aunque posteriormente se corrija un resultado histórico. Se permite incorporar llamadas históricas con origen import para conservar la historia real, pero nunca utilizarlas como llamadas nuevas de agentes.

## Bases definitivas pendientes

No se han importado los archivos reales a la base de trabajo. Se esperan las cuatro bases: PARTNER DELL y SILIMEX de Monserrat Abechuco y PARTNER DELL y SILIMEX de Carlos Ordaz.

El importador de BASE conserva las exclusiones ya registradas en PostgreSQL; no deduce encuestas o resultados exitosos del STATUS vacío. Antes de la carga definitiva se debe revisar el historial de los cuatro archivos y preparar la incorporación de los éxitos y encuestas anteriores. No habilitar automáticamente una base histórica sin esa revisión.

## Verificación

Después de compilar el backend, ejecutar `node tests/backend/contact-finalizations.test.mjs`. La prueba usa PGlite desechable y nunca conecta a PostgreSQL real. Comprueba backfill, cierre automático, encuestas rechazadas/incompletas, reintentos, nuevas rondas, importación, distribución, alcance por campaña, permisos administrativos y liberación de Blacklist.
