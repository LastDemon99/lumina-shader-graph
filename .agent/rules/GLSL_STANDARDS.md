# Lumina Shader Graph - GLSL Architecture & Generation Standards

> **CRITICAL:** The WebGL 1.0 / GLSL ES 1.00 environment is extremely strict. A single type error (e.g., `float = int`) will cause the entire shader to fail and render as pink/black. Follow these rules strictly.

## 1. Strict Typing Rules (GLSL 1.0)

Unlike modern languages, GLSL 1.0 does not perform implicit conversions.

### Floats vs. Integers
- **INCORRECT:** `float x = 1;` (Compilation error).
- **CORRECT:** `float x = 1.0;`
- **RULE:** If a variable is a `float`, the number **MUST ALWAYS** have a `.0` or a `.` at the end. When generating code from JS, use `Number(val).toFixed(5)` to ensure this.

### Vectors and Casting
Vector dimensions cannot be mixed without explicit casting.
- **INCORRECT:** `vec3 a = vec4(1.0);`
- **CORRECT:** `vec3 a = vec4(1.0).xyz;`
- **HELPER USAGE:** In `glslGenerator.ts`, always use the `castTo(val, fromType, toType)` function when processing inputs.

## 2. Casting and Conversion Matrix (`castTo`)

The `castTo` function in `services/glslGenerator.ts` is the guardian of type integrity. Every new node must rely on it to connect sockets of different dimensions.

### Automatic Conversion Rules
| From (`from`) | To (`to`) | GLSL Result | Notes |
| :--- | :--- | :--- | :--- |
| `float` | `vec3` | `vec3(val)` | Uniform expansion |
| `vec3` | `float` | `val.r` | Takes only the Red/X channel |
| `vec2` | `vec3` | `vec3(val, 0.0)` | **CRITICAL:** Z is filled with 0.0 |
| `vec2` | `vec4` | `vec4(val, 0.0, 1.0)` | **CRITICAL:** Z=0.0, W=1.0 (Ideal for UVs) |
| `vec3` | `vec4` | `vec4(val, 1.0)` | W is filled with 1.0 (Default opacity) |
| `vec4` | `vec3` | `val.rgb` | Discards W/Alpha |

> **NOTE:** If you add a new socket type (e.g., `mat3`), you MUST update `castTo` to handle its conversions (e.g., `mat4(mat3)`).

## 3. Generator Architecture (`glslGenerator.ts`)

### Generation Structure
The generator sorts the graph (tree-shaking/topological sort) and executes node emission via modules.

1.  **Unique Variables:** Use `ctx.varName(nodeId)` and register results in `ctx.variables["${id}_${socketId}"]`.

2.  **Input Handling (`ctx.getInput`)**
    - Always provide a safe default value (fallback) if the socket is disconnected.
    - For floats: `'0.0'`
    - For vectors: `'vec3(0.0)'`
    - For textures: `'u_tex_missing'` (Never leave null or empty string).

3.  **Module Emission (Mandatory)**
    Each node participating in GLSL must implement `NodeModule.glsl.emit(ctx)`.
    The module is responsible for:
    - Emitting declarations in `ctx.body.push(...)`.
    - Declaring required uniforms via `ctx.uniforms.add(...)`.
    - Registering outputs in `ctx.variables`.

    If a node does not emit (or returns `false`), the generator may apply a minimal fallback to avoid breaking compilation, but this should be treated as a bug.

### 3.1. Node Previews: “Color vs. Vector” Classification

When `glslGenerator.ts` generates the shader for **previewing a node** (thumbnail in the graph), it must decide how to display the result based on the `u_previewMode` uniform (0 = 2D/Data, 1 = 3D/Lit):

1.  **Vector Preview (Data)**:
    - Applied to nodes clearly identified as data (Normal, Position, Tangent, etc.).
    - Use the standard remap: `gl_FragColor = vec4(value * 0.5 + 0.5, 1.0);`.
    - Always rendered **unlit** to preserve data visibility.

2.  **Color/Scalar Preview**:
    - **2D Mode (`u_previewMode == 0`)**: Rendered **1:1** with the raw RGBA output to ensure data accuracy for debugging.
    - **3D Mode (`u_previewMode == 1`)**: Rendered using the master lighting model (`applyLighting`) and gamma correction to show how the value interacts with a surface.

#### Preventing "Washed Out" Colors
If the vector remap is mistakenly applied to a color, saturated colors become "washed out" (e.g., `vec3(1,0,0)` red becomes `vec3(1,0.5,0.5)` pink).
- **Rule:** `vec3/vec4` are treated as **color by default** unless the `node.type` or its semantic hints (normal, position, etc.) indicate it's a vector.
- Classification heuristics reside in `services/glslGenerator.ts` (`VECTOR_PREVIEW_NODE_TYPE_HINTS`).

### 3.2. Special Input Handling (UI Enums)
Nodes with dropdowns (like `Rotate`, `Twirl`, or `UV`) store strings in `data.inputValues` when a user selects an option instead of connecting a wire.

- **The Problem:** Selecting "UV0" results in the literal string `'UV0'`. Passing this directly to GLSL (`vec2 uv = UV0;`) causes a compilation error.
- **The Solution:** The `toGLSL` function **MUST** intercept these special strings and map them to real GLSL variables.
    - `'UV0'` -> `'vUv'` (Fragment) or `'uv'` (Vertex).

### 3.3. Vector Node Construction
`Vector 2`, `Vector 3`, and `Vector 4` nodes are not static constants. They must be built by reading their individual inputs to allow dynamic connections on specific channels.
- **INCORRECT:** `vec4 v = toGLSL(node.data.value);` (Ignores incoming connections).
- **CORRECT:**
  ```typescript
  const x = getInput(id, 'x', '0.0', 'float');
  const y = getInput(id, 'y', '0.0', 'float');
  // ...
  body.push(`vec4 ${v} = vec4(${x}, ${y}, ${z}, ${w});`);
  ```

## 4. Virtual Screen Coordinates (`u_viewPort`)

This is a key Lumina architectural concept to simulate independent windows within a single Canvas.

- **Problem:** `gl_FragCoord` returns absolute coordinates from the global Canvas.
- **Solution:** The `screenPosition` node implements logic to transform these coordinates using the `u_viewPort` (x, y, width, height) uniform injected by the system.
- **Constraint:** `gl_FragCoord` (and the **Screen Position** node) **DOES NOT EXIST** in the Vertex Shader. Attempting to access it results in a fatal compilation/link error.

## 5. Vertex <-> Fragment Synchronization (Varyings)

This is the most fragile point for "Link Errors."

### The Golden Rule
If a node in the Fragment Shader needs geometry data (Position, Normal, Tangent) in a specific space (Object, World, View), **the Vertex Shader must calculate and pass it** via varyings.

**Standard Varyings:**
- `vPosition`, `vNormal`, `vTangent`, `vBitangent` (World Space)
- `vObjectPosition`, `vObjectNormal`, `vObjectTangent` (Object Space)
- `vUv` (UV coordinates)

## 6. Textures, LOD, and Extensions

### 6.1. Dimension Uniforms (`u_texDim`)
Nodes like `Texture Size`, `Calculate LOD`, or `Gather` require pixel dimensions.
- **Generator:** Automatically injects `uniform vec2 u_texDim_{ID};` upon detecting these nodes.
- **PreviewSystem:** Reads `texture._size` and passes it to the uniform.

### 6.2. GLSL Extensions
The generator must inject `#extension` directives at the beginning of the shader:
- `Calculate LOD Texture` -> `GL_OES_standard_derivatives` (Fragment only).
- `Sample Texture 2D LOD` -> `GL_EXT_shader_texture_lod` (Fragment/Vertex).

## 7. Texture Arrays (Atlas Simulation)
WebGL 1.0 **DOES NOT** support `sampler2DArray`. Lumina simulates it using a **Vertical Texture Atlas** strategy.

## 8. Matrices and Coordinate Spaces
WebGL uses column-major matrices.
- `u_model`: Object -> World.
- `u_view`: World -> View.
- `u_projection`: View -> Clip Space.
- `u_model_inv`: World -> Object inversed model.

## 9. Adaptive Gamma Correction (The Lumina Look)

Lumina performs math in **Linear Space** but displays in **sRGB Space** (Gamma).

### Master Output Implementation
To avoid "Crushed Blacks" (dark values appearing pure black), the Master Output applies **Adaptive Gamma Correction**:
```glsl
vec3 _finalLighting = max(lighting + emission, 0.0);
float _finalLuma = dot(_finalLighting, vec3(0.3333));
vec3 _finalGamma = pow(_finalLighting, vec3(0.4545)); // Gamma 2.2 approx
vec3 finalColor = mix(_finalGamma, _finalLighting, smoothstep(0.0, 0.5, _finalLuma));
gl_FragColor = vec4(finalColor, alpha);
```
This aligns the visualization with engines like Unity/Unreal, ensuring visibility in shadow areas.

## 10. Safe Math Implementation

In WebGL 1.0, undefined operations generate `NaN` or `Infinity`.

### 10.1. Power
`pow(base, exp)` is **undefined** if `base < 0`.
- **Mandatory Implementation:** `vec3 res = pow(max(base, 0.00001), exp);`

### 10.2. Safe Division
Always avoid mathematical division by zero.
- **Mandatory Implementation:** `vec3 res = a / (b + 0.00001);`

## 11. Dynamic Typing (Polymorphism)
Nodes like `Add`, `Subtract`, `Multiply` adapt automatically to the highest rank connected input.
- **Resolution Strategy (`getDynamicType`):**
    1. Analyze connected input types.
    2. Determine Rank: `vec4` > `vec3` > `vec2` > `float`.
    3. Cast all operands to the resulting type before operating.
