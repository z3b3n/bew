# BEW — Cuadrante de Turnos Offline

**BEW** es una aplicación móvil diseñada con estética táctica en modo oscuro para gestionar los turnos del equipo, optimizar el día a día de **ZETO** y funcionar **100% sin conexión** mediante almacenamiento local en **IndexedDB**.

Disponible en tres formatos:
- **PWA** optimizada para iPhone 16 Pro (Safari + Dynamic Island `viewport-fit=cover` + icono personalizado).
- **iOS (`.ipa`)** empaquetada con Capacitor (sin firmar, lista para instalar con AltStore / SideStore / Sideloadly).
- **Android (`.apk`)** firmada, lista para instalar directamente.

---

## Características Principales

### 1. Tipos de Turno y Cómputo Automático de Horas
| Código | Turno | Horario | Duración | Diurnas / Nocturnas (22:00–06:00) |
| :--- | :--- | :--- | :---: | :---: |
| **M** | Mañana | `08:00 – 15:00` | 7h | 7h / 0h |
| **T** | Tarde | `15:00 – 21:00` | 6h | 6h / 0h |
| **N** | Noche | `21:00 – 08:00` (+1 día) | 11h | 3h / 8h *(configurable a 11h nocturnas)* |
| **AN** | Arco Nocturno | `20:00 – 08:00` (+1 día) | 12h | 4h / 8h *(configurable a 12h nocturnas)* |
| **AD** | Arco Diurno | `08:00 – 20:00` | 12h | 12h / 0h |
| **L / F** | Libre / Festivo | — | 0h | 0h / 0h |

### 2. Selector Rápido `Solo ZETO` / `Todos`
- **Solo ZETO:** Calendario mensual limpio con tus turnos, indicador de festivos y resumen de horas del mes. Al tocar un día puedes editar tu turno, marcar el día como **Festivo**, ver qué compañeros coinciden contigo o lanzar un cambio de turno.
- **Todos:** Cuadrante completo del equipo en **Matriz** (columna de días y columna **ZETO** fijadas, resto desplazable) o en **Tarjetas** agrupadas por franja horaria.

### 3. Cuadrante Original y Escaneo Automático (IA + Diff)
- **Archivo visual offline:** Sube y guarda en IndexedDB la foto o imagen del cuadrante original de cada mes con visor a pantalla completa y zoom.
- **Escaneo con Cámara o Galería:** Extrae automáticamente la tabla completa de todos los usuarios mediante un modelo de Visión/LLM.
- **Detección inteligente de cambios (Diff):** Compara la nueva foto con los turnos guardados del mes y muestra únicamente las modificaciones (ej. *"Día 14: Carlos pasa de M a T"*) para revisarlas antes de aplicarlas.

### 4. Cambios de Turno y Balance de Servicios
- Registra intercambios **1x1** (día que ZETO cede ↔ día que ZETO cubre) o **Servicios debidos / A favor**.
- Actualización automática opcional del calendario para ZETO y el compañero.
- Balance neto por compañero y botón para **Saldar** servicios pendientes.

### 5. Exportación a Calendario iOS (`.ics`)
- Exporta los turnos laborales de **ZETO** del mes en formato estándar **RFC 5545 (`.ics`)**, compatible con la app **Calendario** de iPhone.
- Calcula automáticamente el cambio de día en turnos nocturnos (`N` y `AN` terminan a las `08:00` del día siguiente) y omite días libres.

### 6. Estadísticas y Copia de Seguridad
- Estadísticas filtrables por **Mes**, **Trimestre** y **Año** para **ZETO** o cualquier compañero: horas diurnas vs. nocturnas, conteo exacto por turno, festivos trabajados vs. días libres y gráficos SVG.
- Exportación e importación completa en **JSON** (incluyendo las imágenes de los cuadrantes originales si lo deseas).

---

## Instalación en iPhone 16 Pro

### Opción A: Como PWA desde Safari (Recomendado para actualizaciones instantáneas)
1. Abre la URL de BEW en **Safari** en tu iPhone.
2. Pulsa el botón **Compartir** (cuadrado con flecha hacia arriba).
3. Selecciona **Añadir a pantalla de inicio**.
4. Se instalará con el icono del búho táctico en modo pantalla completa, respetando la Dynamic Island y funcionando 100% sin conexión.

### Opción B: Con el archivo `BEW-iOS.ipa` (Releases)
Descarga `BEW-iOS.ipa` desde la sección **Releases** de este repositorio e instálalo en tu iPhone usando:
- **AltStore / SideStore** (con tu Apple ID gratuito o de desarrollador).
- **Sideloadly** desde Mac/PC.

---

## Instalación en Android
Descarga **`BEW-Android.apk`** desde la sección **Releases** e instálalo directamente en tu dispositivo Android (habilitando "Instalar aplicaciones desconocidas" si es la primera vez).

---

## Cómo configurar la API Key de Visión (Escaneo IA)

La clave se guarda **únicamente en el almacenamiento local (IndexedDB)** de tu dispositivo.

### Con Google Gemini (Recomendado, con capa gratuita)
1. Entra en [Google AI Studio](https://aistudio.google.com/) e inicia sesión con tu cuenta de Google.
2. Pulsa en **Get API key** → **Create API key**.
3. Copia la clave generada (empieza por `AIza...`).
4. En BEW ve a la pestaña **Ajustes** → **API Key de Visión (Escaneo IA)**.
5. Selecciona el proveedor **Gemini**, pega tu API Key y deja el modelo `gemini-2.5-flash`.

### Con OpenAI / Endpoint compatible
1. En **Ajustes**, selecciona **OpenAI** (o **Custom** para un endpoint compatible como OpenRouter/local).
2. Introduce tu API Key (`sk-...`) y el modelo de visión (por ejemplo `gpt-4o-mini`).

---

## Desarrollo Local

```bash
npm install
npm run dev
```

Para generar el bundle de producción PWA y sincronizar Capacitor:

```bash
npm run build
npx cap sync
```
