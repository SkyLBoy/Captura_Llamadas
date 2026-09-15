# Verificación del frontend Vincco

Fecha: 2026-09-15. Alcance: proyecto principal Captura_Llamadas.

La interfaz utiliza los servicios reales existentes. El servidor de pruebas de tools/frontend-redesign/fixture-server.cjs sirve el mismo build con respuestas controladas, sin escribir en la base de datos. Los puertos 5191 y 5192 son simulaciones de agente y administrador, respectivamente.

## Pruebas ejecutadas

- TypeScript y compilación Vite correctos; ocho pruebas de frontend correctas.
- Contactos: paginación, búsqueda sin resultados y limpieza de búsqueda.
- Llamada: selección de persona cambia los teléfonos disponibles; persona, número y extensión enviados coinciden con la selección.
- Inicio con error 503 y reintento: conserva exactamente la solicitud y su clave de idempotencia.
- Cuestionario de cinco opciones: se muestran todas, se exige la explicación correspondiente, se valida texto obligatorio y se admite omitir la pregunta opcional.
- Recuperación tras recargar: conserva respuestas, explicación, notas y datos de la llamada activa.
- Canalizaciones: catálogo dinámico, exclusión de opciones sin clasificación y validación de nuevos datos.
- Cierre: revisión, confirmación de cambio de razón social/Blacklist, cancelación con Escape, error 503 sin perder datos y reintento exitoso con retorno a contactos.
- Administración: clasificación de canalización pendiente; creación de ronda con cancelación y confirmación; validación de campos vacíos en usuarios; pantalla de finalizaciones vacía.
- Tema oscuro y presentación de escritorio inspeccionados en navegador.
- Acceso real del proyecto comprobado en http://localhost:5173/login, incluyendo cambio al tema claro. Auditoría estática estricta: cero hallazgos. Lint de DESIGN.md: cero errores y seis avisos informativos de tokens/documentación.

## Límites

Las operaciones se probaron con datos controlados; no equivalen a una certificación de la base de datos ni de servicios de producción. Las funciones del servidor existentes no fueron sustituidas. Los botones de edición/activación de usuarios que no tenían implementación se presentan como consulta, sin prometer operaciones inexistentes. La importación y generación de reportes conservan sus servicios actuales; no se ejecutaron importaciones sobre datos reales.

No hay comando de formato configurado en el paquete frontend. DESIGN.md y UX-CONTRACT.md documentan las decisiones visuales y de comportamiento; premium-ui.json define las comprobaciones estáticas.

La comprobación de ancho móvil no fue concluyente: el navegador mantuvo un ancho efectivo de 905 px pese al ajuste solicitado. Se verificó ese ancho sin desbordamiento de página y se restauró el tamaño normal; queda pendiente validar en un dispositivo móvil real.
