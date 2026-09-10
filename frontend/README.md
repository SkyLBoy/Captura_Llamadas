# Frontend - Captura de llamadas

Aplicación frontend para el sistema de captura de llamadas de telemarketing para PARTNER DELL y SILIMEX.

## Tecnologías utilizadas

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router DOM

## Configuración

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Crear archivo de variables de entorno:
   ```bash
   cp .env.example .env
   ```

3. Ejecutar en modo desarrollo:
   ```bash
   npm run dev
   ```

4. Compilar para producción:
   ```bash
   npm run build
   ```

5. Vista previa de producción:
   ```bash
   npm run preview
   ```

## Características

- Autenticación mediante cookies de sesión (sin almacenamiento de tokens)
- Protección de rutas según roles (agente/administrador)
- Interfaz responsive y accesible
- Manejo de estados de carga, vacío y error
- Navegación lateral contextual según rol
- Servicio API centralizado con manejo de errores
- Variables de entorno configurables

## Espacio de trabajo del agente (ContactList)

El agente puede acceder a su espacio de trabajo mediante la ruta `/contactos` donde podrá:

1. **Seleccionar campaña**: Lista de campañas activas obtenida del endpoint `GET /api/campaigns`
2. **Consultar contactos disponibles**: Al seleccionar una campanha, se obtienen los contactos disponibles para el agente mediante `GET /api/contacts/available?campaignId={id}&agentId={id_usuario}`
3. **Buscar contactos**: Filtrado local por clave y razón social (no afecta paginación ya que el backend no implementa paginación)
4. **Ver ficha de contacto**: Al seleccionar un contacto, se muestra su información completa mediante `GET /api/contacts/{clientId}?campaignId={id}` incluyendo:
   - Personas de contacto (nombre, ejecutivo)
   - Teléfonos (con tipo, número y extensión)
   - Correos electrónicos
5. **Copiar teléfono**: Botón para copiar el número de teléfono al portapapeles para marcar manualmente en MicroSIP
6. **Estados manejados**:
   - Sin campañas seleccionadas
   - Sin contactos disponibles para la campaña
   - Errores de conexión o de backend
   - Cargando datos

## Estructura del proyecto

```
src/
├── components/     # Componentes reutilizables
├── contexts/       # Contextos de React (Auth)
├── hooks/          # Hooks personalizados
├── pages/          # Páginas de la aplicación
├── routes/         # Configuración de rutas
├── services/       # Servicios para consumir APIs
├── styles/         # Estilos globales
└── utils/          # Utilidades varias
```

## Roles y permisos

- **Agente**: Acceso a gestión de contactos y realizar llamadas
- **Administrador**: 
  - Gestión de usuarios
  - Clasificación de canalizaciones
  - Gestión de lista negra
  - Generación de reportes

## Notas importantes

- El frontend se comunica con el backend mediante proxy en `/api` apuntando a `http://localhost:3000`
- No se almacenan tokens ni contraseñas en localStorage, se utilizan las cookies de sesión del backend
- Todas las respuestas del backend son validadas antes de ser utilizadas en la interfaz
- El agente NO realiza llamadas ni implementa integración directa con MicroSIP (solo copia el número para marcar manualmente)
- Se respeta la exclusión de Blacklist aplicada por el backend
- No se implementan asignaciones desde el frontend (las asignaciones las gestiona el backend)