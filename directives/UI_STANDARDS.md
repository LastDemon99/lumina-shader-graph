
# Lumina Shader Graph - UI & Architecture Standards

> **IMPORTANTE:** Estas directrices deben respetarse estrictamente en cualquier modificación del código para mantener la estabilidad visual y funcional de los nodos.

## 1. Estructura General del Nodo (`Node.tsx`)

El componente `Node` es el bloque fundamental. Cualquier cambio en su CSS afectará a todo el grafo.

### Contenedor Principal
- **Posicionamiento:** `absolute`. Las coordenadas `x, y` se aplican vía `style`.
- **Dimensiones:**
  - Ancho estándar: `w-40` (160px).
  - Ancho extendido: `w-60` (240px) para nodos complejos (Matrices, Swizzle).
- **Estilo:** `bg-[#1e1e1e]`, bordes redondeados `rounded-lg`, sombra `shadow-xl`.
- **Selección:** El borde cambia de `border-[#111]` a `border-blue-500` cuando `selected={true}`.

### Header (Cabecera)
- **Altura:** `h-7`.
- **Interacción:** Debe capturar `onMouseDown` para iniciar el arrastre del nodo.
- **Estilo:** Borde inferior `border-b border-black`. Color de fondo cambia si está seleccionado.
- **Texto:** `text-[11px]`, `font-semibold`, `truncate`.

### Body (Cuerpo)
- **Padding:** `p-2`.
- **Layout:** `flex flex-col gap-2`.

### Contenedor de Preview (Placeholder)
- **Forma:** Debe ser un **RECTÁNGULO PERFECTO**.
- **Prohibido:** No usar `rounded` ni bordes redondeados en el `div` que envuelve al componente `<Preview />`. El recorte de WebGL (scissor) es rectangular.
- **Dimensiones:** `w-full aspect-square`.
- **Fondo:** Puede tener borde, pero el contenido es renderizado por el `GlobalCanvas` superpuesto.

---

## 2. Jerarquía de Capas (Z-Index)

El sistema utiliza una jerarquía estricta para resolver la oclusión y la interacción.

1.  **Fondo / Grid:** `z-0`. (Div independiente con la imagen de grid).
2.  **Contenedor de Nodos:** `z-10`.
    *   Los nodos viven aquí. Tienen fondo opaco.
3.  **Global Canvas (Miniaturas):** `z-15`.
    *   Se renderiza **encima** de los nodos.
    *   Tiene `pointer-events-none` para permitir clickar en los nodos que están "debajo" visualmente.
4.  **Sidebar UI (Paneles Laterales):** `z-20` (Contenedores opacos).
5.  **Selección Box:** `z-30`.
6.  **Dropdowns/Modales:** `z-[100]`.

---

## 3. Sidebar Master Preview

El "Master Preview" situado en la barra lateral derecha tiene reglas especiales debido a la jerarquía de Z-Index.

- **Componente:** Usa `<SceneView />` (contexto aislado), **NO** `<Preview />`.
- **Motivo:** El `<GlobalCanvas />` (Z-15) queda oculto detrás del fondo de la Sidebar (Z-20).

---

## 4. Sockets (Entradas y Salidas)

Esta es la parte más crítica y propensa a romperse.

### Distribución
- Usar un contenedor `flex justify-between gap-4` para separar entradas (izquierda) de salidas (derecha).
- **Izquierda (Inputs):** `flex flex-col gap-2 pt-1 w-full`.
- **Derecha (Outputs):** `flex flex-col gap-2 pt-1 items-end`.

### El Punto de Conexión (El "Puntito")
Para lograr el efecto de que el socket está "pegado" al borde del nodo:
- **Dimensiones:** `w-3 h-3`.
- **Input:** Margen negativo a la izquierda `-ml-3`.
- **Output:** Margen negativo a la derecha `-mr-3`.
- **Interacción:** `cursor-crosshair`. Debe detener la propagación (`e.stopPropagation()`).

### Colores de Tipos
Usar siempre la función `getSocketColor(type)` para consistencia:
- `float`: Gris
- `vec3`: Amarillo
- `vec4`: Púrpura
- `color`: Rosa (Output) / Input field
- `texture`: Rosa Claro

---

## 5. Inputs Inline (Campos dentro del nodo)

Cuando un socket de entrada no está conectado, mostramos un control manual.

### Reglas Críticas
1. **Clase `nodrag`:** Cualquier input, select o botón interactivo dentro del nodo **DEBE** tener la clase `nodrag`.
2. **Tamaño de Texto:** `text-[9px]` o `text-[10px]`.
3. **Inputs Numéricos Simples (Float):**
   - Fondo: `bg-transparent`.
   - Alineación: `text-right`.
   - Estilo contenedor: `bg-[#0a0a0a]`, `border border-gray-800`.

### Valores por Defecto Contextuales (UX)
Cuando un input numérico se renderiza para un socket desconectado, **NO** debe mostrar siempre "0". Debe reflejar el valor neutro de la operación matemática para evitar que el usuario piense que su shader está roto.
- **Multiply / Divide / Power:** El input `B` debe tener un placeholder o valor por defecto de **1.0**. (Multiplicar por 0 destruye la señal).
- **Scale:** Debe ser **1.0**.
- **Alpha:** Debe ser **1.0**.
- **Range / IOR:** Valores sensatos (0.5, 1.5).

### Optimización de Inputs de Color (Throttling)
Los inputs de tipo `color` nativos disparan eventos `onChange` en cada frame. Usar `ThrottledColorInput`.

---

## 7. UI basada en módulos (obligatorio)

La UI de cada nodo debe declararse en su módulo (`nodes/modules/*.ts`) dentro de `NodeModule.ui`.

### Reglas
1. **No hardcode por `type` en la UI global** (`App.tsx` / `Node.tsx`).
    - La UI debe renderizarse desde la definición del módulo (secciones/controles).
2. **Socket rules / sockets efectivos**
    - La visibilidad/habilitación de sockets depende de reglas (`socketRules`).
    - La UI debe basarse en sockets efectivos (p.ej. `getEffectiveSockets`) para:
      - no renderizar sockets ocultos
      - deshabilitar interacción cuando el socket está deshabilitado
3. **maxConnections end-to-end**
    - El UI de conexión debe respetar `maxConnections`.
    - El linter debe reportar violaciones.
    - La sanitización de IA debe capear conexiones excedentes.

### Inputs Vectoriales (Vec2, Vec3, Vec4) - **¡CRÍTICO!**
Los vectores suelen romperse visualmente. Seguir esta estructura al pie de la letra:

1.  **Layout Vertical:** Usar `flex flex-col gap-0.5`. **NUNCA** poner los campos X, Y, Z uno al lado del otro en la misma línea horizontal para `vec3` en ancho `w-40`.
2.  **Contenedor del Eje:**
    - `flex items-center`, `bg-[#0a0a0a]`, `rounded`, `border border-gray-800`.
3.  **Etiqueta del Eje (Label):**
    - Debe estar **dentro** del borde del input.
    - Clases: `text-[8px] pl-1 select-none font-bold w-2`.
    - Colores: X (Rojo), Y (Verde), Z (Azul), W (Gris).
4.  **Campo de Entrada (Input):**
    - Clases: `w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right`.
    - Altura fija `h-3.5`.

---

## 6. Prevención de Errores Comunes

1. **Truncamiento de Archivos:** Al generar código con IA, asegurar siempre que el archivo `Node.tsx` se genere completo.
2. **Key Props:** En listas `.map()`, usar IDs únicos (`socket.id`).

3. **Nodos desconocidos:** Si llega un nodo con `type` sin módulo:
    - Renderizarlo como placeholder (label = type) y mostrar aviso.
    - No intentar “resolverlo” con tablas legacy.
