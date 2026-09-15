# Importación de bases de agentes

La importación utiliza BASE de los formatos PARTNER DELL y SILIMEX. DATOS solo se consulta para resolver sucursales; no agrega clientes. Las filas con MARCA o TIPO DE COMPRA = SUCURSAL se omiten.

## Activación en una base existente

1. En pgAdmin, abrir Query Tool de `vincco_telemarketing` conectado como propietario (`postgres`).
2. Abrir y ejecutar completo `database/migrations/002_import_blacklist.sql`. La migración es transaccional y no elimina clientes, llamadas ni bloqueos. No ejecutar `schema.sql` sobre una base existente.
3. Reiniciar el backend si no se ejecuta en modo watch. El importador muestra un mensaje específico mientras falta la migración.

La migración permite que un bloqueo provenga de una llamada real **o** de una fila de importación validada. El origen es obligatorio e inmutable; el administrador puede finalizar el bloqueo. Un bloqueo procedente de BASE no inventa una llamada ni cambia el TPA. Su fecha de inicio indica cuándo se importó: BASE no proporciona una fecha histórica fiable del bloqueo.

Para una instalación nueva, `schema.sql` incluye este cambio. Aplicar también la migración de rondas `001_work_rounds.sql` según las instrucciones existentes.

## Comportamiento

- Elegir campaña y agente activo con una ronda en curso. Toda asignación nueva incluye esa ronda.
- STATUS admite vacío, BLACKLIST o NUEVOS DATOS. Un valor desconocido rechaza la fila para revisión.
- BLACKLIST conserva el cliente y lo oculta a los agentes. Importar un STATUS vacío nunca libera un bloqueo existente. Una fila marcada explícitamente BLACKLIST puede volver a bloquear un cliente liberado; la liberación se gestiona en el panel del administrador.
- NUEVO NUMERO, NUEVO CORREO y NUEVO CONTACTO tienen prioridad cuando contienen una corrección nueva. También se leen aunque STATUS esté vacío. Un nuevo teléfono sustituye al principal y deja los de referencia; un nuevo correo sustituye los correos activos. Los anteriores permanecen almacenados como inactivos. Los cambios de nombre conservan la identidad de la persona y las llamadas anteriores mantienen sus instantáneas.
- Los correos separados por `/`, `;`, coma o salto de línea se guardan individualmente. Se valida cada dirección de NUEVO CORREO. NUEVO NUMERO debe contener al menos diez dígitos; la normalización actual es mexicana.
- Para clientes existentes, los campos originales de teléfono y correo no se vuelven a aplicar. Si los campos NUEVO ya fueron procesados en la última importación aceptada, no se repiten: así un archivo anterior no deshace una corrección posterior en la app.
- La razón social diferente se rechaza para conservar el flujo de cambio y bloqueo definido en la aplicación. Los contactos de otro agente no se reasignan. No se inicia una nueva ronda al reimportar.
- CLAVE se normaliza a mayúsculas. Una clave repetida dentro de BASE se rechaza después de la primera fila aceptada. Un archivo idéntico ya importado correctamente se rechaza completo.
- Cada fila se procesa con un punto de restauración; si falla, se revierten todos sus cambios. El resumen muestra hasta 50 motivos, y todos quedan en import_detail.

## Interpretación del resumen

Procesadas = nuevas o actualizadas + ya existentes + rechazadas. “Actualizadas” es un subconjunto de nuevas o actualizadas; “En Blacklist” es un subconjunto de las filas aceptadas. Las sucursales omitidas se cuentan por separado.

## Pruebas

Después de compilar el backend:

```powershell
node tests/backend/import-contacts.test.mjs
```

Usa PostgreSQL embebido PGlite y datos ficticios; no conecta a la base real. Comprueba la ronda, los bloqueos, los correos múltiples, las correcciones, la reimportación, los conflictos de agente y el rollback por fila.

`tests/backend/import-originals.test.mjs` es una prueba local opcional con las rutas de los Excel originales y la copia del esquema anterior guardada en archive. Carga ambos libros completos en una base desechable para verificar también la migración. No importa información en la base utilizada por los agentes.

## Revisión de los originales entregados

- SILIMEX_ABECHUCO_2026.xlsm: 2,818 filas de clientes; 70 Blacklist; 54 filas de sucursales omitidas. Sin rechazos después de admitir varios correos por celda.
- PARTNER DELL - ABECHUCO - ABRIL 2026 (1).xlsx: 2,405 filas de clientes; 2,402 aceptadas; 79 Blacklist; 54 filas de sucursales omitidas. Se rechazan tres filas:
  - Fila 426, CUE0063: clave repetida. Revisar ambas apariciones y conservar una fila coherente.
  - Fila 1053, LE2096D: NUEVO NUMERO contiene un correo; revisar si corresponde moverlo a NUEVO CORREO.
  - Fila 1260, MTY1194: NUEVO NUMERO contiene una instrucción de quitar dos teléfonos y agregar otro. Corregir los campos individuales; el importador no interpreta instrucciones libres ni retira un teléfono de referencia a partir de ese texto.

Los originales no se modificaron y estas pruebas no cargaron la base real.

La carga definitiva queda pendiente hasta recibir los cuatro archivos: PARTNER DELL y SILIMEX de Monserrat Abechuco, y PARTNER DELL y SILIMEX de Carlos Ordaz. Cada archivo se importará con su campaña y agente respectivos; los dos libros actuales de Abechuco solo se utilizaron para pruebas.
