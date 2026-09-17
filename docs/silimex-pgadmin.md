# Carga inicial de SILIMEX en pgAdmin

La sustitución está autorizada. La conexión de la aplicación no tiene permiso para vaciar tablas; el propietario ejecutará la carga desde pgAdmin. No se necesita compartir la contraseña.

## Archivo que se debe ejecutar

`backups/silimex-before-real-load-20260915/CARGA_SILIMEX_PGADMIN.sql`

Usar solamente después de que `validation.json`, en la misma carpeta, indique `"replay": "passed"`. El generador ensaya la transacción completa en una base desechable. Nunca ejecuta escrituras sobre la conexión real.

1. Cerrar las sesiones de agentes y detener el backend durante la carga. Evitar capturas o cambios de configuración mientras se ejecuta.
2. En pgAdmin, conectar con el propietario de las tablas, normalmente `postgres`, y seleccionar la base **vincco_telemarketing**.
3. Abrir **Query Tool**, abrir el archivo SQL y ejecutarlo **completo**, sin seleccionar fragmentos. El archivo incluye la migración necesaria; no ejecutar `database/schema.sql`.
4. Esperar la confirmación **CARGA SILIMEX COMPLETADA**. Si aparece un error, ejecutar `ROLLBACK;` en esa pestaña y conservar el mensaje para revisarlo. No omitir comprobaciones ni ejecutar únicamente el borrado.
5. Reiniciar el backend y volver a iniciar sesión en la aplicación. Confirmar totales y pendientes antes de comenzar las llamadas reales.

El script comprueba la base, los usuarios, la configuración y los conteos de datos de prueba. Si detecta cambios desde su preparación, se detiene para regenerarlo. Conserva usuarios, contraseñas, campañas, canalizaciones, cuestionarios existentes y auditoría. Agrega una identidad histórica inactiva para Alma y un cuestionario histórico inactivo. Las nuevas claves internas quedan por encima de las usadas en pruebas para evitar que borradores antiguos apunten a contactos distintos.

El borrado y la carga se ejecutan dentro de una transacción con validaciones antes de confirmar. Las secuencias pueden avanzar aunque una transacción falle; esos saltos no representan datos perdidos.

## Respaldo

Antes de preparar la carga se guardó `vincco_telemarketing.dump` en la misma carpeta. `manifest.json` contiene su huella SHA-256 y la comprobación de lectura del catálogo. Ese respaldo no se sobrescribe. La restauración completa debe hacerse sobre una base separada si se necesita recuperar los datos de prueba.

## Interpretación del historial

- Se conservan las bases actuales y sus correcciones. El archivo de Monserrat del 12 aporta llamadas y encuestas, sin sobrescribir la BASE del 15.
- Las claves presentes únicamente en el historial quedan inactivas, sin convertirse en una cartera nueva para los agentes.
- Los éxitos, las encuestas completadas y Blacklist excluyen contactos de la cartera disponible. Las llamadas de septiembre pertenecen a la ronda inicial para distinguir contactos ya trabajados.
- La hoja `ENCUESTAS` no se utiliza. Se conserva el cuestionario anterior de `ENCUESTA` por separado.
- Las 413 filas de encuestas anteriores incluyen 34 sin llamada coincidente y una segunda encuesta diferente para una misma llamada. Las 35 se conservan como evidencia independiente, sin generar llamadas.
- De las 13 encuestas de septiembre, una de Carlos omite la razón obligatoria de «Deficiente». Se conserva como registro independiente asociado a su llamada, con las cinco respuestas originales y el motivo vacío. No se relajan las validaciones de captura para los agentes. En total hay 36 registros independientes y 390 encuestas vinculadas por la estructura habitual.
- Hay una repetición exacta en las 7,912 filas antiguas de llamadas: se incorpora una vez al detalle y se documenta en `validation.json`. Los totales oficiales mensuales permanecen intactos.
- Las 177 llamadas de septiembre con hora final inconsistente conservan su procedencia, tienen duración desconocida y quedan fuera del promedio TPA del informe.
- Los totales oficiales de abril a agosto sustituyen el cálculo mensual del detalle histórico en los informes; no se suman ambas fuentes. Septiembre se calcula a partir de las llamadas importadas y las nuevas capturas.
- El detalle anterior conserva `FechaDisposicion` como fecha de referencia y `DuraciónTramite` como duración. La hora final técnica se obtiene de esa referencia y duración; no representa una hora final observada en el archivo.

El informe definitivo se genera desde la aplicación después de comprobar la carga real. La preparación y la prueba aislada no significan que PostgreSQL ya haya sido sustituido.
