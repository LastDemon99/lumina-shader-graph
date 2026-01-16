
# Lumina Shader Graph - Directivas de Arquitectura y Mantenimiento

> **OBJETIVO:** Este documento define la estructura modular del proyecto. Cualquier modificación futura **DEBE** respetar esta separación de responsabilidades para evitar duplicidad de código y deuda técnica.

## 1. Capa de Renderizado (WebGL)

Hemos adoptado una arquitectura de **Contexto Único** para los nodos del grafo y **Contextos Aislados** para vistas críticas de UI.

### 1.1. Estrategia "Global Canvas" (Shared Context)
*   **Alcance:** El `<GlobalCanvas />` gestiona **exclusivamente** las miniaturas dentro de los nodos del grafo.
*   **Posicionamiento:**
    *   Se sitúa en **Z-Index 15**.
    *   Esto lo coloca **por encima** de los Nodos (Z-10) para asegurar visibilidad.
    *   Esto lo coloca **por debajo** de la UI Sidebar (Z-20) para que los menús flotantes tapen el grafo correctamente.
*   **Virtualización de Viewport (`u_viewPort`):**
    *   El sistema utiliza `gl.scissor` para dibujar en pequeñas áreas del canvas grande.
    *   **CRÍTICO:** Para que los shaders funcionen como si cada nodo fuera una pantalla independiente, `previewSystem.ts` calcula e inyecta un uniform `vec4 u_viewPort` (x, y, width, height) para cada render call.
    *   Los shaders usan esto para normalizar `gl_FragCoord`. Sin esto, nodos como `Screen Position` fallarían.
*   **Interacción:** Tiene `pointer-events-none`. Los eventos de ratón atraviesan el canvas y llegan a los nodos debajo.
*   **Orquestación:** El singleton `services/previewSystem.ts` gestiona este canvas.

### 1.2. Rol de `SceneView` (Isolated Contexts)
*   **Uso:** El componente `SceneView.tsx` crea su propio contexto WebGL.
*   **Casos de Implementación:**
    1.  **Pestaña "3D Scene":** Requiere pantalla completa y control de cámara orbital.
    2.  **Sidebar Master Preview:** Debido a que la Sidebar (Z-20) tiene un fondo opaco que tapa al GlobalCanvas (Z-15), el preview maestro debe ser un `SceneView` renderizado dentro del DOM de la Sidebar para ser visible.
*   **Viewport:** En estos casos, `u_viewPort` se pasa como `(0, 0, canvasWidth, canvasHeight)` ya que ocupan todo su propio canvas.

### 1.3. Estructura de Servicios
1.  **`services/previewSystem.ts` (Orquestador):**
    *   Gestiona el bucle de renderizado global.
    *   Calcula la intersección entre los elementos DOM (Nodos) y el canvas global.
    *   Gestiona la caché de Shaders y Texturas.
    *   **Responsabilidad Crítica:** Calcular el rectángulo de recorte (Scissor Rect) relativo al Canvas y pasarlo al shader.

2.  **`services/webglUtils.ts` (Ciclo de Vida):**
    *   Aquí reside TODA la lógica "sucia" de la API WebGL 1.0.
    *   **Responsabilidades:** `createContext` (Extensiones, Flags), `createProgram` (Link), `loadTexture` (POT Resizing), `applyTextureParams` (Wrap/Filter).

3.  **`services/renderUtils.ts` (Matemática y Geometría):**
    *   Fuente única de verdad para mallas y matrices.
    *   **Responsabilidades:** Generar vértices (`createSphere`, `createCube`), Operaciones de Matrices (`mat4`).
    *   **Motivo:** Garantiza que el `Preview` (miniatura) y el `SceneView` (pantalla completa) rendericen exactamente la misma geometría.

### 1.4. Identidad Visual de Renderizado
*   **Consistencia:** La aplicación debe mantener una identidad visual coherente en todos los contextos (Previews de Nodos y SceneView).
*   **Lumina Look & Gamma Pipeline:**
    *   Se define un estándar de iluminación específico (curva especular agresiva, enmascaramiento de sombras).
    *   **Gamma Correction:** La aplicación utiliza un flujo de trabajo lineal (Linear Workflow). Todas las operaciones matemáticas se hacen en espacio lineal, pero la salida final al fragment shader (`gl_FragColor`) **DEBE** ser convertida a espacio Gamma (sRGB) mediante `pow(color, 1.0/2.2)`. Esto es crucial para que los valores bajos no se vean negros.
*   **Referencia:** Cualquier cambio en la lógica de iluminación debe consultar y actualizar `GLSL_STANDARDS.md`.

## 2. Capa de Lógica de Shaders (GLSL)

La generación de código GLSL es el núcleo de la aplicación.

1.  **`services/glslGenerator.ts`:**
    *   Es el único lugar donde se escribe strings de GLSL.
    *   **Estándar:** Ver `GLSL_STANDARDS.md` para reglas estrictas de tipado (Float vs Int).
    *   **Robustez Matemática:** El generador actúa como un firewall contra errores matemáticos. Debe implementar protocolos de "Safe Math" (Power seguro, división segura) automáticamente.
    *   **Sistema de Helpers:** Utiliza inyección de funciones solo cuando son necesarias.
    *   **Uniforms Dinámicos:** Inyecta automáticamente dependencias como `u_texDim_{ID}`.

### 2.1. Resolución Dinámica de Dimensiones (Polimorfismo)
Los nodos matemáticos (`Add`, `Mul`, `Pow`, `Mix`, etc.) son polimórficos. Su tipo de dato de salida depende de los tipos de entrada.

*   **Estrategia:** El generador NO debe asumir `vec3` por defecto.
*   **Implementación:** Debe existir una función auxiliar (ej. `getDynamicType(nodeId, inputs)`) que:
    1.  Recorra las conexiones hacia atrás.
    2.  Determine el "Rango Máximo" de los inputs (`vec4` > `vec3` > `vec2` > `float`).
    3.  Ajuste la generación de código para castear automáticamente los operandos de menor rango al rango máximo.

### 2.2. Estrategia de Tree Shaking (Optimización de Grafo)
El entorno WebGL es extremadamente sensible al código no utilizado o incorrectamente ubicado, especialmente en el Vertex Shader.

*   **Problema:** Incluir todos los nodos del grafo en ambos shaders (Vertex y Fragment) causa errores fatales.
*   **Directiva:** El generador **DEBE** implementar **Tree Shaking** (Sacudida de Árbol).
    *   **Generación Vertex Shader:** Solo debe recorrer y generar código para los nodos que están conectados directa o indirectamente al **Vertex Master**.
    *   **Generación Fragment Shader:** Sigue la cadena de dependencias desde el **Fragment Master**.

## 3. Capa de Interfaz (UI)

La UI debe ser consistente y performante.

1.  **`components/Node.tsx`:**
    *   Utilizan el componente `<Preview />`.
    *   Este componente NO renderiza un canvas, solo registra un `div` (referencia DOM) en el `previewSystem`.
    *   El contenedor del preview actúa como un placeholder espacial. El `GlobalCanvas` dibuja encima.

2.  **`App.tsx` (Estado Global):**
    *   Mantiene el "Single Source of Truth" del grafo (`nodes`, `connections`).
    *   Calcula y distribuye el mapa de texturas (`textureUniforms`) incluyendo configuración de Samplers.

## 4. Servicios de IA y Validación (Lumina Brain)

La funcionalidad de "AI Assist" no es una simple llamada a API, es un pipeline estructurado.

1.  **Orquestador (`services/geminiService.ts`):**
    *   Implementa el patrón **Chain-of-Thought** implícito.
    *   **Fase 1 (Drafting):** Interpreta el prompt del usuario y genera un JSON crudo del grafo.
    *   **Fase 2 (Refining):** Recibe el reporte del Linter y corrige errores de conexión o nodos aislados.

2.  **Validador (`services/linter.ts`):**
    *   Analiza la integridad estructural del grafo.
    *   Detecta ciclos, nodos huerfanos y falta de Masters.

## 5. Flujo de Trabajo para Nuevas Funcionalidades

Si vas a añadir una nueva característica, sigue este árbol de decisión:

### ¿Quieres añadir una nueva forma geométrica (ej. Toroide)?
1.  **NO** lo añadas en `SceneView.tsx`.
2.  **SÍ** define la función matemática en `services/renderUtils.ts`.
3.  Impórtalo en los componentes visuales.

### ¿Quieres añadir un nodo procedural complejo (ej. Fractal)?
1.  **SÍ** define la función matemática GLSL en `HELPER_FUNCTIONS` dentro de `glslGenerator.ts`.
2.  Implementa el `case` en `processNode` y añade la clave a `helpersNeeded`.

### ¿El Shader falla al compilar (Pantalla Rosa)?
1.  **NO** intentes hackear el string en el componente.
2.  Revisa `GLSL_STANDARDS.md`.
3.  Depura `generateCode` en `services/glslGenerator.ts`.

## 6. Gestión de Caché de Programas WebGL

La compilación y linkeo de programas WebGL es una operación costosa. El sistema utiliza una caché basada en el código fuente del shader.

### 6.1. Hashing Estricto
*   **Directiva:** La clave de caché en `previewSystem.ts` (`getProgramKey`) debe generarse hasheando **TODO** el string del Vertex y Fragment Shader.
*   **Implementación:** Utilizar un hash numérico (DJB2).

## 7. Pipeline de Texturas y Arrays (Atlas)

El manejo de texturas en WebGL 1.0 requiere una sincronización cuidadosa entre el estado de la GPU y los Uniforms.

### 7.1. Estructura de Datos (`TextureConfig`)
Las texturas NO se pasan como simples strings (URL). Se utiliza un objeto de configuración:
```typescript
interface TextureConfig {
  url: string;   // Origen de la imagen
  wrap: string;  // 'Repeat' | 'Clamp' | 'Mirror'
  filter: string;// 'Linear' | 'Point' | 'Trilinear'
}
```

### 7.2. Texture 2D Arrays (Compatibilidad)
Como WebGL 1.0 no soporta `Texture2DArray`, se usa una estrategia de **Texture Atlas Vertical**.
