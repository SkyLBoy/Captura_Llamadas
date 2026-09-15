# Formato del cierre mensual

El generador usa los estilos extraídos de PARTNER_DELL_AGOSTO_2026.xlsx y SILIMEX_AGOSTO_2026.xlsx. No depende de esos archivos en el equipo ni incorpora sus registros de ejemplo.

- CONCENTRADO conserva los doce meses y resalta el mes seleccionado. Incluye datos del año elegido hasta ese mes; los meses posteriores quedan en cero.
- La hoja de la campaña coloca totales y TPA en las filas 1–6, encabezados en la fila 8 y llamadas cerradas desde la fila 9. El histórico comprende enero hasta el cierre seleccionado. Los límites de mes y fechas se interpretan en America/Hermosillo.
- Se conservan las definiciones de vw_concentrado_mensual: marcaciones incluye todos los intentos; LLAMADAS corresponde a los cerrados que cuentan para TPA. Por eso el número de filas del histórico puede diferir de LLAMADAS. No se alteró esta definición al adaptar el formato.
- SILIMEX utiliza ENCUESTA, RESULTADOS ENCUESTA y Hoja1 oculta, como la referencia. Por decisión del usuario se conservan las preguntas de ENCUESTAS 2, no las preguntas de agosto. Respuestas y motivos se muestran en columnas independientes; las versiones se mantienen separadas.
- Las encuestas corresponden al mes seleccionado. El resumen de disposiciones conserva el acumulado de la hoja SILIMEX. Las encuestas rechazadas se identifican y cuentan explícitamente.
- La sucursal se consulta en clients.sucursal; actualmente la base no proporciona una instantánea histórica de ese campo. Razón social, clave y agente se obtienen del histórico de la llamada.
- Las gráficas son objetos nativos editables. ExcelJS genera las celdas; JSZip incorpora gráficos OOXML con el estilo de referencia, referencias a Hoja1 y cachés recalculadas. No son imágenes PNG. Los gráficos de la encuesta antigua no se reutilizan como resultados actuales.

## Archivos

- backend/src/modules/reports/reports.service.ts: consulta transaccional del cierre.
- backend/src/modules/reports/report-workbook.ts: composición, estilos, fórmulas y gráficas.
- reference-layout.json: estilos, dimensiones y etiquetas sin registros de ejemplo.
- chart-template.json: estilo del gráfico nativo de referencia sin cachés de datos originales.

## Verificación

`npm run test:reports` compila y ejecuta las pruebas del formato y las consultas en PGlite aislado. No conecta con la base de producción.

Incluye campañas, 10,000 llamadas, ausencia de datos de agosto, fechas y duraciones, porcentajes, ceros, TPA anterior, límite de mes en Hermosillo, encuestas completadas, hojas ocultas y gráficos nativos. La revisión visual se realizó con archivos de datos ficticios.
