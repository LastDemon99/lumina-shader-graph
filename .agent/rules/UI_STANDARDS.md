---
trigger: always_on
---

# Lumina Shader Graph - UI & Architecture Standards

## 1. General Node Structure (`Node.tsx`)

The `Node` component is the fundamental block. Any change in its CSS will affect the entire graph.

### Main Container
- **Positioning:** `absolute`. The `x, y` coordinates are applied via `style`.
- **Dimensions:**
  - Standard width: `w-44` (176px).
  - Extended width: `w-60` (240px) for complex nodes (Slider, Gradient, Color, etc.).
- **Style:** `bg-[#1e1e1e]`, rounded corners `rounded-lg`, shadow `shadow-xl`.
- **Selection:** The border changes from `border-[#111]` to `border-blue-500` when `selected={true}`.

### Header
- **Height:** `h-7`.
- **Interaction:** Must capture `onMouseDown` to initiate node dragging.
- **Style:** Bottom border `border-b border-black`. Background color changes if selected.
- **Text:** `text-[11px]`, `font-semibold`, `truncate`.

### Body
- **Padding:** `p-2`.
- **Layout:** `flex flex-col gap-2`.

### Preview Container (Placeholder)
- **Shape:** Must be a **PERFECT RECTANGLE**.
- **Prohibited:** Do not use `rounded` or rounded borders on the `div` that wraps the `<Preview />` component. WebGL clipping (scissor) is rectangular.
- **Dimensions:** `w-full aspect-square`.
- **Background:** Can have a border, but the content is rendered by the overlaid `GlobalCanvas`.

### Critical Note: “preview enabled” does not define color semantics
Marking `ui.preview: { enabled: true }` in a node only controls **if the thumbnail is shown**, but it does not determine whether the value is interpreted as **Color** or as a **Data Vector**.

- Semantics are decided in the generator (`services/glslGenerator.ts`) and depend on the output type (`color` vs `vec3/vec4`) and heuristics by `node.type`.
- If a node that conceptually produces color is interpreted as a vector, the "washed out" effect (e.g., red → pink) may occur due to the $[-1,1]\to[0,1]$ remapping.
- If you notice this effect when enabling previews or touching the UI, the fix is NOT in CSS/Node.tsx: check the module typing (`nodes/modules/*.ts`) and/or the classification heuristics in `services/glslGenerator.ts`.

#### Difference between 2D and 3D Preview:
- **3D Preview**: Applies the lighting model, shadows, and specular to visualize how the value interacts with a surface. Here, color vs vector semantics are critical to avoid the "washed out" effect.
- **2D Preview**: Must be **1:1 to the output RGBA/Value**. It should not apply lighting, shadows, or environment modifications. It should only show the pure pixels and their direct transformations.

---

## 2. Layer Hierarchy (Z-Index)

The system uses a strict hierarchy to resolve occlusion and interaction.

1.  **Background / Grid:** `z-0`. (Independent div with the grid image).
2.  **Node Container:** `z-10`.
    *   Nodes live here. They have an opaque background.
3.  **Global Canvas (Thumbnails):** `z-15`.
    *   Renders **above** the nodes.
    *   Has `pointer-events-none` to allow clicking on nodes "underneath" visually.
4.  **Sidebar UI (Side Panels):** `z-20` (Opaque containers).
5.  **Selection Box:** `z-30`.
6.  **Dropdowns/Modals:** `z-[100]`.

---

## 3. Sidebar Master Preview

The "Master Preview" located in the right sidebar has special rules due to the Z-Index hierarchy.

- **Component:** Use `<SceneView />` (isolated context), **NOT** `<Preview />`.
- **Reason:** The `<GlobalCanvas />` (Z-15) is hidden behind the Sidebar background (Z-20).

---

## 4. Sockets (Inputs and Outputs)

This is the most critical part and prone to breaking.

### Distribution
- Use a `flex justify-between gap-4` container to separate inputs (left) from outputs (right).
- **Left (Inputs):** `flex flex-col gap-2 pt-1 w-full`.
- **Right (Outputs):** `flex flex-col gap-2 pt-1 items-end`.

### The Connection Point (The "Dot")
To achieve the effect that the socket is "stuck" to the node edge:
- **Dimensions:** `w-3 h-3`.
- **Input:** Negative left margin `-ml-3`.
- **Output:** Negative right margin `-mr-3`.
- **Interaction:** `cursor-crosshair`. Must stop propagation (`e.stopPropagation()`).

### Type Colors
Always use the `getSocketColor(type)` function for consistency:
- `float`: Gray
- `vec3`: Yellow
- `vec4`: Purple
- `color`: Pink (Output) / Input field
- `texture`: Light Pink

---

## 5. Inline Inputs (Fields inside the node)

When an input socket is not connected, we show a manual control.

### Critical Rules
1. **`nodrag` Class:** Any input, select, or interactive button inside the node **MUST** have the `nodrag` class.
2. **Text Size:** `text-[9px]` or `text-[10px]`.
3. **Simple Numeric Inputs (Float):**
   - Background: `bg-transparent`.
   - Alignment: `text-right`.
   - Container style: `bg-[#0a0a0a]`, `border border-gray-800`.

### Contextual Default Values (UX)
When a numeric input is rendered for a disconnected socket, it **SHOULD NOT** always show "0". It should reflect the neutral value of the mathematical operation to prevent the user from thinking their shader is broken.
- **Multiply / Divide / Power:** Input `B` should have a placeholder or default value of **1.0**. (Multiplying by 0 destroys the signal).
- **Scale:** Should be **1.0**.
- **Alpha:** Should be **1.0**.
- **Range / IOR:** Sensible values (0.5, 1.5).

### Color Input Optimization (Throttling)
Native `color` type inputs trigger `onChange` events every frame. Use `ThrottledColorInput`.

---

## 7. Module-based UI (mandatory)

The UI for each node must be declared in its module (`nodes/modules/*.ts`) within `NodeModule.ui`.

### Rules
1. **No hardcoding by `type` in the global UI** (`App.tsx` / `Node.tsx`).
    - The UI must render from the module definition (sections/controls).
2. **Socket rules / effective sockets**
    - Socket visibility/enabling depends on rules (`socketRules`).
    - The UI must be based on effective sockets (e.g., `getEffectiveSockets`) to:
      - not render hidden sockets
      - disable interaction when the socket is disabled
3. **maxConnections end-to-end**
    - The connection UI must respect `maxConnections`.
    - The linter must report violations.
    - AI sanitization must cap exceeding connections.

### Vectorial Inputs (Vec2, Vec3, Vec4) - **CRITICAL!**
Vectors often break visually. Follow this structure strictly:

1.  **Vertical Layout:** Use `flex flex-col gap-0.5`. **NEVER** put X, Y, Z fields next to each other on the same horizontal line for `vec3` in `w-44` width.
2.  **Axis Container:**
    - `flex items-center`, `bg-[#0a0a0a]`, `rounded`, `border border-gray-800`.
3.  **Axis Label:**
    - Must be **inside** the input border.
    - Classes: `text-[8px] pl-1 select-none font-bold w-2`.
    - Colors: X (Red), Y (Green), Z (Blue), W (Gray).
4.  **Input Field:**
    - Classes: `w-10 h-3.5 bg-transparent text-[9px] text-gray-300 px-1 outline-none text-right`.
    - Fixed height `h-3.5`.

---

## 6. Prevention of Common Errors

1. **File Truncation:** When generating code with AI, always ensure the `Node.tsx` file is generated completely.
2. **Key Props:** In list `.map()`, use unique IDs (`socket.id`).

3. **Unknown Nodes:** If a node with a `type` arrives without a module:
    - Render it as a placeholder (label = type) and show a warning.
    - Do not try to “resolve” it with legacy tables.
