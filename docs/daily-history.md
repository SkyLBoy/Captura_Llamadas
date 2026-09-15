# Historial diario y avances

La administración puede descargar el avance de SILIMEX desde Reportes, seleccionando año y septiembre. Se utilizan los registros disponibles; no se necesita cerrar el mes. Se conserva el concentrado y el historial acumulados del año, junto con las encuestas del mes seleccionado.

El historial está en `/historial` y `/gestion/historial`. La fecha de inicio en America/Hermosillo define el día. Los intentos importados sin fecha no se incluyen. Cada agente solo consulta sus intentos; administración puede filtrar por agente y campaña. Las instantáneas del intento conservan cliente, agente y persona contactada.

El resumen incluye todo el resultado filtrado; la lista pagina de 25 en 25. El tiempo suma duraciones cerradas, no representa jornada laboral ni TPA. Actualizar consulta cambios; no hay actualización automática. Fecha, campaña, agente y página se conservan en la URL. Las solicitudes anteriores se cancelan al cambiar filtros.

Verificación: typecheck y build de backend/frontend, ocho pruebas frontend, y `node tests/backend/daily-history.test.mjs` tras `npm run build`. La prueba SQL usa PGlite aislado y cubre permisos, fecha inválida, medianoche de Hermosillo, paginación, campañas, notas, abiertas/cerradas, duración y día vacío. No modifica datos de producción.
