---
trigger: always_on
---

# Lumina Shader Graph - Architecture and Maintenance Guidelines

> **OBJECTIVE:** This document defines the project's modular structure. Any future modification **MUST** respect this separation of concerns to avoid code duplication and technical debt.

## 1. Rendering Layer (WebGL)

We have adopted a **Single Context** architecture for graph nodes and **Isolated Contexts** for critical UI views.

### 1.1. "Global Canvas" Strategy (Shared Context)
*   **Scope:** The `<GlobalCanvas />` manages **exclusively** the thumbnails within the graph nodes.
*   **Positioning:**
    *   It is placed at **Z-Index 15**.
    *   This places it **above** the Nodes (Z-10) to ensure visibility.
    *   This places it **below** the Sidebar UI (Z-20) so that floating menus correctly cover the graph.
*   **Viewport Virtualization (`u_viewPort`):**
    *   The system uses `gl.scissor` to draw in small areas of the large canvas.
    *   **CRITICAL:** For shaders to work as if each node were an independent screen, `previewSystem.ts` calculates and injects a `vec4 u_viewPort` (x, y, width, height) uniform for each render call.
    *   Shaders use this to normalize `gl_FragCoord`. Without this, nodes like `Screen Position` would fail.
*   **Interaction:** It has `pointer-events-none`. Mouse events pass through the canvas and reach the nodes underneath.
*   **Orchestration:** The `services/previewSystem.ts` singleton manages this canvas.

### 1.2. Role of `SceneView` (Isolated Contexts)
*   **Usage:** The `SceneView.tsx` component creates its own WebGL context.
*   **Implementation Cases:**
    1.  **"3D Scene" Tab:** Requires full screen and orbital camera control.
    2.  **Sidebar Master Preview:** Since the Sidebar (Z-20) has an opaque background that covers the GlobalCanvas (Z-15), the master preview must be a `SceneView` rendered within the Sidebar DOM to be visible.
*   **Viewport:** In these cases, `u_viewPort` is passed as `(0, 0, canvasWidth, canvasHeight)` since they occupy their own canvas entirely.

### 1.3. Services Structure
1.  **`services/previewSystem.ts` (Orchestrator):**
    *   Manages the global rendering loop.
    *   Calculates the intersection between DOM elements (Nodes) and the global canvas.
    *   Manages Shader and Texture cache.
    *   **Critical Responsibility:** Calculate the Scissor Rect relative to the Canvas and pass it to the shader.

2.  **`services/webglUtils.ts` (Lifecycle):**
    *   This is where ALL the "dirty" WebGL 1.0 API logic resides.
    *   **Responsibilities:** `createContext` (Extensions, Flags), `createProgram` (Link), `loadTexture` (POT Resizing), `applyTextureParams` (Wrap/Filter).

3.  **`services/renderUtils.ts` (Math and Geometry):**
    *   Single source of truth for meshes and matrices.
    *   **Responsibilities:** Generate vertices (`createSphere`, `createCube`), Matrix operations (`mat4`).
    *   **Reason:** Ensures that the `Preview` (thumbnail) and `SceneView` (full screen) render exactly the same geometry.

### 1.4. Rendering Visual Identity
*   **Consistency:** The application must maintain a coherent visual identity across all contexts (Node Previews and SceneView).
*   **Lumina Look & Gamma Pipeline:**
    *   A specific lighting standard is defined (aggressive specular curve, shadow masking).
    *   **Gamma Correction:** The application uses a Linear Workflow. All math operations are performed in linear space, but the final output to the fragment shader (`gl_FragColor`) **MUST** be converted to Gamma space (sRGB) using `pow(color, 1.0/2.2)`. This is crucial so that low values do not appear black.
*   **Reference:** Any change in lighting logic must be consistent with the Master Output. Avoid hardcoded speculars in individual nodes; use the centralized lighting system.

### 1.5. Node Previews: Color vs Vector (Avoid “Red → Pink”)

Node previews have a special case: a `vec3/vec4` can represent **Color** (RGB/RGBA) or a **Data Vector** (Normal/Position/Direction).

*   **Historical Problem:** If a value that is conceptually color is interpreted as a data vector, the preview may apply a $[-1,1] \to [0,1]$ remap.
    *   Example: `vec3(1,0,0)` (red) becomes `vec3(1,0.5,0.5)` (pink).
*   **Directive:** The preview must be faithful to what the Master would see (same visual intent: color/lighting).
*   **Current Implementation:** Classification is performed in `services/glslGenerator.ts` when generating the node preview shader.
    *   By default, `vec3/vec4` are treated as **color** in previews.
    *   They are only treated as a **data vector** (and thus remapped) if the node is clearly vectorial (Normal/Position/Tangent/etc.).
*   **Rule for New Nodes:**
    *   If your node returns “color” (even if it's a `vec3`), type its output as `color` whenever possible.
    *   If your node returns a data vector (normal/position/direction), ensure that `node.type` reflects that semantics or update the vector hints list in `services/glslGenerator.ts`.

## 2. Shader Logic Layer (GLSL)

GLSL code generation is the core of the application.

1.  **`services/glslGenerator.ts`:**
    *   It is the generation **orchestrator**: builds header/uniforms/varyings, sorts the graph (tree-shaking), and provides an `EmitContext` to each node.
    *   **"GLSL Infrastructure" source of truth**: `toGLSL`, `castTo`, `getDynamicType`, injection of extensions, and global helpers.
    *   **Nodes emit GLSL** exclusively through `NodeModule.glsl.emit(ctx)` (see `nodes/modules/*.ts`).
    *   **Critical GLSL Emission Rules (Architecture):**
        1.  **Strict Typing:** WebGL 1.0 is strict. Always use `1.0` instead of `1` for floats.
        2.  **Unique Naming:** Use `ctx.varName(ctx.id)` to avoid collisions.
        3.  **Input Fallbacks:** Always use `ctx.getInput` to correctly handle cables vs. inline values.
        4.  **No Side Effects:** Nodes must not modify global state, only register variables, functions, or uniforms in the provided context.
    *   **Casting:** The `castTo` system automatically manages conversion between float, vec2, vec3, and vec4 based on the node's "Maximum Rank".

### 2.1. Dynamic Dimension Resolution (Polymorphism)
Math nodes (`Add`, `Mul`, `Pow`, `Mix`, etc.) are polymorphic. Their output data type depends on the input types.

*   **Strategy:** Do not assume `vec3` by default.
*   **Implementation:** Math nodes must request the resulting type with `ctx.getDynamicType([...socketIds])` and cast inputs with `ctx.castTo(...)`.
    1.  Traverse connections backwards.
    2.  Determine the "Maximum Rank" of the inputs (`vec4` > `vec3` > `vec2` > `float`).
    3.  Adjust code generation to automatically cast lower-rank operands to the maximum rank.

### 2.2. Tree Shaking Strategy (Graph Optimization)
The WebGL environment is extremely sensitive to unused or incorrectly placed code, especially in the Vertex Shader.

*   **Problem:** Including all graph nodes in both shaders (Vertex and Fragment) causes fatal errors.
*   **Directive:** The generator implements **Tree Shaking** to ensure execution order but allows **Disconnected Islands**.
    *   **Vertex Shader Generation:** Nodes connected to the **Vertex Master** are prioritized.
    *   **Fragment Shader Generation:** All nodes are processed, including disconnected islands, to allow isolated examples and dynamic previews without needing a connection to the Master.

## 3. Interface Layer (UI)

The UI must be consistent and performant.

1.  **`components/Node.tsx`:**
    *   Uses the `<Preview />` component.
    *   This component DOES NOT render a canvas; it only registers a `div` (DOM reference) in the `previewSystem`.
    *   The preview container acts as a spatial placeholder. The `GlobalCanvas` draws over it.

2.  **`App.tsx` (Global State):**
    *   Maintains the "Single Source of Truth" of the graph (`nodes`, `connections`).
    *   Calculates and distributes the texture map (`textureUniforms`) including Sampler configuration.

## 4. AI and Validation Services (Lumina Brain)

The "AI Assist" functionality is not a simple API call; it's a structured pipeline.

1.  **Orchestrator (`services/geminiService.ts`):**
    *   Implements the implicit **Chain-of-Thought** pattern.
    *   **Primary Model:** MUST use `gemini-3-flash-preview` (AI-3-Flash) for its advanced reasoning and speed.
    *   **Thinking Mode:** Always enabled via `thinkingConfig: { includeThoughts: true }` to capture the reasoning process.
    *   **Phase 1 (Drafting):** Interprets the user's prompt and generates a raw JSON of the graph.
    *   **Phase 2 (Refining):** Receives the Linter report and fixes connection errors or isolated nodes.

2.  **Validator (`services/linter.ts`):**
    *   Analyzes the structural integrity of the graph.
    *   Detects cycles, orphaned nodes, and missing Masters.

## 5. Node Architecture (Strict Modularity)

Lumina is **module-first**: each node type lives in its own file and defines everything necessary.

### 5.1. Golden Rule
To add/edit/delete a node, it should not be necessary to touch a "central map" of definitions.

### 5.2. How to Add a New Node
1. Create a new file in `nodes/modules/<name>Node.ts`.
2. Export a `NodeModule` object with:
    - `type` (stable string)
    - `definition` (label + sockets)
    - `ui` (optional)
    - `socketRules` (optional)
    - `initialData` (optional)
    - `glsl.emit(ctx)` (optional; if the node participates in GLSL)
3. Do not register the node manually: `nodes/index.ts` discovers it via `import.meta.glob`.

### 5.3. Node Capabilities (Metadata)
Instead of hardcoding node types in central services, use the `metadata` property to declare capabilities:
-   `isTextureSampler`: Does this node consume a texture asset? (Auto-injects uniforms).
-   `requiresLod`: Does this node need `GL_EXT_shader_texture_lod`?
-   `requiresDerivatives`: Does this node need `GL_OES_standard_derivatives`?
-   `isDataVector`: If true, the node preview treats `vec3` output as data ([-1,1] -> [0,1]) instead of color.
-   `isSourceNode`: (Linter) Indicates this node generates data without inputs (e.g., Time, UV).
-   `isMasterNode`: (Linter) Indicates this node is a graph endpoint (e.g., Fragment Master) and doesn't need outputs.
-   `headerColor`: (UI) CSS class override for the node header background (e.g., 'bg-yellow-500').
-   `legacyAliases`: List of old `type` names that should map to this node (for backward compatibility).

```typescript
// Example
export const myNode: NodeModule = {
  type: 'myNode',
  // ...
  metadata: {
    isTextureSampler: true,
    requiresLod: true,
    legacyAliases: ['oldNodeName']
  },
  // ...
};
```

### 5.3. Initial Graph Bootstrap
The initial graph lives in `initialGraph.ts`. If the "starter graph" is changed, it is changed there.

### 5.4. Unknown Nodes
If a graph is loaded with a `type` that has no module present:
* The UI and linter must degrade safely (placeholder/warning).
* It must not be "revived" with legacy definitions.

## 6. Workflow for New Features

If you are going to add a new feature, follow this decision tree:

### Do you want to add a new geometric shape (e.g., Torus)?
1.  **DO NOT** add it in `SceneView.tsx`.
2.  **DO** define the mathematical function in `services/renderUtils.ts`.
3.  Import it into the visual components.

### Do you want to add a complex procedural node (e.g., Fractal)?
1. Implement the node as a module (`nodes/modules/...`).
2. If you need reusable GLSL helpers, add the function string to `ctx.functions` from `glsl.emit(ctx)`.

### Does the Shader fail to compile (Pink Screen)?
1.  **DO NOT** try to hack the string in the component.
2.  Debug `generateCode` in `services/glslGenerator.ts`.
3.  Verify that there are no type mismatches (float vs. int) in the code emitted by the node.

## 6. WebGL Program Cache Management

Compiling and linking WebGL programs is an expensive operation. The system uses a cache based on the shader source code.

### 6.1. Strict Hashing
*   **Directive:** The cache key in `previewSystem.ts` (`getProgramKey`) must be generated by hashing **THE ENTIRE** Vertex and Fragment Shader string.
*   **Implementation:** Use a numerical hash (DJB2).

## 7. Texture Pipeline and Arrays (Atlas)

Texture handling in WebGL 1.0 requires careful synchronization between the GPU state and Uniforms.

### 7.1. Data Structure (`TextureConfig`)
Textures ARE NOT passed as simple strings (URL). A configuration object is used:
```typescript
interface TextureConfig {
  url: string;   // Image source
  wrap: string;  // 'Repeat' | 'Clamp' | 'Mirror'
  filter: string;// 'Linear' | 'Point' | 'Trilinear'
}
```

### 7.2. Texture 2D Arrays (Compatibility)
Since WebGL 1.0 does not support `Texture2DArray`, a **Vertical Texture Atlas** strategy is used.

## 8. AI Behavioral & Documentation Rules

### 8.1. API Knowledge Source
*   **Mandate:** Do NOT rely on training data for Gemini API features (Model IDs, Config Params, thinking steps).
*   **Source of Truth:** ALWAYS use the documentation at `https://ai.google.dev/gemini-api/docs/` as the updated reference.
*   **Specifics for Gemini 3:**
    *   Use `gemini-3-flash-preview` as the stable architectural choice.
    *   Utilize `parts` in the response to extract `thought` data separately from `text` content.

### 8.2. Graph Injection Strategy (Cognitive Ease)
*   **Avoid Raw JSON Dumps:** When feeding node definitions to the model, use structured Schema summaries (e.g., `- node_name: Inputs[...] -> Outputs[...]`) instead of dumping the entire TypeScript file.
*   **Continuity:** The model MUST be aware of the exact socket IDs (inputs/outputs) of every node in the `nodes/modules` folder to prevent connection hallucinations.
