
# Lumina Shader Graph - GLSL Architecture & Generation Standards

> **CRÍTICO:** El entorno WebGL 1.0 / GLSL ES 1.00 es extremadamente estricto. Un solo error de tipo (ej. `float = int`) hará que todo el shader falle y se muestre rosa/negro. Sigue estas reglas estrictamente.

## 1. Reglas de Tipado Estricto (GLSL 1.0)

A diferencia de lenguajes modernos, GLSL 1.0 no hace conversiones implícitas.

### Floats vs Integers
- **INCORRECTO:** `float x = 1;` (Error de compilación).
- **CORRECTO:** `float x = 1.0;`
- **REGLA:** Si la variable es `float`, el número **SIEMPRE** debe llevar `.0` o `.` al final. Al generar código desde JS, usa `Number(val).toFixed(4)` para asegurar esto.

### Vectores y Casting
No se pueden mezclar dimensiones de vectores sin casting explícito.
- **INCORRECTO:** `vec3 a = vec4(1.0);`
- **CORRECTO:** `vec3 a = vec4(1.0).xyz;`
- **USO DE HELPER:** En `glslGenerator.ts`, utiliza siempre la función `castTo(val, fromType, toType)` al recibir inputs.

## 2. Matriz de Casting y Conversiones (`castTo`)

La función `castTo` en `services/glslGenerator.ts` es la guardiana de la integridad de tipos. Cualquier nodo nuevo debe confiar en ella para conectar sockets de diferentes dimensiones.

### Reglas de Conversión Automática
| Desde (`from`) | Hacia (`to`) | Resultado GLSL | Notas |
| :--- | :--- | :--- | :--- |
| `float` | `vec3` | `vec3(val)` | Expansión uniforme |
| `vec3` | `float` | `val.r` | Toma solo el canal Rojo/X |
| `vec2` | `vec3` | `vec3(val, 0.0)` | **CRÍTICO:** Z se rellena con 0.0 |
| `vec2` | `vec4` | `vec4(val, 0.0, 1.0)` | **CRÍTICO:** Z=0.0, W=1.0 (Ideal para UVs) |
| `vec3` | `vec4` | `vec4(val, 1.0)` | W se rellena con 1.0 (Opacidad por defecto) |
| `vec4` | `vec3` | `val.rgb` | Descarta W/Alpha |

> **NOTA:** Si añades un nuevo tipo de socket (ej. `mat3`), DEBES actualizar `castTo` para manejar sus conversiones (ej. `mat4(mat3)`).

## 3. Arquitectura del Generador (`glslGenerator.ts`)

### Estructura de la Generación
El generador ordena el grafo (tree-shaking/topological sort) y ejecuta la emisión por nodo a través de módulos.

1. **Variables Únicas:** Usar `ctx.varName(nodeId)` y registrar resultados en `ctx.variables[\"${id}_${socketId}\"]`.

2. **Manejo de Inputs (`ctx.getInput`)**
   - Siempre proveer un valor por defecto seguro (fallback) si el socket está desconectado.
   - Para floats: `'0.0'`
   - Para vectores: `'vec3(0.0)'`
   - Para texturas: `'u_tex_missing'` (Nunca dejar null o string vacío).

3. **Emisión por módulos (obligatorio)**
Cada nodo que participa en GLSL debe implementar `NodeModule.glsl.emit(ctx)`.
El módulo es responsable de:
- Emitir declaraciones en `ctx.body.push(...)`.
- Declarar uniforms que requiera vía `ctx.uniforms.add(...)`.
- Registrar outputs en `ctx.variables`.

Si un nodo no emite (o retorna `false`), el generador puede aplicar un fallback mínimo para no romper compilación, pero esto debe tratarse como bug.

### 3.1. Manejo de Inputs Especiales (Enums de UI)
Los nodos con Dropdowns (como `Rotate`, `Twirl` o `UV`) almacenan strings en `data.inputValues` cuando el usuario selecciona una opción en lugar de conectar un cable.

*   **El Problema:** Si el usuario selecciona "UV0" en el dropdown, `inputValues['uv']` será el string literal `'UV0'`. Si esto se pasa directo al shader (`vec2 uv = UV0;`), fallará porque `UV0` no es una variable definida.
*   **La Solución:** La función `toGLSL` **DEBE** interceptar estos strings especiales y mapearlos a las variables GLSL reales.
    *   `'UV0'` -> `'vUv'` (Fragment) o `'uv'` (Vertex).
*   **Implementación:**
    ```typescript
    const toGLSL = (val: any, type: SocketType): string => {
      if (val === 'UV0') return mode === 'vertex' ? 'uv' : 'vUv'; // Mapeo explícito
      // ... resto de lógica numérica
    }
    ```

### Construcción de Nodos Vectoriales
Los nodos `Vector 2`, `Vector 3` y `Vector 4` no son constantes estáticas. Deben construirse leyendo sus inputs individuales para permitir conexiones dinámicas en canales específicos.
- **INCORRECTO:** `vec4 v = toGLSL(node.data.value);` (Ignora conexiones entrantes).
- **CORRECTO:**
  ```typescript
  const x = getInput(id, 'x', '0.0', 'float');
  const y = getInput(id, 'y', '0.0', 'float');
  // ...
  body.push(`vec4 ${v} = vec4(${x}, ${y}, ${z}, ${w});`);
  ```

## 4. Coordenadas de Pantalla Virtuales (`u_viewPort`)

Este es un concepto arquitectónico clave de Lumina para simular ventanas independientes en un solo Canvas.

### El Problema
`gl_FragCoord` devuelve coordenadas absolutas del Canvas global.

### La Solución: Modos de Screen Position
El nodo `screenPosition` implementa lógica para transformar estas coordenadas usando el uniform `u_viewPort` (x, y, width, height) inyectado por el sistema:

1.  **Default (Normalized):** `(gl_FragCoord.xy - u_viewPort.xy) / u_viewPort.zw` -> Rango [0, 1].
2.  **Raw:** `gl_FragCoord` directo (Absoluto).
3.  **Center:** `Default * 2.0 - 1.0` -> Rango [-1, 1] con (0,0) en el centro del nodo.
4.  **Tiled:** Mantiene el aspect ratio dividiendo por la altura (`u_viewPort.w`) en lugar de dimensiones individuales.
5.  **Pixel:** Coordenadas en píxeles relativas a la esquina inferior izquierda del nodo (`gl_FragCoord.xy - u_viewPort.xy`).

### 4.1. Restricción de Contexto (Vertex vs Fragment)
**CRÍTICO:** La variable nativa `gl_FragCoord` (y por extensión el nodo **Screen Position**) **NO EXISTE** en el Vertex Shader. Intentar acceder a ella provoca un error de compilación/linkado fatal.

## 5. Sincronización Vertex <-> Fragment (Varyings)

Este es el punto más frágil para errores de "Link Error".

### La Regla de Oro
Si un nodo en el Fragment Shader necesita datos de geometría (Posición, Normal, Tangente) en un espacio específico (Object, World, View), **el Vertex Shader debe calcularlo y pasarlo**.

1. **Definición de Varyings:**
   - `vPosition` (World Space)
   - `vNormal` (World Space)
   - `vTangent` (World Space)
   - `vBitangent` (World Space)
   - `vObjectPosition` (Object Space)
   - `vObjectNormal` (Object Space)
   - `vObjectTangent` (Object Space)

## 6. Texturas, LOD y Gather

El manejo de texturas complejas requiere lógica adicional en WebGL 1.0.

### 6.1 Uniforms de Dimensiones (`u_texDim`)
Ciertos nodos como `Texture Size`, `Calculate LOD` o `Gather` necesitan saber el tamaño en píxeles de la textura.
*   **Generador:** Al detectar estos nodos, debe inyectar automáticamente `uniform vec2 u_texDim_{ID};`.
*   **PreviewSystem:** Al bindear la textura, debe leer `texture._size` y pasar el valor al uniform correspondiente.

### 6.2 Extensiones GLSL
Para funcionalidades avanzadas, el generador debe inyectar las directivas `#extension` al principio del shader si detecta ciertos nodos:
*   `Calculate LOD Texture` -> `#extension GL_OES_standard_derivatives : enable` (para `dFdx`, `dFdy`).
*   `Sample Texture 2D LOD` -> `#extension GL_EXT_shader_texture_lod : enable` (para `texture2DLodEXT`).

## 7. Texture Arrays (Simulación Atlas)

WebGL 1.0 **NO** soporta `sampler2DArray`. Lumina lo simula mediante un **Atlas Vertical**.

## 8. Matrices y Espacios de Coordenadas

WebGL usa matrices columna-major.

- **u_model:** Transforma de Object -> World.
- **u_view:** Transforma de World -> View (Cámara).
- **u_projection:** Transforma de View -> Clip Space.
- **u_model_inv:** Inversa de Modelo (Útil para transformar de World a Object).

## 9. Renderizado y Consistencia Visual

**Regla Universal:** Cualquier previsualización dentro de la UI del Graph Editor **DEBE** usar `GlobalCanvas` a través de `services/previewSystem.ts` y el componente wrapper `<Preview />`.

## 10. Sistema de Funciones Auxiliares (Helpers Injection)

Para nodos proceduras complejos (Ruido, Voronoi, Rotación), no inlineamos el código cientos de veces.

### Mecanismo
1.  **Definición:** Los helpers GLSL deben ser funciones puras en formato string.
2.  **Solicitud desde nodos:** Un módulo puede añadir helpers con `ctx.functions.add(HELPER_STRING)`.
3.  **Inyección:** El generador concatena el Set `functions` en el encabezado.

## 11. Regla de Completitud (Avoid Missing Pink Shader)

**CRÍTICO:** Cada tipo de nodo que pueda llegar a un Master (`output`/`vertex`) debe:
- tener un módulo descubierto por `nodes/index.ts`, y
- si es necesario, implementar `glsl.emit(ctx)` y registrar sus outputs en `ctx.variables`.

## 12. Estándar de Iluminación y Estética (The Lumina Look)

> **FILOSOFÍA:** El motor de renderizado de Lumina no busca el realismo físico neutro, sino un look "Cinemático y Pulido".

### 12.1. Curva de Especularidad
- **Fórmula Base:** `float shininess = 20.0 * exp2(6.0 * smoothness);`

### 12.2. Enmascaramiento de Sombras (Deep Blacks)
- **Regla:** El término especular debe multiplicarse estrictamente por una máscara de luz difusa.

### 12.3. Espacio de Color Lineal y Corrección de Gamma
Lumina trabaja matemáticamente en **Espacio Lineal** (Linear Space) pero las pantallas esperan **sRGB** (Gamma Space).
- **El Problema:** Si se emite el color lineal directamente, los valores oscuros (ej. `0.04`) aparecen negros puros, matando el detalle en las sombras ("Crushed Blacks").
- **La Solución:** Al final del Fragment Shader (tanto en Previews de nodos como en el Master), se debe aplicar una conversión de Gamma aproximada (Gamma 2.2).
- **Implementación Obligatoria:**
  ```glsl
  // Aproximación de pow(color, 1.0/2.2)
  vec3 finalColor = pow(max(linearColor, 0.0), vec3(0.4545));
  gl_FragColor = vec4(finalColor, alpha);
  ```
- **Resultado:** Esto alinea la visualización con motores como Unity/Unreal, haciendo visibles los grises oscuros.

## 13. Matemáticas Seguras (Safe Math)

En WebGL 1.0, las operaciones matemáticas indefinidas (como dividir por cero o raíces de negativos) generan `NaN` o `Infinity`.

### 13.1. Potencias (Power)
La función `pow(base, exp)` está **indefinida** si `base < 0`.
- **Implementación Obligatoria:** `vec3 res = pow(max(base, 0.00001), exp);`

### 13.2. División Segura
Evitar siempre la división por cero matemática.
- **Implementación Obligatoria:** `vec3 res = a / (b + 0.00001);`

## 14. Polimorfismo y Tipado Dinámico (Dynamic Typing)

Nodos como `Add`, `Subtract`, `Multiply` deben adaptarse automáticamente al tipo de datos de mayor rango conectado a ellos.

### Estrategia de Resolución (`getDynamicType`)
1.  **Analizar Inputs:** Revisar los tipos de las conexiones entrantes (`a`, `b`, `in`).
2.  **Determinar Rango:** `vec4` > `vec3` > `vec2` > `float`.
3.  **Casting de Operandos:** Convertir todos los inputs al tipo resultante antes de operar.

## 15. Parallax Mapping
El nodo de Parallax Mapping requiere una lógica específica en el Fragment Shader para simular profundidad.
- **Requiere:** Matriz TBN (Tangent, Bitangent, Normal).
- **Cálculo:** Se debe transformar el `viewDir` de World Space a Tangent Space: `viewDirTS = viewDirWS * TBN`.
- **Offset:** `vec2 offset = viewDirTS.xy * (height * amplitude)`.
