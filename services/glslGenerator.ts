import { ShaderNode, Connection, NodeType, SocketType, GradientStop } from '../types';
import { getNodeModule } from '../nodes';

// In node previews we need to decide whether a vec3/vec4 represents a *data vector*
// (normals/positions/etc. -> remap [-1,1] to [0,1]) or a *color* (show lit result).
// Defaulting vec3 to "vector" causes saturated colors like red (1,0,0) to appear pink
// (1,0.5,0.5) due to the remap, so we only treat clearly vector-ish node types as vectors.
const VECTOR_PREVIEW_NODE_TYPE_HINTS = [
    'normal',
    'tangent',
    'bitangent',
    'position',
    'direction',
    'screenPosition',
    'viewDir',
    'object',
    'camera',
];

const isVectorPreviewNodeType = (nodeType: string): boolean => {
    const t = String(nodeType);
    // Exact matches for common semantic nodes
    if (
        t === 'normal' ||
        t === 'tangent' ||
        t === 'bitangent' ||
        t === 'position' ||
        t === 'screenPosition' ||
        t === 'mainLightDirection' ||
        t === 'object'
    ) return true;

    // Fuzzy matches for future/variant node names
    const lower = t.toLowerCase();
    return VECTOR_PREVIEW_NODE_TYPE_HINTS.some(h => lower.includes(h.toLowerCase()));
};

// Helper to determine required extensions based on used nodes
const getRequiredExtensions = (nodes: ShaderNode[], mode: 'fragment' | 'vertex'): string => {
    const extensions = new Set<string>();

    const needsDerivatives = nodes.some(n => n.type === 'calculateLevelOfDetailTexture');

    // Check if any node potentially needs LOD logic
    // This includes explicit LOD nodes, OR standard texture nodes used in Vertex Shader
    // We strictly enable it if we might need it.
    const needsLod = nodes.some(n =>
        n.type === 'sampleTexture2DLOD' ||
        (mode === 'vertex' && n.type === 'texture') ||
        n.type === 'textureSize' ||
        n.type === 'calculateLevelOfDetailTexture' ||
        (mode === 'vertex' && n.type === 'sampleTexture2DArray') ||
        (mode === 'vertex' && n.type === 'parallaxMapping')
    );

    // OES_standard_derivatives is Fragment Only
    if (needsDerivatives && mode === 'fragment') extensions.add('#extension GL_OES_standard_derivatives : enable');

    // EXT_shader_texture_lod can be used in Vertex for explicit LOD
    if (needsLod) extensions.add('#extension GL_EXT_shader_texture_lod : enable');

    return Array.from(extensions).join('\n') + (extensions.size > 0 ? '\n' : '');
};

const COMMON_HEADER = `
  precision highp float;
  precision highp int;
  
  #define PI 3.14159265359
  #define TAU 6.28318530718

  // Transpose Polyfill
  mat3 transpose(mat3 m) {
    return mat3(
      m[0].x, m[1].x, m[2].x,
      m[0].y, m[1].y, m[2].y,
      m[0].z, m[1].z, m[2].z
    );
  }
  
  // Texture LOD Polyfill/Macro for Fragment Shader
  #ifdef GL_EXT_shader_texture_lod
    #define texture2D_LOD(sampler, coord, lod) texture2DLodEXT(sampler, coord, lod)
  #else
    // Fallback for drivers missing the extension (ignores LOD)
    #define texture2D_LOD(sampler, coord, lod) texture2D(sampler, coord)
  #endif
`;

const COLOR_FUNCTIONS = `
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
`;

const LIGHTING_FUNCTIONS = `
vec3 applyLighting(vec3 baseColor, vec3 normal, vec3 viewDir, vec3 lightDir, vec3 lightColor, vec3 specularColor, float smoothness, float occlusion) {
    // 1. Setup Vectors
    vec3 N = normalize(normal);
    vec3 L = normalize(lightDir);
    vec3 V = normalize(viewDir);
    vec3 H = normalize(L + V);

    // 2. Diffuse Term (Lambert)
    float NdotL = max(dot(N, L), 0.0);
    vec3 diffuse = baseColor * lightColor * NdotL;

    // 3. Specular Term (Blinn-Phong)
    float NdotH = max(dot(N, H), 0.0);
    
    // Modified curve for "Realistic Polished" look by default.
    // Starts at 20.0 (Medium Polish) when smoothness is 0.0.
    // Ranges up to ~1280.0 (Mirror-like) when smoothness is 1.0.
    float shininess = 20.0 * exp2(6.0 * smoothness);
    
    // Mask specular on shadowed faces (NdotL > 0) to prevent light bleeding on the dark side,
    // ensuring the base color (e.g. Black) remains dominant in non-lit areas.
    float specMask = step(0.0, NdotL); 
    float specTerm = pow(NdotH, shininess) * specMask;
    
    // Direct Additive Specular
    vec3 specular = specularColor * lightColor * specTerm;

    // 4. Ambient (Balanced for consistent look across editor)
    float sky = max(dot(N, vec3(0.0, 1.0, 0.0)), 0.0) * 0.2;
    float ground = max(dot(N, vec3(0.0, -1.0, 0.0)), 0.0) * 0.1;
    vec3 ambient = baseColor * (sky + ground + 0.05);

    // 5. Combine
    return (ambient + diffuse + specular) * occlusion;
}
`;

const UNIFORMS = `
  uniform float u_time;
  uniform vec3 u_cameraPosition;
  uniform vec4 u_viewPort; // x,y,width,height
  uniform vec3 u_boundsMin;
  uniform vec3 u_boundsMax;
  
  uniform float u_cameraNear;
  uniform float u_cameraFar;
  
  uniform mat4 u_model;
  uniform mat4 u_view;
  uniform mat4 u_projection;
  uniform mat4 u_model_inv;
  uniform mat4 u_view_inv;
  uniform int u_previewMode; // 0 = 2D (Unlit), 1 = 3D (Lit)
`;

const VARYINGS = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying vec4 vColor;
  varying vec3 vObjectPosition;
  varying vec3 vObjectNormal;
  varying vec3 vObjectTangent;
`;

const ATTRIBUTES = `
  attribute vec3 position;
  attribute vec3 normal;
  attribute vec2 uv;
  attribute vec4 tangent;
  attribute vec4 color;
`;

// Helper to convert TypeScript values to GLSL strings
const toGLSL = (val: any, type: SocketType, mode: 'fragment' | 'vertex' = 'fragment'): string => {
    // Handle UV enums
    if (val === 'UV0') {
        // In Vertex shader, we must use the attribute 'uv'. 
        // In Fragment shader, we must use the varying 'vUv'.
        return mode === 'vertex' ? 'uv' : 'vUv';
    }

    // Handle Scalar Broadcasting first (Critical for math nodes receiving scalar inputs)
    if (typeof val === 'number' || (typeof val === 'string' && !val.startsWith('#') && !val.includes(',') && !isNaN(parseFloat(val)))) {
        const f = Number(val);
        const s = f.toFixed(5);
        if (type === 'float') return s;
        if (type === 'vec2') return `vec2(${s}, ${s})`;
        if (type === 'vec3') return `vec3(${s}, ${s}, ${s})`;
        if (type === 'vec4') return `vec4(${s}, ${s}, ${s}, ${s})`;
    }

    if (type === 'float') return Number(val || 0).toFixed(5);
    if (type === 'vec2') return `vec2(${Number(val?.x || 0).toFixed(5)}, ${Number(val?.y || 0).toFixed(5)})`;
    if (type === 'vec3') {
        if (typeof val === 'string' && val.startsWith('#')) {
            // Hex color
            const r = parseInt(val.substr(1, 2), 16) / 255;
            const g = parseInt(val.substr(3, 2), 16) / 255;
            const b = parseInt(val.substr(5, 2), 16) / 255;
            return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
        }
        return `vec3(${Number(val?.x || 0).toFixed(5)}, ${Number(val?.y || 0).toFixed(5)}, ${Number(val?.z || 0).toFixed(5)})`;
    }
    if (type === 'vec4') return `vec4(${Number(val?.x || 0).toFixed(5)}, ${Number(val?.y || 0).toFixed(5)}, ${Number(val?.z || 0).toFixed(5)}, ${Number(val?.w || 0).toFixed(5)})`;
    return '0.0';
};

// Automatic Casting Logic
const castTo = (varName: string, from: string, to: string): string => {
    if (!varName) return '0.0';
    if (from === to) return varName;

    // Treat 'color' as 'vec3' for logic purposes or handle specific casting
    const f = from === 'color' ? 'vec3' : from;
    const t = to === 'color' ? 'vec3' : to;

    if (f === t) return varName;

    if (t === 'float') {
        if (f === 'vec2' || f === 'vec3' || f === 'vec4') return `${varName}.x`;
    }
    if (t === 'vec2') {
        if (f === 'float') return `vec2(${varName})`;
        if (f === 'vec3' || f === 'vec4') return `${varName}.xy`;
    }
    if (t === 'vec3') {
        if (f === 'float') return `vec3(${varName})`;
        if (f === 'vec2') return `vec3(${varName}, 0.0)`;
        if (f === 'vec4') return `${varName}.xyz`;
    }
    if (t === 'vec4') {
        if (f === 'float') return `vec4(${varName})`;
        if (f === 'vec2') return `vec4(${varName}, 0.0, 1.0)`;
        if (f === 'vec3') return `vec4(${varName}, 1.0)`;
    }

    // Matrices (Simplified fallback)
    if (t === 'mat3' && f === 'mat4') return `mat3(${varName})`;
    if (t === 'mat4' && f === 'mat3') return `mat4(${varName})`;

    // Safe component extraction when casting Matrix/Vector to a different Vector dimension
    if ((t === 'vec3' || t === 'color') && f.startsWith('mat')) return `(${varName}[0])`;
    if (t === 'vec4' && f.startsWith('mat')) return `vec4(${varName}[0], 1.0)`;
    if (f === 'vec4' && (t === 'mat3' || t === 'vec3' || t === 'color')) return `${varName}.xyz`;

    return varName; // Fallback
};

// Topological Sort to ensure nodes are defined before use
const sortNodes = (nodes: ShaderNode[], connections: Connection[], targetNodeId?: string): ShaderNode[] => {
    const visited = new Set<string>();
    const sorted: ShaderNode[] = [];
    const processing = new Set<string>();

    const visit = (nodeId: string) => {
        if (visited.has(nodeId)) return;
        if (processing.has(nodeId)) {
            // Cycle detected, stop branch
            return;
        }

        processing.add(nodeId);

        // Find inputs
        const inputConns = connections.filter(c => c.targetNodeId === nodeId);
        for (const conn of inputConns) {
            visit(conn.sourceNodeId);
        }

        processing.delete(nodeId);
        visited.add(nodeId);
        const n = nodes.find(n => n.id === nodeId);
        if (n) sorted.push(n);
    };

    if (targetNodeId) {
        // Only visit nodes needed by the target (Tree Shaking)
        visit(targetNodeId);
    } else {
        // Visit all output nodes first
        const masters = nodes.filter(n => n.type === 'output' || n.type === 'vertex');
        masters.forEach(m => visit(m.id));
        // If we have disconnected islands not leading to output, visit them too (mostly for preview generation)
        nodes.forEach(n => {
            if (!visited.has(n.id)) visit(n.id);
        });
    }

    return sorted;
};

interface VariableDef {
    name: string;
    type: SocketType;
}

const processGraph = (nodes: ShaderNode[], connections: Connection[], targetNodeId: string | undefined, mode: 'fragment' | 'vertex'): string => {

    // DETERMINE ROOT FOR SORTING (TREE SHAKING)
    let sortRootId = targetNodeId;

    if (!sortRootId) {
        if (mode === 'vertex') {
            sortRootId = nodes.find(n => n.type === 'vertex')?.id;
        } else {
            sortRootId = nodes.find(n => n.type === 'output')?.id;
        }
    }

    const skipProcessing = !targetNodeId && mode === 'vertex' && !sortRootId;
    const sorted = skipProcessing ? [] : sortNodes(nodes, connections, sortRootId);

    const variables: Record<string, VariableDef> = {};
    const body: string[] = [];
    const uniforms = new Set<string>();
    const functions = new Set<string>();

    const varName = (id: string, socket?: string) => `v_${id.replace(/-/g, '_')}_${socket || 'out'}`;

    // Helper to get input variable name with AUTOMATIC CASTING
    const getInput = (nodeId: string, socketId: string, defaultVal: string, type: SocketType): string => {
        // 1. Check Connection
        const conn = connections.find(c => c.targetNodeId === nodeId && c.targetSocketId === socketId);
        if (conn) {
            const sourceVar = variables[`${conn.sourceNodeId}_${conn.sourceSocketId}`];
            if (sourceVar) {
                return castTo(sourceVar.name, sourceVar.type, type);
            }
        }

        // 2. Check Inline Value in Node Data
        const node = nodes.find(n => n.id === nodeId);
        if (node && node.data.inputValues && node.data.inputValues[socketId] !== undefined) {
            return toGLSL(node.data.inputValues[socketId], type, mode);
        }

        // 3. Fallback to node-specific defaults (Slider, Color) if not strictly an input socket but a value container
        if (node && (node.type === 'float' || node.type === 'color' || node.type === 'slider')) {
            return toGLSL(node.data.value, type, mode);
        }

        return defaultVal;
    };

    const getTextureUniformName = (nodeId: string): string => {
        const conn = connections.find(c => c.targetNodeId === nodeId && c.targetSocketId === 'texture');
        const sourceId = conn ? conn.sourceNodeId : nodeId;
        return `u_tex_${sourceId.replace(/[-.]/g, '_')}`;
    };

    const getTextureDimUniformName = (nodeId: string): string => {
        const conn = connections.find(c => c.targetNodeId === nodeId && c.targetSocketId === 'texture');
        const sourceId = conn ? conn.sourceNodeId : nodeId;
        return `u_texDim_${sourceId.replace(/[-.]/g, '_')}`;
    };

    // Helper to determine dynamic type for Math Nodes based on connections
    const getDynamicType = (nodeId: string, inputs: string[]): SocketType => {
        let maxVecRank = 0;
        let maxMatRank = 0;

        inputs.forEach(socketId => {
            const conn = connections.find(c => c.targetNodeId === nodeId && c.targetSocketId === socketId);
            if (conn) {
                const srcType = variables[`${conn.sourceNodeId}_${conn.sourceSocketId}`]?.type;
                if (srcType === 'vec4') maxVecRank = Math.max(maxVecRank, 3);
                else if (srcType === 'vec3' || srcType === 'color') maxVecRank = Math.max(maxVecRank, 2);
                else if (srcType === 'vec2') maxVecRank = Math.max(maxVecRank, 1);
                else if (srcType === 'mat4') maxMatRank = Math.max(maxMatRank, 3);
                else if (srcType === 'mat3') maxMatRank = Math.max(maxMatRank, 2);
                else if (srcType === 'mat2') maxMatRank = Math.max(maxMatRank, 1);
            }
        });

        // Vectors take precedence in math node output typing (e.g. vec4 * mat4 -> vec4)
        if (maxVecRank > 0) {
            if (maxVecRank === 3) return 'vec4';
            if (maxVecRank === 2) return 'vec3';
            return 'vec2';
        }

        // Only return matrix type if NO vectors are involved (e.g. mat3 * mat3 -> mat3)
        if (maxMatRank > 0) {
            if (maxMatRank === 3) return 'mat4';
            if (maxMatRank === 2) return 'mat3';
            return 'mat2';
        }

        return 'float'; // Default if only floats or disconnected
    };

    for (const node of sorted) {
        const id = node.id;

        try {
            const nodeModule = getNodeModule(node.type);
            const handledByModule = nodeModule?.glsl?.emit?.({
                id,
                node,
                nodes,
                connections,
                mode,
                body,
                uniforms,
                functions,
                variables,
                getInput,
                getDynamicType: (inputSocketIds: string[]) => getDynamicType(id, inputSocketIds),
                getTextureUniformName,
                getTextureDimUniformName,
                varName,
                castTo,
                toGLSL,
            });

            if (handledByModule) {
                continue;
            }

            // Modules are now the single source of truth for GLSL emission.
            // Keep a minimal fallback to avoid breaking compilation if a node isn't handled.
            if (!variables[`${id}_out`] && !variables[`${id}_rgba`]) {
                const v = varName(id);
                body.push(`float ${v} = 0.0; // Unhandled: ${node.type}`);
                variables[`${id}_out`] = { name: v, type: 'float' };
            }
        } catch (e) {
            // Ignore
        }
    }

    let finalAssignment = '';

    if (targetNodeId) {
        const node = nodes.find(n => n.id === targetNodeId);
        if (node) {
            let resultVar = 'vec3(1.0, 0.0, 1.0)';

            const varDef = variables[`${targetNodeId}_out`] || variables[`${targetNodeId}_rgba`] || variables[`${targetNodeId}_rgb`] || variables[`${targetNodeId}_r`];
            const resultType = varDef?.type || 'vec3';

            if (varDef) {
                // Cast the found variable to vec3 for display
                if (resultType === 'vec4') {
                    resultVar = castTo(varDef.name, 'vec4', 'vec3');
                } else if (resultType === 'float') {
                    resultVar = `vec3(${varDef.name})`;
                } else if (resultType.startsWith('mat')) {
                    // Extract first component for previewing matrices
                    resultVar = castTo(varDef.name, resultType, 'vec3');
                } else {
                    resultVar = varDef.name; // Already vec3 or color
                }
            }

            // Detection of Vector types vs Color/Scalar for previewing.
            // - Data vectors (normals/positions/etc) use an unlit remap [-1,1] -> [0,1]
            // - Colors use the lit preview path.
            const isColorVar = varDef?.name.includes('rgba') || varDef?.name.includes('rgb') || resultType === 'color';
            const treatVecAsColor = (resultType === 'vec3' || resultType === 'vec4') && !isVectorPreviewNodeType(node.type);
            const isColorPreview = isColorVar || treatVecAsColor;
            const isVectorPreview = resultType.startsWith('vec') && !isColorPreview;

            // Debugging aid: enable in DevTools with `window.__LUMINA_DEBUG_PREVIEW = true`
            // Logs how the preview path was chosen (vector remap vs lit color).
            try {
                if ((globalThis as any).__LUMINA_DEBUG_PREVIEW) {
                    // eslint-disable-next-line no-console
                    console.debug('[Lumina][PreviewClassify]', {
                        targetNodeId,
                        nodeType: node.type,
                        resultType,
                        varName: varDef?.name,
                        isColorVar,
                        treatVecAsColor,
                        isColorPreview,
                        isVectorPreview,
                    });
                }
            } catch {
                // ignore
            }

            if (isVectorPreview) {
                // Vectors (Normals, Positions, etc) show raw remapped data [0,1]
                finalAssignment = `gl_FragColor = vec4(${resultVar} * 0.5 + 0.5, 1.0);`;
            } else {
                // Colors and Scalars: Use Master Lighting Model for visibility
                functions.add(LIGHTING_FUNCTIONS);
                body.push(`vec3 viewDir = normalize(u_cameraPosition - vPosition);`);
                body.push(`vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));`);
                body.push(`vec3 lightColor = vec3(1.0, 0.98, 0.95);`);

                // For node previews, we always use the geometry normal (vNormal) 
                // to show how the "color" looks on a 3D surface.
                // Keep node previews faithful to the underlying value: avoid adding a hard-coded
                // specular highlight (which can tint saturated colors and look "washed out").
                body.push(`vec3 litPreview = applyLighting(${resultVar}, vNormal, viewDir, lightDir, lightColor, vec3(0.0), 0.5, 1.0);`);

                // If u_previewMode is 0 (2D), use raw unlit result. If 1 (3D), use lit preview.
                body.push(`vec3 litPreviewGamma = pow(max(litPreview, 0.0), vec3(0.4545));`);
                body.push(`gl_FragColor = u_previewMode == 1 ? vec4(litPreviewGamma, 1.0) : vec4(${resultVar}, 1.0);`);
            }
        }
    } else if (mode === 'fragment') {
        const master = nodes.find(n => n.type === 'output');
        if (master) {
            functions.add(LIGHTING_FUNCTIONS);

            const color = getInput(master.id, 'color', 'vec3(0.5)', 'vec3');
            const alpha = getInput(master.id, 'alpha', '1.0', 'float');
            let normal = getInput(master.id, 'normal', 'vNormal', 'vec3');
            // Fix: Prevent (0,0,0) normal from UI defaults causing NaNs
            if (normal === 'vec3(0.00000, 0.00000, 0.00000)') normal = 'vNormal';

            const smoothness = getInput(master.id, 'smoothness', '0.5', 'float');
            const emission = getInput(master.id, 'emission', 'vec3(0.0)', 'vec3');
            const occlusion = getInput(master.id, 'occlusion', '1.0', 'float');
            const specular = getInput(master.id, 'specular', 'vec3(0.0)', 'vec3');
            const alphaClip = getInput(master.id, 'alphaClip', '0.0', 'float');

            body.push(`if (${alpha} < ${alphaClip}) discard;`);

            body.push(`vec3 viewDir = normalize(u_cameraPosition - vPosition);`);
            body.push(`vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));`);
            body.push(`vec3 lightColor = vec3(1.0, 0.98, 0.95);`);

            body.push(`vec3 lighting = applyLighting(${color}, ${normal}, viewDir, lightDir, lightColor, ${specular}, ${smoothness}, ${occlusion});`);

            // Apply Adaptive Gamma Correction to Final Output (matches node previews)
            body.push(`
                vec3 _finalLighting = max(lighting + ${emission}, 0.0);
                float _finalLuma = dot(_finalLighting, vec3(0.3333));
                vec3 _finalGamma = pow(_finalLighting, vec3(0.4545));
                vec3 finalColor = mix(_finalGamma, _finalLighting, smoothstep(0.0, 0.5, _finalLuma));
                gl_FragColor = vec4(finalColor, ${alpha});
            `.trim());
        } else {
            finalAssignment = `gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);`;
        }
    } else {
        const master = nodes.find(n => n.type === 'vertex');
        if (master) {
            // Robust check for connections
            const hasInput = (socketId: string) => connections.some(c => c.targetNodeId === master.id && c.targetSocketId === socketId);

            let pos = 'position';
            if (hasInput('position')) {
                pos = getInput(master.id, 'position', 'position', 'vec3');
            } else {
                const val = master.data.inputValues?.['position'];
                if (val && (val.x !== 0 || val.y !== 0 || val.z !== 0)) pos = toGLSL(val, 'vec3', mode);
            }

            let normal = 'normal';
            if (hasInput('normal')) {
                normal = getInput(master.id, 'normal', 'normal', 'vec3');
            } else {
                const val = master.data.inputValues?.['normal'];
                if (val && (val.x !== 0 || val.y !== 0 || val.z !== 0)) normal = toGLSL(val, 'vec3', mode);
            }

            let tangent = 'tangent.xyz';
            if (hasInput('tangent')) {
                tangent = getInput(master.id, 'tangent', 'tangent.xyz', 'vec3');
            } else {
                const val = master.data.inputValues?.['tangent'];
                if (val && (val.x !== 0 || val.y !== 0 || val.z !== 0)) tangent = toGLSL(val, 'vec3', mode);
            }

            finalAssignment += `vUv = uv;\n`;
            finalAssignment += `vColor = color;\n`;
            finalAssignment += `vec4 worldPos = u_model * vec4(${pos}, 1.0);\n`;
            finalAssignment += `vPosition = worldPos.xyz;\n`;
            finalAssignment += `vObjectPosition = ${pos};\n`;
            finalAssignment += `mat3 normalMatrix = mat3(u_model);\n`;
            finalAssignment += `vNormal = normalize(normalMatrix * ${normal});\n`;
            finalAssignment += `vTangent = normalize(normalMatrix * ${tangent});\n`;
            finalAssignment += `vBitangent = normalize(cross(vNormal, vTangent) * tangent.w);\n`;
            finalAssignment += `vObjectNormal = ${normal};\n`;
            finalAssignment += `vObjectTangent = ${tangent};\n`;
            finalAssignment += `gl_Position = u_projection * u_view * worldPos;\n`;
        } else {
            // Default Vertex Shader if no Master Node exists, to avoid crashing
            finalAssignment += `
             vUv = uv;
             vColor = color;
             vec4 worldPos = u_model * vec4(position, 1.0);
             vPosition = worldPos.xyz;
             vObjectPosition = position;
             vNormal = normalize(mat3(u_model) * normal);
             vTangent = normalize(mat3(u_model) * tangent.xyz);
             vBitangent = normalize(cross(vNormal, vTangent) * tangent.w);
             vObjectNormal = normal;
             vObjectTangent = tangent.xyz;\n`; // Fixed missing semicolon
        }
    }

    // Combine components
    const extensions = getRequiredExtensions(nodes, mode);

    return `
${extensions}
${COMMON_HEADER}
${mode === 'vertex' ? ATTRIBUTES : ''}
${VARYINGS}
${UNIFORMS}
${Array.from(uniforms).join('\n')}

${mode === 'fragment' ? COLOR_FUNCTIONS : ''}
${Array.from(functions).join('\n')}

void main() {
${body.join('\n')}
${finalAssignment}
}
  `.trim();
};

export const generateGLSL = (nodes: ShaderNode[], connections: Connection[], targetNodeId: string): string => {
    return processGraph(nodes, connections, targetNodeId, 'fragment');
};

export const generateFragmentShader = (nodes: ShaderNode[], connections: Connection[]): string => {
    return processGraph(nodes, connections, undefined, 'fragment');
};

export const generateVertexShader = (nodes: ShaderNode[], connections: Connection[]): string => {
    return processGraph(nodes, connections, undefined, 'vertex');
};