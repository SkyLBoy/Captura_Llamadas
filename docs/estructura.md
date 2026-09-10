# Convenciones

Mantener cada funcionalidad dentro de `backend/src/modules/<modulo>`: rutas para HTTP y servicios para lógica de negocio. Usar `db/withTransaction.ts` para operaciones atómicas y auditoría. Los archivos Excel de agentes, secretos y respaldos operativos no deben incorporarse al repositorio. Ejecutar herramientas y comandos desde la raíz.

`archive/schema_review/prepare_survey.py` es una herramienta histórica con rutas antiguas; no forma parte del proceso de instalación ni debe volver a ejecutarse sobre el esquema vigente.
