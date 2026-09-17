# Migraciones

Guardar aquí cambios incrementales numerados cuando exista una base instalada. `../schema.sql` es el esquema de inicialización para una base vacía; no ejecutarlo como actualización sobre datos existentes.

`004_historical_import.sql` agrega resúmenes mensuales históricos, encuestas sin llamada asociada y procedencia de llamadas. Las encuestas históricas también excluyen contactos finalizados. El script de carga SILIMEX para pgAdmin incluye esta migración dentro de su transacción; no hace falta ejecutarla por separado para esa carga.
