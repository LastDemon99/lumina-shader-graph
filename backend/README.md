# Gemini Graph Agent - SDK & Reference Documentation

## 0. Goal Global (Hackatón Gemini 3)

Construir un **asistente agentic (backend Python + Google ADK)** basado en **Gemini 3** que soporte **multi‑intent** y devuelva un contrato estable de **operaciones determinísticas en JSON** para interactuar con **Lumina Shader Graph**.

La app web **Lumina Shader Graph** se usa como **entorno de ejecución/visualización** (editor de nodos + preview), pero **toda la lógica del asistente (razonamiento, ruteo de intents, herramientas, assets) vive en este backend**.

- **Modelo Principal (Razonamiento/Tools)**: `gemini-3-flash-preview`
- **Modelo de Imagen (Generación)**: `gemini-3-pro-image-preview`

Notas operativas (estado actual):
- El backend aplica **timeout** a la ejecución del agente para evitar requests colgadas.
- El snapshot del grafo se inyecta al modelo en un formato **normalizado tipo CSV (tablas)** para ahorrar tokens.
- Cualquier imagen embebida como `data:` URL / base64 en el grafo se **mapea a `assetId`** y se guarda en `AssetStore` (la base64 no se envía al modelo).
- Si el usuario adjunta imágenes al chat, el backend las envía al modelo como **contenido multimodal** pero las **reescala (solo para el request del modelo) a máx 768px** en el lado más largo, conservando aspect ratio; el asset persistido mantiene su resolución original.
- Si el usuario adjunta múltiples imágenes, el backend persiste hasta 3 como assets y emite múltiples `upload_asset`.
- Autoinject de textura: si el agente crea un nodo `texture2D`/`sampleTexture2D`, el backend puede asignar automáticamente `textureAsset`.
  - Por defecto usa el primer adjunto.
  - Si el usuario menciona "segunda/third" imagen, elige el adjunto correspondiente.
- ADK sessions: con `google-adk >= 1.24.x`, `InMemoryRunner` por defecto **NO** auto-crea sesiones (`auto_create_session=False`). Este backend fuerza `auto_create_session=True` por request para evitar el error **"Session not found"** (que puede terminar en respuestas vacías / `0 ops`).
- Masters: para evitar duplicados, si el modelo intenta crear `output`/`vertex` por tool-calls, el backend devuelve el ID existente en el grafo en lugar de insertar un segundo master.

---

## 1. Arquitectura y Workspaces (Decisión de Diseño)

### Separación de Responsabilidades
1.  **Backend (Este Workspace)**: 
    - Stack: FastAPI + Google ADK (`GraphAgentAdk`).
    - Responsabilidad: Decidir intención, cargar Prompt Packs, ejecutar herramientas y devolver operaciones de grafo.
2.  **Frontend (Lumina Shader Graph)**:
    - Stack: Vite + React + TypeScript.
    - Responsabilidad: Serializar el estado actual, llamar al backend y aplicar las operaciones recibidas. **El frontend NO contiene lógica de IA ni ruteo de modelos.**

### Flujo de Datos Inteligente (Intent-Based Design)
1.  **Frontend**: Envía el prompt, historial y snapshot del grafo (JSON).
2.  **Intent Router (Capa de Inteligencia)**: 
    - Un sub-agente analiza el texto y clasifica la intención: `ARCHITECT` (crear), `EDITOR` (modificar), `REFINER` (reparar) o `CONSULTANT` (teoría).
3.  **ADK Execution**: 
    - Carga el **Prompt Pack** dinámico correspondiente desde `agent-instructions/`.
    - Inyecta definiciones de nodos extraídas dinámicamente del código del frontend.
4.  **Graph Context (Token-Optimized)**:
  - El backend transforma el grafo (JSON) a un conjunto de **tablas tipo CSV** (ver sección 7) antes de inyectarlo al modelo.
  - El objetivo es reducir tokens eliminando repetición de claves/espacios y separando “estructura” (nodos/conexiones) de “valores” (data/inputValues).
5.  **Tool Trace / Operaciones**:
  - Gemini genera una lista de `GraphOperations` determinísticas (JSON).
  - El backend retorna además un `thought_process` que contiene una **traza de herramientas** (no es chain-of-thought) para depuración.
6.  **Assets**:
  - Adjuntos del chat y `data:` URLs presentes en el grafo se guardan en `AssetStore` y se referencian por `assetId`.

---

## 2. Conceptos Clave: Prompt Packs

Los **Prompt Packs** son módulos de instrucciones que definen el comportamiento del agente según la intención detectada:
- **`shader-architect.md`**: Generación de estructuras completas. Conocimiento en topología de capas (Foundation -> Volume -> Surface -> FX).
- **`shader-editor.md`**: "Cirugía" de grafos. Reglas para manipular nodos sin romper el flujo actual del usuario.
- **`shader-refiner.md`**: Diagnóstico y reparación. Enfocado en encontrar ciclos y errores de tipos en los sockets.
- **`shader-consultant.md`**: Modo didáctico. Voz de experto para explicar conceptos sin mutar el grafo.

---

## 3. Estructura del Workspace (Directorio `src/`)

- **`main.py`**: Punto de entrada FastAPI. Endpoints de chat (`/chat`), servidor de assets (`/assets`) y health check.
- **`agent_adk.py`**: Motor central del SDK. Implementa la lógica del Router, ruteo de packs y definiciones de herramientas ADK.
- **`models.py`**: Contrato Pydantic. Define el lenguaje común (JSON) entre backend y frontend.
- **`asset_store.py`**: Sistema de persistencia para texturas generadas por IA o subidas por el usuario.
- **`tools/`**:
    - **`definitions.py`**: Parser dinámico de definiciones de nodos del frontend.
    - **`linter.py`**: Validación de grafos (ciclos, conectividad).
    - **`graph_ops.py`**: Firmas técnicas de las herramientas.

---

## 4. API Reference

### `POST /api/v1/chat`
**Request Body (`ChatRequest`):**
```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "graph": { "nodes": [], "connections": [] }
}
```

**Response Body (`AgentResponse`):**
```json
{
  "message": "Texto para el usuario",
  "operations": [
    { "op": "add_node", "nodeId": "node_1", "nodeType": "color" }
  ],
  "thought_process": "TRACE: ..."
}
```

Notas:
- `thought_process` está pensado para **debug**: lista/describe llamadas a herramientas y resúmenes. Evita interpretarlo como “pensamientos internos”.
- El backend puede responder con **504** si el agente excede el timeout configurado.
- Si el mensaje incluye adjuntos con `inline_data` (imágenes), el backend los envía al modelo como partes multimodales (ver sección 8).

### `GET /api/v1/assets/{asset_id}`
Sirve el contenido binario de imágenes/texturas guardadas en el `AssetStore`.

### `GET /health`
Health check simple del proceso.

---

## 5. SDK Contract (Operations)

El backend responde con una lista de `operations` determinísticas:

| Operación | Parámetros Clave | Descripción |
| :--- | :--- | :--- |
| `add_node` | `nodeType`, `x`, `y` | Inserta un nodo del catálogo dinámico. |
| `remove_node` | `nodeId` | Elimina un nodo por ID. |
| `add_connection` | `sourceNodeId`, etc. | Crea un cable entre sockets compatibles. |
| `update_node_data`| `nodeId`, `dataKey`, `dataValue` | Cambia valores (ej. color en hex, valor float). |
| `upload_asset` | `assetId`, `assetName` | Notifica que una imagen está lista para ser usada (ya está persistida y servible vía `/api/v1/assets/{asset_id}`). |
| `request_previews` | `previewRequests[]` | Pide al frontend que capture previews específicos (modo 2d/3d + objeto sphere/box/quad) y reintente la llamada con multimodal. |

### Flujo de Assets (`upload_asset`)

El backend emite `upload_asset` cuando un asset queda disponible para el grafo (ej. adjunto del usuario o imagen embebida en el grafo como `data:` URL que se normaliza a `assetId`).

Garantías:
- Una vez recibida la operación, el frontend puede descargar el binario desde `GET /api/v1/assets/{assetId}`.
- `assetId` es un identificador estable por request. En el caso de `data:` URLs normalizadas desde el grafo, se intenta usar un id derivado del contenido (ej. `asset_<sha256>`) para deduplicación.

Uso típico en el frontend:
- Registrar/mostrar el asset como “disponible”.
- Si un nodo requiere una textura, el valor aplicado en el grafo suele ser una URL resoluble, por ejemplo:
  - `textureAsset = <BASE_URL>/api/v1/assets/<assetId>`
  - o bien guardar `assetId` y resolver a URL al momento de render/preview (según convención del editor).

Ejemplo:
```json
{ "op": "upload_asset", "assetId": "asset_3f2a...", "assetName": "user_upload.png" }
```

Herramientas útiles (adjuntos):
- `list_attachments()`: lista los adjuntos persistidos en el request actual con `index` (1-based) y `assetId`.
- `select_attachment(index)`: fija qué adjunto se debe usar como fuente por defecto (por ejemplo para autoinject en `textureAsset`).

---

## 6. Configuración (.env)

| Variable | Descripción | Valor Ejemplo |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Clave de Google AI para Gemini 3. | `AIza...` |
| `LUMINA_ASSET_STORE_DIR`| Persistencia de assets. | `./storage/assets` |
| `LUMINA_ADK_MODEL` | ID del modelo para ruteo/razonamiento. | `gemini-3-flash-preview` |
| `LUMINA_ADK_TEMPERATURE`| Creatividad del modelo (0.1 ideal). | `0.1` |
| `LUMINA_ADK_MAX_TOKENS` | Límite de tokens de salida. | `2048` |
| `LUMINA_AGENT_TIMEOUT_SEC` | Timeout duro del request del agente (evita cuelgues). | `180` |

Dependencias:
- `pillow`: requerido para el **resize preventivo** de imágenes antes de enviarlas al modelo (solo en el request al modelo; no afecta el asset persistido).

---

## 6.1 Troubleshooting (fallos comunes)

### Síntoma: el backend “deja de ser agéntico” (0 ops / sin tool-calls)

Posibles señales:
- La respuesta vuelve con `operations=[]` o solo con `upload_asset`.
- En logs aparece un error similar a: **`Session not found: session`**.

Causa típica:
- En `google-adk >= 1.24.x`, `InMemoryRunner` requiere sesión existente si `auto_create_session=False`.

Mitigación aplicada en este repo:
- El backend habilita `runner.auto_create_session = True` antes de llamar `runner.run(...)`.

Notas:
- Si actualizas dependencias, considera **pinnear versiones** (ej. `google-adk==...`, `google-genai==...`) para evitar regressions de runtime.

### Síntoma: la Library no muestra assets al abrir/reiniciar el frontend

Posibles señales:
- El backend tiene assets (`GET /api/v1/assets` devuelve elementos), pero la UI muestra la librería vacía.
- Esto suele pasar si reinicias el frontend (Ctrl+C → `npm run dev`) mientras el backend aún no está listo o hay un fallo puntual de red al arrancar.

Causa típica:
- La hidratación de assets se dispara al montar la app; si el primer request falla y no hay reintento, la UI puede quedar vacía hasta recargar.

Mitigación aplicada en el frontend:
- La hidratación de la librería implementa **retry con backoff** cuando `GET /api/v1/assets` falla en el primer intento.

Checklist rápido:
- Backend: `GET http://localhost:8000/health` debe responder `{"status":"ok"...}`.
- Backend: `GET http://localhost:8000/api/v1/assets` debe devolver `{ "assets": [...] }`.
- Frontend: verifica `VITE_LUMINA_AGENT_URL` (ideal sin comillas) y reinicia Vite si cambias `.env`.

Frontend (referencia):
- `VITE_LUMINA_AGENT_URL` (base URL del backend; default `http://localhost:8000`)
- `VITE_LUMINA_AGENT_TIMEOUT_MS` (timeout del fetch del frontend)

---

## 7. Formato de Contexto del Grafo (Normalizado tipo CSV)

Para reducir tokens, el backend inyecta el estado del grafo en un set de tablas tipo CSV. Conceptualmente:

- `nodes.csv`: una fila por nodo (`nodeId`, `nodeType`, `x`, `y`, …)
- `node_inputs.csv`: sockets de entrada por nodo (nombre, tipo)
- `node_outputs.csv`: sockets de salida por nodo (nombre, tipo)
- `node_data.csv`: valores de `data` / `data.inputValues` en forma de pares clave/valor
- `connections.csv`: cables (`sourceNodeId`, `sourceSocket`, `targetNodeId`, `targetSocket`)
- `assets.csv`: assets disponibles y metadatos (`assetId`, `mime`, `bytes`, `name`)
- `masters_connections.csv`: resumen de cables hacia masters (`output`/`vertex`) sin incluir esos nodos en `nodes.csv`.

Regla clave (imágenes):
- Si un nodo trae una textura como `data:` URL/base64 (ej. `textureAsset`), el backend **decodifica**, guarda el binario en `AssetStore` y reemplaza el valor por `assetId` (ej. `asset_<sha256>`). Así, la base64 no infla el prompt.

Nota (masters por defecto):
- Los nodos master por defecto de la app (`vertex` y `output`) se **omiten** del contexto CSV para ahorrar tokens.
- Para no perder información de “qué está conectado al master”, se incluye `masters_connections.csv`.

---

## 8. Política de Imágenes como `Content` (Resize a 768px)

Objetivo: evitar que imágenes demasiado grandes (por generación o por carga del usuario) inflen el costo y latencia del modelo.

Regla:
- Cuando una imagen se envía a Gemini como parte multimodal (`inline_data`), el backend **reescala solo para el request al modelo**.
- Si la imagen supera $768$ px en su lado más largo, se reescala conservando aspect ratio hasta que `max(width,height)=768`.
- El asset guardado en `AssetStore` y el consumido por el shader **permanece en su resolución original**.

Alcance actual:
- Se aplican a **adjuntos del chat** (partes `inline_data`) que se envían al modelo.
- Límite defensivo: se incluyen hasta 3 ítems multimodales por request (imágenes o video) para evitar prompts multimodales gigantes.

### 8.1 Recuperación automática de texturas del grafo (Graph → Multimodal)

Problema: “Attach” (paperclip) en el frontend define **foco de subgrafo**, pero no garantiza que el modelo reciba bytes de textura.

Solución: el backend puede **recuperar bytes de texturas referenciadas en el grafo** y adjuntarlas como `inline_data` cuando el prompt sugiere análisis visual/pixel.

Reglas:
- Se priorizan texturas normalizadas desde `data:` URLs del grafo (mapeadas a `assetId` vía `AssetStore`).
- También se reconoce `textureAsset` como URL a `/api/v1/assets/<assetId>` o como `assetId` directo.
- No se hacen fetches arbitrarios de URLs externas (solo assets propios/persistidos).
- Se intenta limitar a nodos enfocados cuando el frontend incluye `FOCUS_NODE_IDS: ...`.

Heurística (cuándo adjuntar):
- El backend solo adjunta texturas del grafo si el texto del usuario contiene señales de inspección/edición visual (ej. “preview”, “captura”, “qué ves”, “pixel”, “mask”, “edit image/texture”).

### 8.2 Captura de previews de nodos (Frontend → Multimodal)

El frontend puede adjuntar previews de nodos (PNG) o secuencias deterministas (frames) como `inline_data` cuando el usuario lo solicita explícitamente (ej. “preview/captura/frames/video/mp4”).

Modo “agente decide qué preview necesita” (sin que el usuario lo pida explícitamente):
- El agente puede devolver una operación `request_previews` (con una lista `previewRequests`).
- El frontend interpreta esa operación, captura los previews pedidos (respetando `previewMode` y `previewObject`), y hace automáticamente un **segundo** `POST /api/v1/chat` adjuntando esos PNG/frames como `inline_data`.
- Esto habilita un flujo de depuración visual: el agente razona sobre el grafo, decide dónde puede estar el fallo y pide exactamente los previews necesarios.

Selección de nodos a capturar:
- Prioridad: nodos que el usuario marcó como “attached” (paperclip).
- Fallback (si no hay attach): el nodo que alimenta `output.color` (si existe conexión).

Anti‑spam de video (no tiene sentido para frames estáticos):
- Antes de capturar una secuencia, el frontend comprueba si el preview **cambia en el tiempo** haciendo back‑propagation (BFS upstream) desde el nodo enfocado y buscando:
  - un nodo upstream de tipo `time`, o
  - un nodo upstream `customFunction` cuyo `data.code` contenga `u_time`.
- Si no encuentra dependencia temporal, adjunta solo un PNG aunque el usuario pida “video”.

Duración/FPS actuales (secuencia determinista):
- Duración simulada: **4.0s**
- FPS: **2**
- Frames típicos: **8**

Resolución del preview:
- No es fija; depende del tamaño del preview en pantalla y del DPR:
  - `width = floor(rect.width * devicePixelRatio)`
  - `height = floor(rect.height * devicePixelRatio)`
- Luego el backend aplica la misma regla de resize (máx 768px lado largo) solo para el request al modelo.

Video MP4 (opcional):
- Si el usuario pide “video/mp4/frames”, el backend intenta codificar un `video/mp4` desde los frames.
- Si no hay dependencias disponibles para codificación, se hace fallback a adjuntar algunos frames como imágenes.

Nota (multi‑intención):
- Si el usuario usa un slash-command (ej. `/editgraph`, `/lint`), el backend **no ejecuta el router de intención** para ahorrar una llamada al modelo y selecciona el pack directamente.

Implementación (referencia):
- El request al modelo se construye como `types.Content(role="user", parts=[text, inline_data...])`.
- El resize usa Pillow (`pillow`) y respeta EXIF orientation cuando existe.
