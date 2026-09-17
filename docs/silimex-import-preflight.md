# Preparación de la carga real de SILIMEX

Estado: script completo generado y reproducido satisfactoriamente en una segunda base aislada. Pendiente de ejecución por el usuario en pgAdmin; ninguna sustitución ni importación en PostgreSQL real.

## Decisiones confirmadas

- Borrar datos operativos de prueba y conservar usuarios, campañas, canalizaciones y cuestionarios.
- Importar todo el historial disponible, manteniendo separada la base vigente de contactos.
- Ignorar completamente la hoja ENCUESTAS de los archivos de agentes.
- SE CORTA LLAMADA se clasifica como SEGUIMIENTO, aunque un Excel diga Exitoso.
- X y ANTERIOR son comentarios, no resultados ni encuestas completadas.
- Conservar Alma Zambrano como identidad histórica sin acceso ni asignaciones actuales.
- Conservar las 413 encuestas de ENCUESTA (singular) como cuestionario histórico separado.
- Conservar los totales mensuales del consolidado separados del detalle; no reconstruir ni duplicar marcaciones.
- Usar la BASE de Monserrat del 15 de septiembre como la versión más reciente; el archivo del 12 aporta llamadas y respuestas, sin volver a importar una base anterior sobre la actual.

## Fuentes examinadas

| Fuente | Contenido confirmado |
|---|---|
| SILIMEX_-_ORDAZ_-_2026.xlsm | 2,749 contactos; 531 llamadas de 9, 11 y 14 de septiembre; 6 encuestas respondidas |
| SILIMEX_ABECHUCO_2026_120926.xlsm | 87 llamadas del 12 de septiembre; 5 encuestas respondidas |
| SILIMEX_ABECHUCO_2026_150926.xlsm | 2,818 contactos; 20 llamadas del 15 de septiembre; 2 encuestas respondidas |
| SILIMEX_AGOSTO_2026.xlsx | Consolidado de abril a agosto, 33,653 marcaciones agregadas, 7,912 filas de detalle y 413 encuestas de otro cuestionario |

La simulación de BASE en PGlite aceptó los 5,567 contactos sin rechazos. No hay claves compartidas entre las dos bases. Las sucursales resueltas mediante DATOS coinciden con Hoja3. Se omiten 54 filas de directorio por archivo. La base actual de Monserrat contiene 92 marcas BLACKLIST.

## Respaldo y acceso

Respaldo PostgreSQL en `backups/silimex-before-real-load-20260915/vincco_telemarketing.dump`; manifest.json guarda tamaño, SHA-256, fecha y número de entradas. Se verificó lectura del catálogo con pg_restore; todavía no se ensayó restauración completa. El respaldo y los datos extraídos están excluidos de Git.

La conexión configurada usa vincco_app, sin permiso TRUNCATE. La sustitución requiere una conexión autorizada del propietario de la base (postgres), sin ampliar los permisos permanentes de la aplicación. No se ha intentado el borrado.

## Hallazgos que debe resolver el proceso de carga

- El historial de Alma (2,782 filas), las 413 encuestas antiguas y los agregados separados están confirmados por el usuario.
- 34 de las encuestas antiguas no tienen llamada coincidente ni por fecha exacta ni por cliente/agente/día. Además, las filas 351 y 352 de ENCUESTA tienen respuestas distintas para una misma llamada del 24 de junio. Se conservan las 413 filas: 378 vinculadas como encuestas de llamada y 35 registros independientes (uno identifica su llamada coincidente). No se fabrican llamadas ni se descartan respuestas.
- El detalle histórico incluye una repetición exacta y 1,291 claves ausentes de las bases actuales. Estas claves no deben convertirse automáticamente en contactos disponibles para los agentes.
- 177 de las 638 llamadas de septiembre tienen hora final anterior a la inicial o un valor final no interpretable como hora. Conservar el original y documentar duración no verificable; no inventar segundos ni convertir la diferencia en una llamada de 24 horas.
- La encuesta de Carlos en ENCUESTAS 2, fila 141, responde «Deficiente» sin indicar la razón. Se preserva como evidencia importada asociada a su llamada con el motivo vacío, sin fabricar una respuesta ni debilitar las validaciones de captura. Las 13 encuestas de septiembre se conservan: 12 habituales y una independiente.
- Las anotaciones libres de BASE se conservan como procedencia; no equivalen por sí solas a registros completos de llamadas ni a respuestas de encuesta.

Antes de la carga: conciliación final y simulación del historial; después, sustitución transaccional con respaldo y comprobación de totales, pendientes, bloqueados y finalizados. El avance de septiembre aún no se ha emitido.

## Resultado de la prueba completa

- 8,549 llamadas: 7,911 anteriores y 638 de septiembre.
- 6,865 clientes: 5,567 de las bases vigentes y 1,298 históricos inactivos. Siete claves adicionales proceden exclusivamente de encuestas históricas.
- 426 encuestas conservadas: 390 habituales y 36 registros independientes. Corresponden a las 413 antiguas y 13 de septiembre.
- 33,653 marcaciones oficiales de abril a agosto guardadas por separado.
- 951 clientes finalizados y 457 bloqueados en el historial completo; estas categorías pueden coincidir y abarcan también clientes inactivos.
- 3,798 contactos pendientes en la ronda inicial después de aplicar los filtros de disponibilidad y las llamadas de septiembre.
- Alma inactiva y sin asignaciones abiertas.

`validation.json` confirma `replay: passed`. La prueba reprodujo el SQL completo sobre una segunda base desechable con la configuración real, sustituyendo únicamente la comprobación del nombre de base y los conteos iniciales de prueba por los de esa base vacía. Pasaron también compilación TypeScript, pruebas de reportes y sus plantillas, exclusión de finalizados y pruebas específicas del historial importado.

Instrucciones de ejecución: [silimex-pgadmin.md](silimex-pgadmin.md).

Septiembre conciliado: 531 llamadas de Carlos y 107 de Monserrat, sin identidades de llamada repetidas entre los tres archivos, y 13 encuestas respondidas. El usuario ejecutará el script completo en pgAdmin como propietario. La cuenta postgres pidió autenticación; no se cambiaron permisos ni se intentó eludirla.
