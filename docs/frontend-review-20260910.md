# Revisión del flujo de captura — 10 de septiembre de 2026

Se revisaron los cambios acumulados en MakeCall, api, AuthContext y la configuración TypeScript, contrastándolos con las rutas del backend. Se conservaron los cambios manuales previos. Copia anterior a esta intervención: `archive/frontend_review_20260910_162833`.

## Correcciones

- La recuperación de llamada abierta termina antes de cargar el cliente. Las respuestas de clientes anteriores se ignoran y los errores de carga se muestran también durante la llamada, con reintento.
- El cierre correcto vuelve a la lista para volver a consultar los contactos disponibles, incluidos los cambios por Blacklist.
- Se bloquean dobles envíos mientras una petición está en curso. Un reintento de inicio conserva tanto la clave como el contenido de la solicitud. Un rechazo de validación permite corregir los datos. Esto no persiste solicitudes al recargar.
- La generación de UUID usa getRandomValues y no depende de randomUUID, que puede faltar en HTTP por red local. No se ha probado desde otra computadora.
- La encuesta valida opciones y explicaciones también en preguntas opcionales. Solo se muestra la explicación de la opción elegida; se puede revisar una encuesta completada antes de cerrar. Los campos quedan deshabilitados durante el cierre.
- Se informa de la regla NUEVOS_DATOS y del efecto de cambiar la razón social, y se comprueba la canalización antes de enviar actualizaciones de teléfono/correo.
- Login utiliza el servicio API y su mensaje de error correcto. La recuperación de sesión normaliza userId a id para mantener el mismo formato que login.
- El intento abierto y la validación de encuestas tienen tipos explícitos.

## Verificación

Desde frontend: `npm run typecheck` y `npm run build`.

Desde la raíz: `npm run test:frontend` (regresiones de validación y servicio API) y `npm run test:backend` (11 grupos sobre PGlite aislado; no modifica PostgreSQL operativo).

Estas pruebas no sustituyen una prueba del flujo completo en navegador con cuentas de agentes ni una prueba de concurrencia por red.

## Pendientes fuera de esta corrección

- Conservar borradores de notas, nuevos datos y encuesta al recargar o abandonar la página, ligados al agente, intento y versión del cuestionario.
- Recuperar solicitudes de inicio/cierre cuyo resultado se desconoce después de una desconexión y recarga.
- Comprobar el acceso desde las computadoras de los agentes y completar la validación visual de un cierre de cada campaña.

No se importaron datos ni se alteró el esquema o los registros de PostgreSQL durante esta revisión.
