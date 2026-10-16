# Héroes del Corazón

Aplicación web para gestionar evaluaciones internas: formularios configurables, carga inicial de personal y evaluaciones, diligenciamiento por colaboradores y consulta de resultados por responsables de área.

Este documento describe la solución para desarrollo y mantenimiento. Los requisitos funcionales e historias de usuario se mantienen en el documento Word del proyecto.

## Componentes

| Directorio | Tecnología | Responsabilidad |
| --- | --- | --- |
| `heroes_front/` | React, Vite, Tailwind CSS | Interfaz de usuario y sesión web. |
| `heroes_api/` | Django 5, Django REST Framework | API, autenticación, reglas del dominio y administración. |
| `heroes_api/users/` | Aplicación Django | Usuarios, roles y carga de personal. |
| `heroes_api/questions/` | Aplicación Django | Evaluaciones, categorías, preguntas, respuestas y reportes. |
| PostgreSQL | PostgreSQL 16 | Persistencia. En Docker Compose usa el volumen `postgres_data`. |

En desarrollo, Vite sirve el frontend en `http://localhost:5173` y reenvía `/api` al backend. La API local se publica en `http://localhost:8000` (o el puerto indicado por `API_PORT`).

## Requisitos previos

- Docker Desktop con Docker Compose v2.
- Node.js y npm compatibles con la versión de Vite del proyecto.
- Git para obtener el código y mantener cambios.

El backend corre dentro de Docker en el flujo recomendado; no es necesario instalar Python en el equipo para iniciarlo. Para despliegue, se requiere un servidor Linux o plataforma de contenedores, PostgreSQL persistente, HTTPS y un servicio SMTP.

## Inicio en desarrollo

1. Copiar `heroes_api/.env.example` a `heroes_api/.env` si se necesitan valores locales personalizados. Compose tiene valores de desarrollo predeterminados; nunca reutilizar esos valores en producción.
2. Iniciar API, base de datos y Mailpit:

   ```powershell
   cd heroes_api
   docker compose up --build
   ```

   Django aplica migraciones al arrancar el contenedor. Mailpit permite revisar mensajes de correo localmente en `http://localhost:8025`.

3. En otra terminal, iniciar el frontend:

   ```powershell
   cd heroes_front
   npm install
   npm run dev
   ```

4. Abrir `http://localhost:5173`. La administración Django está en `http://localhost:8000/admin/`.

Si los puertos están ocupados, establecer `API_PORT` y/o `MAILPIT_UI_PORT` en `heroes_api/.env`. El frontend usa `VITE_API_URL` para el destino del proxy; el valor de ejemplo es `http://localhost:8011`, así que en el flujo estándar debe dejarse sin definir o cambiarse a `http://localhost:8000`.

Para crear una cuenta administrativa local:

```powershell
docker compose exec heroes_api python manage.py createsuperuser
```

## Configuración

Los ejemplos de variables están en `heroes_api/.env.example` y `heroes_front/.env.example`.

Variables importantes del backend:

- `DJANGO_SETTINGS_MODULE`: `config.settings.dev` en desarrollo y `config.settings.prod` en producción.
- `DJANGO_SECRET_KEY`: clave secreta de Django; usar una clave privada fuerte en cada ambiente.
- `DJANGO_ALLOWED_HOSTS`: hosts válidos para Django.
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`: conexión a PostgreSQL.
- `FRONTEND_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`: origen del sitio y política del navegador.
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USE_TLS`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`: salida de correos. Desarrollo usa Mailpit.
- `AUTH_COOKIE_SAMESITE` y `AUTH_COOKIE_SECURE`: configuración de cookies; producción fuerza cookies seguras.

No versionar archivos `.env`, claves, credenciales, copias de bases de datos ni archivos de importación con datos reales. Antes de compartir datos de ejemplo, comprobar que sean sintéticos.

## Estructura del backend

- `heroes_api/config/settings/base.py`: configuración común, PostgreSQL, DRF, JWT, seguridad y zona horaria `America/Bogota`.
- `heroes_api/config/settings/dev.py` y `prod.py`: ajustes por ambiente.
- `heroes_api/config/urls.py`: prefijo `/api/v1/` y administración Django.
- `heroes_api/users/models.py`: usuario personalizado. El nombre de usuario corresponde al número de documento; los roles principales son `boss` y `collaborator`.
- `heroes_api/questions/models.py`: `Evaluation` es un formulario; cada formulario contiene `Category` y `Criterion`. `Question` guarda las calificaciones asociadas a colaborador, persona evaluada y formulario.
- `heroes_api/*/migrations/`: historial versionado del esquema. Cambios a modelos deben ir acompañados de migraciones.
- `heroes_api/common/`: autenticación, permisos y paginación compartidos.

La API está montada bajo `/api/v1/`. Entre las rutas principales están:

| Ruta | Uso |
| --- | --- |
| `/auth/login/`, `/auth/logout/`, `/auth/me/`, `/auth/refresh/` | Sesión y perfil autenticado. |
| `/auth/password-change/`, `/auth/password-reset/` | Cambio y recuperación de contraseña. |
| `/users/import/`, `/users/collaborators/`, `/users/areas/` | Carga y consulta de personal. |
| `/questions/import/` | Carga de formularios de evaluación desde el staff. |
| `/questions/evaluations/`, `/questions/categories/`, `/questions/form/` | Formularios y configuración de preguntas. |
| `/questions/`, `/questions/sent/`, `/questions/submissions/` | Diligenciamiento y seguimiento de respuestas. |
| `/questions/results/`, `/questions/results-summary/`, `/questions/dashboard/`, `/questions/stats/` | Consulta de resultados e indicadores. |

El detalle de métodos, permisos y formatos de respuesta está en las vistas, serializadores y rutas de `heroes_api/users/` y `heroes_api/questions/`. La especificación OpenAPI se configura con `drf-spectacular`.

## Cargas de archivos

### Personal

La pantalla de staff acepta Excel `.xlsx`. El importador está en `heroes_api/users/staff_import.py`. El encabezado debe incluir documento, nombres, área y cargo; apellidos son opcionales. Los documentos duplicados se omiten, no se actualizan. La contraseña inicial se establece con el número de documento, por lo que las cuentas deben cambiarla según las políticas operativas del entorno.

### Formularios de evaluación

La pantalla de staff acepta Excel `.xlsx` o CSV. Una fila representa una pregunta e incluye las columnas `evaluation`, `category` y `question` (también se aceptan encabezados equivalentes en español). Se repiten evaluación y categoría para cada pregunta correspondiente. Las evaluaciones que ya existen se omiten; las nuevas se crean junto con categorías y preguntas.

También se pueden crear formularios desde la consola del backend:

```powershell
docker compose exec heroes_api python manage.py import_questions data/evaluations.xlsx
```

El comando admite `.xlsx` y `.csv`. El archivo debe estar en el contenedor (por ejemplo, bajo `heroes_api/data/`, que está montado como `/app/data`). La lógica compartida está en `heroes_api/questions/staff_import.py` y el comando en `heroes_api/questions/management/commands/import_questions.py`.

## Frontend

El frontend es una SPA React con rutas en `heroes_front/src/App.jsx`. `AuthProvider` consulta `/auth/me/` al iniciar; las rutas internas se muestran dentro de `Layout`, que redirige a `/login` cuando no hay sesión. La ruta inicial lleva al dashboard para `boss` y a la pantalla de evaluación para `collaborator`. `Layout.jsx` define el menú disponible para cada rol.

### Páginas y roles

| Archivo | Ruta | Uso principal |
| --- | --- | --- |
| `heroes_front/src/pages/LoginPage.jsx` | `/login` | Inicio de sesión. |
| `heroes_front/src/pages/DashboardPage.jsx` | `/` | Indicadores y promedios para jefes de área. |
| `heroes_front/src/pages/EvaluationPage.jsx` | `/evaluations` | Selección de evaluación abierta y envío de calificaciones por colaboradores. |
| `heroes_front/src/pages/ReviewPage.jsx` | `/review` | Revisión de evaluaciones enviadas y consulta de su detalle. |
| `heroes_front/src/pages/ResultsPage.jsx` | `/results` | Resultados filtrables por evaluación, área y persona. |
| `heroes_front/src/pages/FormCreatePage.jsx` | `/create` | Creación y edición de formularios, categorías y preguntas. |
| `heroes_front/src/pages/FormProgramPage.jsx` | `/program` | Configuración del límite mensual y tipo de calificación de una evaluación. |
| `heroes_front/src/pages/EvaluationsListPage.jsx` | `/evaluations-list` | Estado, cierre y administración de evaluaciones existentes. |
| `heroes_front/src/pages/StaffImportPage.jsx` | `/staff` | Carga de personal y formularios desde archivos. |

Las rutas del menú se configuran en `components/Layout.jsx`; al agregar una pantalla, actualizar `App.jsx` y revisar también los enlaces por rol en el layout. Los componentes de interfaz reutilizables están en `components/ui/`; estilos compartidos de formularios, alertas y títulos en `components/ui/styles.js`. `components/ScoreTable.jsx` representa los criterios cuantitativos o descriptivos.

### Sesión y comunicación con la API

- `context/AuthContext.jsx` mantiene usuario, carga inicial, login y logout.
- `lib/api.js` es el cliente común: usa `credentials: 'include'`, envía el token CSRF en mutaciones, serializa JSON y renueva una sesión vencida una vez.
- El backend entrega access y refresh como cookies httpOnly. No guardar tokens de sesión en `localStorage` ni hacer `fetch` directo para endpoints autenticados; usar `api()`.
- En desarrollo, `vite.config.js` envía `/api` al backend configurado en `VITE_API_URL` (por defecto `http://localhost:8000`). Así frontend y API comparten origen desde el navegador y se simplifica CSRF.
- `lib/useEvaluationForms.js` centraliza la carga de formularios históricos para vistas que deben mostrar categorías o preguntas ya desactivadas.

### Convenciones para cambios

1. Mantener las llamadas HTTP en `lib/api.js` o en funciones cercanas a la página, usando el cliente `api()`.
2. Mostrar errores de API con `errorMessage()` y marcar mensajes de error con `role="alert"`.
3. Reutilizar `Button`, `Card`, `Badge` y las clases de `components/ui/styles.js` antes de crear variantes visuales nuevas.
4. Si se agrega una ruta, actualizar tanto el router como la navegación y verificar qué rol debe verla. El control visual del menú no sustituye permisos en el backend.
5. Para formularios de carga, usar `FormData` sin fijar manualmente el encabezado `Content-Type`; el navegador debe agregar el boundary multipart.

### Compilación y variables

`heroes_front/.env.example` contiene `VITE_API_URL`, el origen del backend usado por el proxy de Vite. Las variables `VITE_*` se incorporan al bundle y son visibles en el navegador; nunca poner secretos en ellas. En producción, el servidor web debe entregar el directorio `dist/` y reenviar `/api/` al servicio Django.

Los scripts disponibles están en `heroes_front/package.json`:

```powershell
npm run dev
npm run build
npm run lint
```

## Persistencia y operaciones

El volumen Docker `postgres_data` conserva la base de datos al recrear contenedores. Eliminar ese volumen borra los datos; no usar `docker compose down -v` en un ambiente con información que deba conservarse.

Operaciones comunes desde `heroes_api/`:

```powershell
docker compose ps
docker compose logs -f heroes_api
docker compose exec heroes_api python manage.py migrate
docker compose exec heroes_api python manage.py createsuperuser
```

Antes de actualizar un ambiente con datos, obtener y verificar una copia de seguridad PostgreSQL. Las migraciones se ejecutan automáticamente por `docker/entrypoint.sh` salvo que `RUN_MIGRATIONS` se desactive.

## Despliegue

`heroes_api/docker-compose.prod.yml` define PostgreSQL y el backend Django/Gunicorn. Antes de levantarlo, definir las variables obligatorias indicadas en ese archivo y en `.env.example`, incluyendo `DJANGO_SECRET_KEY` de al menos 50 caracteres, contraseñas seguras, hosts permitidos, dominio del sitio y configuración SMTP. La configuración de producción fuerza `DEBUG=False`, HTTPS y cookies seguras.

Comando de despliegue desde `heroes_api/`:

```powershell
docker compose -f docker-compose.prod.yml up -d --build
```

El Compose de producción no incluye el frontend: servir el `dist/` generado por `npm run build` mediante el servidor web o proxy HTTPS del despliegue, y enrutar `/api/` al backend. Configurar persistencia y copias de seguridad de PostgreSQL fuera del ciclo de vida del contenedor.

## Mantenimiento

- Cambiar modelos: editar el modelo, crear migración con `python manage.py makemigrations` y revisar el archivo generado antes de aplicarlo.
- Añadir rutas: actualizar `urls.py`, vista y serializador correspondientes, cuidando autenticación y permisos.
- Modificar importaciones: mantener reglas de encabezados, duplicados y validación alineadas entre la pantalla staff y el comando cuando compartan lógica.
- Revisar seguridad de permisos en `heroes_api/common/permissions.py` y en las vistas antes de exponer nuevas acciones.
- Mantener datos de ejemplo sintéticos y fuera de los despliegues productivos.

## Pruebas y calidad

Backend: las dependencias de desarrollo incluyen `pytest` y `pytest-django`; revisar `heroes_api/users/tests.py` y `heroes_api/questions/tests.py`. Ejecutar pruebas dentro del contenedor de desarrollo cuando se requiera.

Frontend: `npm run lint` ejecuta ESLint y `npm run build` compila la aplicación.

## Documentos relacionados

- Requisitos funcionales e historias de usuario: documento Word del proyecto.
- Backend: `heroes_api/README.md` (si se incorpora documentación específica del API).
- Frontend: `heroes_front/README.md`.
