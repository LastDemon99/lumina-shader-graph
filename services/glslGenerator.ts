import { ShaderNode, Connection, NodeType, SocketType, GradientStop } from '../types';

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

    // 4. Ambient
    vec3 ambient = baseColor * 0.03;

    // 5. Combine (Additive)
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
          const r = parseInt(val.substr(1,2), 16) / 255;
          const g = parseInt(val.substr(3,2), 16) / 255;
          const b = parseInt(val.substr(5,2), 16) / 255;
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
    type: string;
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
      let highestRank = 0; // 0=float, 1=vec2, 2=vec3, 3=vec4
      
      inputs.forEach(socketId => {
          const conn = connections.find(c => c.targetNodeId === nodeId && c.targetSocketId === socketId);
          if (conn) {
              const srcType = variables[`${conn.sourceNodeId}_${conn.sourceSocketId}`]?.type;
              if (srcType === 'vec4') highestRank = Math.max(highestRank, 3);
              else if (srcType === 'vec3' || srcType === 'color') highestRank = Math.max(highestRank, 2);
              else if (srcType === 'vec2') highestRank = Math.max(highestRank, 1);
          }
      });

      if (highestRank === 3) return 'vec4';
      if (highestRank === 2) return 'vec3';
      if (highestRank === 1) return 'vec2';
      return 'float'; // Default if only floats or disconnected
  };

  for (const node of sorted) {
      const id = node.id;
      
      try {
        switch (node.type) {
            case 'remap': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const inMM = getInput(id, 'inMinMax', 'vec2(-1.0, 1.0)', 'vec2');
                const outMM = getInput(id, 'outMinMax', 'vec2(0.0, 1.0)', 'vec2');
                const v = varName(id);
                body.push(`vec3 ${v}_t = (${i} - ${inMM}.x) / (${inMM}.y - ${inMM}.x + 0.00001);`);
                body.push(`vec3 ${v} = mix(vec3(${outMM}.x), vec3(${outMM}.y), ${v}_t);`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'transform': {
                const input = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const from = node.data.transformSpaceFrom || 'Object';
                const to = node.data.transformSpaceTo || 'World';
                const type = node.data.transformType || 'Position';
                const v = varName(id);
                
                if (from === 'Tangent' || to === 'Tangent') {
                    if (mode === 'vertex') {
                        // Calculate TBN using Attributes + Model Matrix
                        // Note: Tangent is vec4 in attributes
                        body.push(`vec3 ${v}_rawN = normalize(mat3(u_model) * normal);`);
                        body.push(`vec3 ${v}_rawT = normalize(mat3(u_model) * tangent.xyz);`);
                        body.push(`vec3 ${v}_rawB = normalize(cross(${v}_rawN, ${v}_rawT) * tangent.w);`);
                        body.push(`mat3 ${v}_TBN = mat3(${v}_rawT, ${v}_rawB, ${v}_rawN);`);
                    } else {
                        // Use Varyings in Fragment Shader
                        body.push(`vec3 ${v}_N = normalize(vNormal);`);
                        body.push(`vec3 ${v}_T = normalize(vTangent);`);
                        body.push(`vec3 ${v}_B = normalize(vBitangent);`);
                        body.push(`mat3 ${v}_TBN = mat3(${v}_T, ${v}_B, ${v}_N);`);
                    }
                }

                let currentPos = input;
                
                if (from === 'Object') {
                    if (type === 'Position') currentPos = `(u_model * vec4(${currentPos}, 1.0)).xyz`;
                    else currentPos = `mat3(u_model) * ${currentPos}`;
                } else if (from === 'View') {
                    if (type === 'Position') currentPos = `(u_view_inv * vec4(${currentPos}, 1.0)).xyz`;
                    else currentPos = `mat3(u_view_inv) * ${currentPos}`;
                } else if (from === 'Tangent') {
                    if (type !== 'Position') {
                        currentPos = `${v}_TBN * ${currentPos}`;
                    }
                }
                
                if (to === 'Object') {
                    if (type === 'Position') currentPos = `(u_model_inv * vec4(${currentPos}, 1.0)).xyz`;
                    else currentPos = `mat3(u_model_inv) * ${currentPos}`;
                } else if (to === 'View') {
                    if (type === 'Position') currentPos = `(u_view * vec4(${currentPos}, 1.0)).xyz`;
                    else currentPos = `mat3(u_view) * ${currentPos}`;
                } else if (to === 'Tangent') {
                     if (type !== 'Position') {
                        currentPos = `${currentPos} * ${v}_TBN`;
                     }
                }
                
                body.push(`vec3 ${v} = ${currentPos};`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'texture': {
                const texUniform = getTextureUniformName(id);
                uniforms.add(`uniform sampler2D ${texUniform};`);
                
                // Correct default UV based on mode
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const v = varName(id);
                
                if (mode === 'vertex') {
                    // Safe Vertex Texture Fetch with strict checks
                    body.push(`#ifdef GL_EXT_shader_texture_lod`);
                    // Ensure UV is cast to vec2 explicitly to avoid overloading ambiguity
                    body.push(`  vec4 ${v} = texture2DLodEXT(${texUniform}, vec2(${uv}), 0.0);`);
                    body.push(`#else`);
                    body.push(`  vec4 ${v} = vec4(0.0);`);
                    body.push(`#endif`);
                } else {
                    body.push(`vec4 ${v} = texture2D(${texUniform}, ${uv});`);
                }
                
                if (node.data.textureType === 'Normal') {
                    body.push(`${v}.rgb = ${v}.rgb * 2.0 - 1.0;`);
                }
                
                variables[`${id}_rgba`] = { name: v, type: 'vec4' };
                variables[`${id}_r`] = { name: `${v}.r`, type: 'float' };
                variables[`${id}_g`] = { name: `${v}.g`, type: 'float' };
                variables[`${id}_b`] = { name: `${v}.b`, type: 'float' };
                variables[`${id}_a`] = { name: `${v}.a`, type: 'float' };
                break;
            }
            case 'sampleTexture2DLOD': {
                const texUniform = getTextureUniformName(id);
                uniforms.add(`uniform sampler2D ${texUniform};`);
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const lod = getInput(id, 'lod', '0.0', 'float');
                const v = varName(id);
                
                body.push(`#ifdef GL_EXT_shader_texture_lod`);
                body.push(`  vec4 ${v} = texture2DLodEXT(${texUniform}, vec2(${uv}), ${lod});`);
                body.push(`#else`);
                body.push(`  vec4 ${v} = vec4(0.0);`);
                body.push(`#endif`);
                
                variables[`${id}_rgba`] = { name: v, type: 'vec4' };
                break;
            }
            case 'metalReflectance': {
                const metal = node.data.metalType || 'Iron';
                const v = varName(id);
                let val = 'vec3(0.56, 0.57, 0.58)'; // Iron default
                
                switch (metal) {
                    case 'Iron': val = 'vec3(0.560, 0.570, 0.580)'; break;
                    case 'Silver': val = 'vec3(0.972, 0.960, 0.915)'; break;
                    case 'Aluminium': val = 'vec3(0.913, 0.922, 0.924)'; break;
                    case 'Gold': val = 'vec3(1.000, 0.766, 0.336)'; break;
                    case 'Copper': val = 'vec3(0.955, 0.638, 0.538)'; break;
                    case 'Chromium': val = 'vec3(0.549, 0.556, 0.554)'; break;
                    case 'Nickel': val = 'vec3(0.660, 0.609, 0.526)'; break;
                    case 'Titanium': val = 'vec3(0.542, 0.497, 0.449)'; break;
                    case 'Cobalt': val = 'vec3(0.662, 0.655, 0.634)'; break;
                    case 'Platinum': val = 'vec3(0.673, 0.637, 0.585)'; break;
                }
                
                body.push(`vec3 ${v} = ${val};`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'dielectricSpecular': {
                 const dielectricMode = node.data.dielectricMaterial || 'Common';
                 const v = varName(id);
                 if (dielectricMode === 'Common') {
                     const range = getInput(id, 'range', '0.5', 'float');
                     body.push(`float ${v} = ${range} * 0.08;`);
                 } else if (dielectricMode === 'Custom') {
                     const ior = getInput(id, 'ior', '1.5', 'float');
                     body.push(`float ${v}_num = (${ior} - 1.0);`);
                     body.push(`float ${v}_den = (${ior} + 1.0);`);
                     body.push(`float ${v} = pow(${v}_num / (${v}_den + 0.0001), 2.0);`);
                 } else {
                     let f0 = 0.04;
                     if (dielectricMode === 'Water') f0 = 0.02; 
                     if (dielectricMode === 'Ice') f0 = 0.018; 
                     if (dielectricMode === 'Glass') f0 = 0.04; 
                     if (dielectricMode === 'RustedMetal') f0 = 0.03; 
                     body.push(`float ${v} = ${f0.toFixed(4)};`);
                 }
                 variables[`${id}_out`] = { name: v, type: 'float' };
                 break;
            }
            case 'screenPosition': {
                const positionMode = node.data.screenPositionMode || 'Default';
                const v = varName(id);
                if (mode === 'vertex') {
                     body.push(`vec4 ${v} = vec4(0.0); // Unavailable in Vertex Shader`);
                } else {
                    if (positionMode === 'Default') {
                        body.push(`vec4 ${v} = vec4((gl_FragCoord.xy - u_viewPort.xy) / u_viewPort.zw, 0.0, 1.0);`);
                    } else if (positionMode === 'Raw') {
                        body.push(`vec4 ${v} = gl_FragCoord;`);
                    } else if (positionMode === 'Center') {
                        body.push(`vec4 ${v} = vec4(((gl_FragCoord.xy - u_viewPort.xy) / u_viewPort.zw) * 2.0 - 1.0, 0.0, 1.0);`);
                    } else if (positionMode === 'Tiled') {
                        body.push(`vec4 ${v} = vec4((gl_FragCoord.xy - u_viewPort.xy) / u_viewPort.w, 0.0, 1.0);`);
                    } else if (positionMode === 'Pixel') {
                        body.push(`vec4 ${v} = vec4(gl_FragCoord.xy - u_viewPort.xy, 0.0, 1.0);`);
                    }
                }
                variables[`${id}_out`] = { name: v, type: 'vec4' };
                break;
            }
            case 'sceneDepth': {
                const depthMode = node.data.sceneDepthMode || 'Linear01';
                const v = varName(id);
                if (mode === 'vertex') {
                     body.push(`float ${v} = 0.0; // Unavailable in Vertex Shader`);
                } else {
                    if (depthMode === 'Raw') {
                        body.push(`float ${v} = gl_FragCoord.z;`);
                    } else {
                        body.push(`float ${v}_z_ndc = 2.0 * gl_FragCoord.z - 1.0;`);
                        body.push(`float ${v}_linear = (2.0 * u_cameraNear * u_cameraFar) / (u_cameraFar + u_cameraNear - ${v}_z_ndc * (u_cameraFar - u_cameraNear));`);
                        
                        if (depthMode === 'Eye') {
                            body.push(`float ${v} = ${v}_linear;`);
                        } else {
                            body.push(`float ${v} = ${v}_linear / u_cameraFar;`);
                        }
                    }
                }
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'sceneDepthDifference': {
                const modeStr = node.data.sceneDepthMode || 'Linear01';
                const v = varName(id);
                const uv = getInput(id, 'uv', 'vec4(gl_FragCoord.xy / u_viewPort.zw, 0.0, 1.0)', 'vec4');
                const pos = getInput(id, 'position', 'vPosition', 'vec3');
                if (mode === 'vertex') {
                     body.push(`float ${v} = 0.0;`);
                } else {
                     body.push(`vec4 ${v}_viewPos = u_view * vec4(${pos}, 1.0);`);
                     body.push(`float ${v}_surfEye = -${v}_viewPos.z;`);
                     body.push(`float ${v}_sceneEye = u_cameraFar;`); 
                     body.push(`float ${v}_diff = max(0.0, ${v}_sceneEye - ${v}_surfEye);`);
                     if (modeStr === 'Linear01') {
                         body.push(`float ${v} = ${v}_diff / u_cameraFar;`);
                     } else if (modeStr === 'Raw') {
                         body.push(`float ${v} = ${v}_diff * 0.01;`);
                     } else {
                         body.push(`float ${v} = ${v}_diff;`);
                     }
                }
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'float':
            case 'slider': {
                const v = varName(id);
                const val = Number(node.data.value ?? 0).toFixed(5);
                body.push(`float ${v} = ${val};`);
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'color': {
                const v = varName(id);
                const hex = (node.data.value || '#ffffff') as string;
                const r = parseInt(hex.substr(1,2), 16) / 255;
                const g = parseInt(hex.substr(3,2), 16) / 255;
                const b = parseInt(hex.substr(5,2), 16) / 255;
                body.push(`vec3 ${v} = vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)});`);
                variables[`${id}_rgb`] = { name: v, type: 'vec3' };
                break;
            }
            case 'vector2': {
                const v = varName(id);
                const x = getInput(id, 'x', '0.0', 'float');
                const y = getInput(id, 'y', '0.0', 'float');
                body.push(`vec2 ${v} = vec2(${x}, ${y});`);
                variables[`${id}_out`] = { name: v, type: 'vec2' };
                break;
            }
            case 'vector3': {
                const v = varName(id);
                const x = getInput(id, 'x', '0.0', 'float');
                const y = getInput(id, 'y', '0.0', 'float');
                const z = getInput(id, 'z', '0.0', 'float');
                body.push(`vec3 ${v} = vec3(${x}, ${y}, ${z});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'vector4': {
                const v = varName(id);
                const x = getInput(id, 'x', '0.0', 'float');
                const y = getInput(id, 'y', '0.0', 'float');
                const z = getInput(id, 'z', '0.0', 'float');
                const w = getInput(id, 'w', '0.0', 'float');
                body.push(`vec4 ${v} = vec4(${x}, ${y}, ${z}, ${w});`);
                variables[`${id}_out`] = { name: v, type: 'vec4' };
                break;
            }
            case 'uv': {
                const v = varName(id);
                const source = mode === 'vertex' ? 'uv' : 'vUv';
                body.push(`vec4 ${v} = vec4(${source}, 0.0, 1.0);`);
                variables[`${id}_out`] = { name: v, type: 'vec4' };
                break;
            }
            case 'time': {
                const v = varName(id);
                body.push(`float ${v} = u_time;`);
                body.push(`float ${v}_sin = sin(u_time);`);
                body.push(`float ${v}_cos = cos(u_time);`);
                variables[`${id}_out`] = { name: v, type: 'float' };
                variables[`${id}_sineTime`] = { name: `${v}_sin`, type: 'float' };
                variables[`${id}_cosineTime`] = { name: `${v}_cos`, type: 'float' };
                break;
            }
            case 'add': {
                const type = getDynamicType(id, ['a', 'b']);
                const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
                const a = getInput(id, 'a', zero, type);
                const b = getInput(id, 'b', zero, type);
                const v = varName(id);
                body.push(`${type} ${v} = ${a} + ${b};`); 
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'subtract': {
                const type = getDynamicType(id, ['a', 'b']);
                const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
                const a = getInput(id, 'a', zero, type);
                const b = getInput(id, 'b', zero, type);
                const v = varName(id);
                body.push(`${type} ${v} = ${a} - ${b};`);
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'multiply': {
                const type = getDynamicType(id, ['a', 'b']);
                const one = type === 'float' ? '1.0' : `${type}(1.0)`;
                const a = getInput(id, 'a', one, type);
                const b = getInput(id, 'b', one, type);
                const v = varName(id);
                body.push(`${type} ${v} = ${a} * ${b};`);
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'divide': {
                const type = getDynamicType(id, ['a', 'b']);
                const one = type === 'float' ? '1.0' : `${type}(1.0)`;
                const epsilon = type === 'float' ? '0.00001' : `${type}(0.00001)`;
                const a = getInput(id, 'a', one, type);
                const b = getInput(id, 'b', one, type);
                const v = varName(id);
                body.push(`${type} ${v} = ${a} / (${b} + ${epsilon});`); 
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'reciprocal': {
                // User requested strictly float input
                const i = getInput(id, 'in', '1.0', 'float');
                const method = node.data.reciprocalMethod || 'Default';
                const v = varName(id);
                
                if (method === 'Fast') {
                    // Fast Reciprocal (No safety check)
                     body.push(`float ${v} = 1.0 / ${i};`);
                } else {
                    // Default Reciprocal (Safe Division)
                     body.push(`float ${v} = 1.0 / (${i} + 0.00001);`);
                }
                
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'power': {
                const type = getDynamicType(id, ['a', 'b']);
                const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
                const one = type === 'float' ? '1.0' : `${type}(1.0)`;
                const epsilon = type === 'float' ? '0.00001' : `${type}(0.00001)`;
                const a = getInput(id, 'a', zero, type);
                const b = getInput(id, 'b', one, type);
                const v = varName(id);
                body.push(`${type} ${v} = pow(max(${a}, ${epsilon}), ${b});`);
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'ceiling': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = ceil(${i});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'floor': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = floor(${i});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'round': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = floor(${i} + 0.5);`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'fraction': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = fract(${i});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'inverseLerp': {
                const a = getInput(id, 'a', '0.0', 'float');
                const b = getInput(id, 'b', '1.0', 'float');
                const t = getInput(id, 't', '0.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = vec3(clamp((${t} - ${a}) / (${b} - ${a} + 0.00001), 0.0, 1.0));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'remap': {
                 const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                 const inMM = getInput(id, 'inMinMax', 'vec2(-1.0, 1.0)', 'vec2');
                 const outMM = getInput(id, 'outMinMax', 'vec2(0.0, 1.0)', 'vec2');
                 const v = varName(id);
                 body.push(`vec3 ${v}_t = (${i} - ${inMM}.x) / (${inMM}.y - ${inMM}.x + 0.00001);`);
                 body.push(`vec3 ${v} = mix(vec3(${outMM}.x), vec3(${outMM}.y), ${v}_t);`);
                 variables[`${id}_out`] = { name: v, type: 'vec3' };
                 break;
             }
            case 'maximum': {
                const a = getInput(id, 'a', '0.0', 'float');
                const b = getInput(id, 'b', '0.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = vec3(max(${a}, ${b}));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'minimum': {
                const a = getInput(id, 'a', '0.0', 'float');
                const b = getInput(id, 'b', '0.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = vec3(min(${a}, ${b}));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'truncate': {
                const i = getInput(id, 'in', '0.0', 'float');
                const v = varName(id);
                // GLSL doesn't have trunc(), but int cast truncates towards zero
                body.push(`vec3 ${v} = vec3(float(int(${i})));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'clamp': {
                const i = getInput(id, 'in', '0.0', 'float');
                const minVal = getInput(id, 'min', '0.0', 'float');
                const maxVal = getInput(id, 'max', '1.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = vec3(clamp(${i}, ${minVal}, ${maxVal}));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'absolute': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = abs(${i});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'sine': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = sin(${i});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'cosine': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = cos(${i});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'arccosine': {
                const i = getInput(id, 'in', '0.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = vec3(acos(${i}));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'arcsine': {
                const i = getInput(id, 'in', '0.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = vec3(asin(${i}));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'arctangent': {
                const i = getInput(id, 'in', '0.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = vec3(atan(${i}));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'arctangent2': {
                const a = getInput(id, 'a', '0.0', 'float');
                const b = getInput(id, 'b', '0.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = vec3(atan(${a}, ${b}));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'length': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`float ${v} = length(${i});`);
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'distance': {
                const a = getInput(id, 'a', 'vec3(0.0)', 'vec3');
                const b = getInput(id, 'b', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`float ${v} = distance(${a}, ${b});`);
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'mix': {
                const a = getInput(id, 'a', 'vec3(0.0)', 'vec3');
                const b = getInput(id, 'b', 'vec3(1.0)', 'vec3');
                const t = getInput(id, 't', 'vec3(0.5)', 'vec3'); 
                const v = varName(id);
                body.push(`vec3 ${v} = mix(${a}, ${b}, ${t});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'rotate': {
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const center = getInput(id, 'center', 'vec2(0.5)', 'vec2');
                const rotation = getInput(id, 'rotation', '0.0', 'float');
                const v = varName(id);
                body.push(`float ${v}_c = cos(${rotation});`);
                body.push(`float ${v}_s = sin(${rotation});`);
                body.push(`mat2 ${v}_m = mat2(${v}_c, -${v}_s, ${v}_s, ${v}_c);`);
                body.push(`vec2 ${v} = ${v}_m * (${uv} - ${center}) + ${center};`);
                variables[`${id}_out`] = { name: v, type: 'vec2' };
                break;
            }
            case 'twirl': {
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const center = getInput(id, 'center', 'vec2(0.5)', 'vec2');
                const strength = getInput(id, 'strength', '10.0', 'float');
                const offset = getInput(id, 'offset', 'vec2(0.0)', 'vec2');
                const v = varName(id);
                body.push(`vec2 ${v}_delta = ${uv} - ${center} - ${offset};`);
                body.push(`float ${v}_angle = ${strength} * length(${v}_delta);`);
                body.push(`float ${v}_x = cos(${v}_angle) * ${v}_delta.x - sin(${v}_angle) * ${v}_delta.y;`);
                body.push(`float ${v}_y = sin(${v}_angle) * ${v}_delta.x + cos(${v}_angle) * ${v}_delta.y;`);
                body.push(`vec2 ${v} = vec2(${v}_x + ${center}.x + ${offset}.x, ${v}_y + ${center}.y + ${offset}.y);`);
                variables[`${id}_out`] = { name: v, type: 'vec2' };
                break;
            }
            case 'radialShear': {
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const center = getInput(id, 'center', 'vec2(0.5)', 'vec2');
                const strength = getInput(id, 'strength', 'vec2(10.0)', 'vec2');
                const offset = getInput(id, 'offset', 'vec2(0.0)', 'vec2');
                const v = varName(id);

                body.push(`vec2 ${v}_delta = ${uv} - ${center};`);
                body.push(`float ${v}_delta2 = dot(${v}_delta, ${v}_delta);`);
                body.push(`vec2 ${v}_tangential = vec2(${v}_delta.y, -${v}_delta.x);`);
                body.push(`vec2 ${v} = ${uv} + ${v}_tangential * ${v}_delta2 * ${strength} + ${offset};`);
                
                variables[`${id}_out`] = { name: v, type: 'vec2' };
                break;
            }
            case 'gradient': { break; }
            case 'sampleGradient': {
                const time = getInput(id, 'time', '0.0', 'float');
                const v = varName(id);
                const gradConn = connections.find(c => c.targetNodeId === id && c.targetSocketId === 'gradient');
                const gradNode = gradConn ? nodes.find(n => n.id === gradConn.sourceNodeId) : null;
                let stops = (gradNode?.data.gradientStops || [
                    { id: '1', t: 0, color: '#000000' }, 
                    { id: '2', t: 1, color: '#ffffff' }
                ]);
                stops = [...stops].sort((a, b) => a.t - b.t);
                const hexToVec3 = (hex: string) => {
                    const r = parseInt(hex.substr(1,2), 16) / 255;
                    const g = parseInt(hex.substr(3,2), 16) / 255;
                    const b = parseInt(hex.substr(5,2), 16) / 255;
                    return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
                };
                body.push(`vec3 ${v}_c = vec3(0.0);`);
                body.push(`float ${v}_t = clamp(${time}, 0.0, 1.0);`);
                if (stops.length === 0) {
                     body.push(`${v}_c = vec3(1.0, 0.0, 1.0);`); 
                } else if (stops.length === 1) {
                     body.push(`${v}_c = ${hexToVec3(stops[0].color)};`);
                } else {
                    body.push(`if (${v}_t <= ${stops[0].t.toFixed(5)}) {`);
                    body.push(`  ${v}_c = ${hexToVec3(stops[0].color)};`);
                    body.push(`}`);
                    for (let i = 0; i < stops.length - 1; i++) {
                        const s1 = stops[i];
                        const s2 = stops[i+1];
                        const range = Math.max(s2.t - s1.t, 0.00001); 
                        body.push(`else if (${v}_t <= ${s2.t.toFixed(5)}) {`);
                        body.push(`  float t_norm = (${v}_t - ${s1.t.toFixed(5)}) / ${range.toFixed(5)};`);
                        body.push(`  ${v}_c = mix(${hexToVec3(s1.color)}, ${hexToVec3(s2.color)}, t_norm);`);
                        body.push(`}`);
                    }
                    body.push(`else {`);
                    body.push(`  ${v}_c = ${hexToVec3(stops[stops.length-1].color)};`);
                    body.push(`}`);
                }
                body.push(`vec4 ${v} = vec4(${v}_c, 1.0);`);
                variables[`${id}_out`] = { name: v, type: 'vec4' };
                break;
            }
            case 'textureSize': {
                const texUniform = getTextureUniformName(id);
                const dimUniform = getTextureDimUniformName(id);
                uniforms.add(`uniform vec2 ${dimUniform};`);
                const v = varName(id);
                body.push(`float ${v}_w = ${dimUniform}.x;`);
                body.push(`float ${v}_h = ${dimUniform}.y;`);
                body.push(`float ${v}_tw = 1.0 / (${dimUniform}.x + 0.0001);`); 
                body.push(`float ${v}_th = 1.0 / (${dimUniform}.y + 0.0001);`);
                variables[`${id}_width`] = { name: `${v}_w`, type: 'float' };
                variables[`${id}_height`] = { name: `${v}_h`, type: 'float' };
                variables[`${id}_texelWidth`] = { name: `${v}_tw`, type: 'float' };
                variables[`${id}_texelHeight`] = { name: `${v}_th`, type: 'float' };
                break;
            }
            case 'sampleTexture2DArray': {
                const texUniform = getTextureUniformName(id);
                uniforms.add(`uniform sampler2D ${texUniform};`);
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const index = getInput(id, 'index', '0.0', 'float');
                const v = varName(id);
                const texConn = connections.find(c => c.targetNodeId === id && c.targetSocketId === 'texture');
                let layerCount = 1;
                if (texConn) {
                    const sourceNode = nodes.find(n => n.id === texConn.sourceNodeId);
                    if (sourceNode && sourceNode.data.layerCount) {
                        layerCount = Math.max(1, sourceNode.data.layerCount);
                    }
                }
                body.push(`float ${v}_idx = clamp(floor(${index}), 0.0, ${layerCount.toFixed(1)} - 1.0);`);
                body.push(`vec2 ${v}_uv = vec2(${uv}.x, (fract(${uv}.y) + ${layerCount.toFixed(1)} - 1.0 - ${v}_idx) / ${layerCount.toFixed(1)});`);
                if (mode === 'vertex') {
                     body.push(`#ifdef GL_EXT_shader_texture_lod`);
                     body.push(`  vec4 ${v} = texture2DLodEXT(${texUniform}, ${v}_uv, 0.0);`);
                     body.push(`#else`);
                     body.push(`  vec4 ${v} = vec4(0.0);`);
                     body.push(`#endif`);
                } else {
                     body.push(`vec4 ${v} = texture2D(${texUniform}, ${v}_uv);`);
                }
                variables[`${id}_rgba`] = { name: v, type: 'vec4' };
                variables[`${id}_r`] = { name: `${v}.r`, type: 'float' };
                variables[`${id}_g`] = { name: `${v}.g`, type: 'float' };
                variables[`${id}_b`] = { name: `${v}.b`, type: 'float' };
                variables[`${id}_a`] = { name: `${v}.a`, type: 'float' };
                break;
            }
            case 'calculateLevelOfDetailTexture': {
                const dimUniform = getTextureDimUniformName(id);
                uniforms.add(`uniform vec2 ${dimUniform};`);
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const v = varName(id);
                if (mode === 'vertex') {
                    body.push(`float ${v} = 0.0;`);
                } else {
                    body.push(`#ifdef GL_OES_standard_derivatives`);
                    body.push(`  vec2 ${v}_dx = dFdx(${uv} * ${dimUniform});`);
                    body.push(`  vec2 ${v}_dy = dFdy(${uv} * ${dimUniform});`);
                    body.push(`  float ${v} = log2(max(max(length(${v}_dx), length(${v}_dy)), 0.00001));`);
                    body.push(`#else`);
                    body.push(`  float ${v} = 0.0;`);
                    body.push(`#endif`);
                }
                variables[`${id}_lod`] = { name: v, type: 'float' };
                break;
            }
            case 'gatherTexture2D': {
                const texUniform = getTextureUniformName(id);
                const dimUniform = getTextureDimUniformName(id);
                uniforms.add(`uniform sampler2D ${texUniform};`);
                uniforms.add(`uniform vec2 ${dimUniform};`);
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const offset = getInput(id, 'offset', 'vec2(0.0)', 'vec2'); 
                const v = varName(id);
                body.push(`vec2 ${v}_ts = 1.0 / max(${dimUniform}, vec2(1.0));`);
                body.push(`vec2 ${v}_base = ${uv} + ${offset} * ${v}_ts;`);
                if (mode === 'vertex') {
                    body.push(`#ifdef GL_EXT_shader_texture_lod`);
                    body.push(`  float ${v}_r = texture2DLodEXT(${texUniform}, ${v}_base + vec2(-0.5, 0.5) * ${v}_ts, 0.0).r;`);
                    body.push(`  float ${v}_g = texture2DLodEXT(${texUniform}, ${v}_base + vec2(0.5, 0.5) * ${v}_ts, 0.0).r;`);
                    body.push(`  float ${v}_b = texture2DLodEXT(${texUniform}, ${v}_base + vec2(0.5, -0.5) * ${v}_ts, 0.0).r;`);
                    body.push(`  float ${v}_a = texture2DLodEXT(${texUniform}, ${v}_base + vec2(-0.5, -0.5) * ${v}_ts, 0.0).r;`);
                    body.push(`  vec4 ${v} = vec4(${v}_r, ${v}_g, ${v}_b, ${v}_a);`);
                    body.push(`#else`);
                    body.push(`  vec4 ${v} = vec4(0.0);`);
                    body.push(`#endif`);
                } else {
                    body.push(`float ${v}_r = texture2D(${texUniform}, ${v}_base + vec2(-0.5, 0.5) * ${v}_ts).r;`); 
                    body.push(`float ${v}_g = texture2D(${texUniform}, ${v}_base + vec2(0.5, 0.5) * ${v}_ts).r;`);
                    body.push(`float ${v}_b = texture2D(${texUniform}, ${v}_base + vec2(0.5, -0.5) * ${v}_ts).r;`);
                    body.push(`float ${v}_a = texture2D(${texUniform}, ${v}_base + vec2(-0.5, -0.5) * ${v}_ts).r;`);
                    body.push(`vec4 ${v} = vec4(${v}_r, ${v}_g, ${v}_b, ${v}_a);`);
                }
                variables[`${id}_rgba`] = { name: v, type: 'vec4' };
                variables[`${id}_r`] = { name: `${v}.x`, type: 'float' };
                variables[`${id}_g`] = { name: `${v}.y`, type: 'float' };
                variables[`${id}_b`] = { name: `${v}.z`, type: 'float' };
                variables[`${id}_a`] = { name: `${v}.w`, type: 'float' };
                break;
            }
            case 'flipbook': {
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const width = getInput(id, 'width', '1.0', 'float');
                const height = getInput(id, 'height', '1.0', 'float');
                const tile = getInput(id, 'tile', '0.0', 'float');
                
                const invX = node.data.invertX;
                const invY = node.data.invertY;
                
                const v = varName(id);
                
                body.push(`float ${v}_w = max(${width}, 1.0);`);
                body.push(`float ${v}_h = max(${height}, 1.0);`);
                body.push(`float ${v}_tile = floor(mod(${tile}, ${v}_w * ${v}_h));`);
                body.push(`float ${v}_r = floor(${v}_tile / ${v}_w);`);
                body.push(`float ${v}_c = ${v}_tile - ${v}_r * ${v}_w;`);
                
                if (invX) body.push(`${v}_c = (${v}_w - 1.0) - ${v}_c;`);
                if (invY) body.push(`${v}_r = (${v}_h - 1.0) - ${v}_r;`);
                
                body.push(`vec2 ${v}_scale = vec2(1.0 / ${v}_w, 1.0 / ${v}_h);`);
                body.push(`vec2 ${v}_offset = vec2(${v}_c, ${v}_r) * ${v}_scale;`);
                
                body.push(`vec2 ${v} = (${uv} * ${v}_scale) + ${v}_offset;`);
                
                variables[`${id}_out`] = { name: v, type: 'vec2' };
                break;
            }
            case 'polarCoordinates': {
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const center = getInput(id, 'center', 'vec2(0.5)', 'vec2');
                const radScale = getInput(id, 'radialScale', '1.0', 'float');
                const lenScale = getInput(id, 'lengthScale', '1.0', 'float');
                const v = varName(id);

                body.push(`vec2 ${v}_delta = ${uv} - ${center};`);
                body.push(`float ${v}_radius = length(${v}_delta) * 2.0 * ${lenScale};`);
                body.push(`float ${v}_angle = atan(${v}_delta.y, ${v}_delta.x) * 0.159154943;`); // 1 / 2PI
                // Offset angle by 0.5 to move the seam from Right (0) to Left (PI/-PI)
                // This aligns with common UV sphere mapping and manual implementations that usually start at -X
                body.push(`${v}_angle = fract((${v}_angle + 0.5) * ${radScale});`);
                body.push(`vec2 ${v} = vec2(${v}_radius, ${v}_angle);`);
                variables[`${id}_out`] = { name: v, type: 'vec2' };
                break;
            }
            case 'parallaxMapping': {
                const uv = getInput(id, 'uv', mode === 'vertex' ? 'uv' : 'vUv', 'vec2');
                const amplitude = getInput(id, 'amplitude', '1.0', 'float'); // Default 1.0 = 0.1 strength
                const texUniform = getTextureUniformName(id); // Handles the heightmap texture
                uniforms.add(`uniform sampler2D ${texUniform};`);
                
                const channel = node.data.parallaxChannel || 'g'; // Default Green
                const v = varName(id);

                if (mode === 'vertex') {
                     body.push(`vec2 ${v} = ${uv}; // Parallax only in Fragment`);
                } else {
                    body.push(`vec3 ${v}_N = normalize(vNormal);`);
                    body.push(`vec3 ${v}_T = normalize(vTangent);`);
                    body.push(`vec3 ${v}_B = normalize(vBitangent);`);
                    body.push(`mat3 ${v}_TBN = mat3(${v}_T, ${v}_B, ${v}_N);`); // Maps Tangent -> World
                    
                    body.push(`vec3 ${v}_viewDirWS = normalize(u_cameraPosition - vPosition);`);
                    
                    // Transform ViewDir from World Space to Tangent Space
                    // We treat TBN as orthogonal, so Inverse = Transpose.
                    // GLSL: vec * mat = RowVector * Matrix = Transpose(Matrix) * ColumnVector.
                    // So viewDirWS * TBN is mathematically: Transpose(TBN) * viewDirWS.
                    // This creates the correct Tangent Space View Direction.
                    body.push(`vec3 ${v}_viewDirTS = ${v}_viewDirWS * ${v}_TBN;`);
                    
                    body.push(`float ${v}_h = texture2D(${texUniform}, ${uv}).${channel};`);
                    
                    // Logic based on User Feedback and Unity Parallax:
                    // 1. Center Height: (h - 0.5) so gray is neutral.
                    // 2. Positive Amplitude should create Height (Bump).
                    //    User observation: Negative Amplitude (which created 'uv + offset') looked like Height.
                    //    Therefore, we switch to 'uv + offset' for Positive Amplitude.
                    // 3. Removed the '* 2.0' multiplier to reduce sensitivity.
                    body.push(`float ${v}_h_centered = ${v}_h - 0.5;`);
                    
                    // MODIFICATION: User requested amplitude to be remapped x/10 for better UX (integers -> decimals)
                    body.push(`vec2 ${v}_offset = ${v}_viewDirTS.xy * (${v}_h_centered * (${amplitude} * 0.1));`);
                    
                    body.push(`vec2 ${v} = ${uv} + ${v}_offset;`); 
                }
                
                variables[`${id}_out`] = { name: v, type: 'vec2' };
                break;
            }
            case 'textureAsset': { break; }
            case 'texture2DArrayAsset': { break; }
            case 'simpleNoise': {
                functions.add(`
                float random(vec2 st) {
                    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                }
                float noise(vec2 st) {
                    vec2 i = floor(st);
                    vec2 f = fract(st);
                    float a = random(i);
                    float b = random(i + vec2(1.0, 0.0));
                    float c = random(i + vec2(0.0, 1.0));
                    float d = random(i + vec2(1.0, 1.0));
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
                }`);
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const scale = getInput(id, 'scale', '10.0', 'float');
                const v = varName(id);
                body.push(`float ${v} = noise(${uv} * ${scale});`);
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'voronoi': {
                functions.add(`
                vec2 random2(vec2 p) {
                    return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
                }
                float voronoi(vec2 uv, float angleOffset, float cellDensity) {
                    vec2 g = floor(uv * cellDensity);
                    vec2 f = fract(uv * cellDensity);
                    float res = 8.0;
                    for(int y=-1; y<=1; y++) {
                        for(int x=-1; x<=1; x++) {
                            vec2 lattice = vec2(float(x),float(y));
                            vec2 offset = random2(lattice + g);
                            offset = 0.5 + 0.5*sin(angleOffset + 6.2831*offset);
                            vec2 d = lattice + offset - f;
                            float dist = length(d);
                            if(dist < res) {
                                res = dist;
                            }
                        }
                    }
                    return res;
                }`);
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const angle = getInput(id, 'angleOffset', '2.0', 'float');
                const density = getInput(id, 'cellDensity', '5.0', 'float');
                const v = varName(id);
                body.push(`float ${v} = voronoi(${uv}, ${angle}, ${density});`);
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'swizzle': {
                const i = getInput(id, 'in', 'vec4(0.0)', 'vec4');
                const mask = node.data.mask || 'xyzw';
                const v = varName(id);
                let type = 'float';
                if (mask.length === 2) type = 'vec2';
                if (mask.length === 3) type = 'vec3';
                if (mask.length === 4) type = 'vec4';
                
                body.push(`${type} ${v} = ${i}.${mask};`);
                variables[`${id}_out`] = { name: v, type };
                break;
            }
            case 'split': {
                const i = getInput(id, 'in', 'vec4(0.0)', 'vec4');
                const v = varName(id);
                body.push(`vec4 ${v} = ${i};`);
                variables[`${id}_r`] = { name: `${v}.r`, type: 'float' };
                variables[`${id}_g`] = { name: `${v}.g`, type: 'float' };
                variables[`${id}_b`] = { name: `${v}.b`, type: 'float' };
                variables[`${id}_a`] = { name: `${v}.a`, type: 'float' };
                break;
            }
            case 'combine': {
                const r = getInput(id, 'r', '0.0', 'float');
                const g = getInput(id, 'g', '0.0', 'float');
                const b = getInput(id, 'b', '0.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = vec3(${r}, ${g}, ${b});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'step': {
                const type = getDynamicType(id, ['edge', 'in']);
                const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
                const edge = getInput(id, 'edge', zero, type);
                const i = getInput(id, 'in', zero, type);
                const v = varName(id);
                body.push(`${type} ${v} = step(${edge}, ${i});`);
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'smoothstep': {
                const type = getDynamicType(id, ['e1', 'e2', 'in']);
                const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
                const one = type === 'float' ? '1.0' : `${type}(1.0)`;
                const e1 = getInput(id, 'e1', zero, type);
                const e2 = getInput(id, 'e2', one, type);
                const i = getInput(id, 'in', zero, type);
                const v = varName(id);
                body.push(`${type} ${v} = smoothstep(${e1}, ${e2}, ${i});`);
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'saturate': {
                const type = getDynamicType(id, ['in']);
                const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
                const one = type === 'float' ? '1.0' : `${type}(1.0)`;
                const i = getInput(id, 'in', zero, type);
                const v = varName(id);
                body.push(`${type} ${v} = clamp(${i}, ${zero}, ${one});`);
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'oneMinus': {
                const type = getDynamicType(id, ['in']);
                const one = type === 'float' ? '1.0' : `${type}(1.0)`;
                const i = getInput(id, 'in', type === 'float' ? '0.0' : `${type}(0.0)`, type);
                const v = varName(id);
                body.push(`${type} ${v} = ${one} - ${i};`); 
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'dot': {
                const a = getInput(id, 'a', 'vec3(0.0)', 'vec3');
                const b = getInput(id, 'b', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`float ${v} = dot(${a}, ${b});`);
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'cross': {
                const a = getInput(id, 'a', 'vec3(0.0)', 'vec3');
                const b = getInput(id, 'b', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = cross(${a}, ${b});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'negate': {
                const type = getDynamicType(id, ['in']);
                const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
                const i = getInput(id, 'in', zero, type);
                const v = varName(id);
                body.push(`${type} ${v} = -${i};`);
                variables[`${id}_out`] = { name: v, type: type };
                break;
            }
            case 'posterize': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const steps = getInput(id, 'steps', '4.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = floor(${i} * ${steps}) / (${steps});`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'position': {
                const space = node.data.space || 'World';
                const v = varName(id);
                if (space === 'Object') {
                    if (mode === 'vertex') {
                        body.push(`vec3 ${v} = position;`);
                    } else {
                        body.push(`vec3 ${v} = vObjectPosition;`);
                    }
                } else {
                    if (mode === 'vertex') {
                        body.push(`vec3 ${v} = (u_model * vec4(position, 1.0)).xyz;`);
                    } else {
                        body.push(`vec3 ${v} = vPosition;`);
                    }
                }
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'normal': {
                const space = node.data.space || 'World';
                const v = varName(id);
                if (mode === 'vertex') {
                    if (space === 'Object') {
                         body.push(`vec3 ${v} = normal;`);
                    } else {
                         body.push(`vec3 ${v} = normalize(mat3(u_model) * normal);`);
                    }
                } else {
                    if (space === 'Object') {
                        body.push(`vec3 ${v} = normalize(vObjectNormal);`);
                    } else if (space === 'View') {
                        body.push(`vec3 ${v} = normalize(mat3(u_view) * vNormal);`);
                    } else {
                        body.push(`vec3 ${v} = normalize(vNormal);`);
                    }
                }
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'tangent': {
                const space = node.data.space || 'World';
                const v = varName(id);
                if (mode === 'vertex') {
                    body.push(`vec3 ${v} = normalize(mat3(u_model) * tangent.xyz);`);
                } else {
                    body.push(`vec3 ${v} = normalize(vTangent);`);
                }
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'bitangent': {
                const space = node.data.space || 'World';
                const v = varName(id);
                if (mode === 'vertex') {
                    body.push(`vec3 ${v}_n = normalize(mat3(u_model) * normal);`);
                    body.push(`vec3 ${v}_t = normalize(mat3(u_model) * tangent.xyz);`);
                    body.push(`vec3 ${v} = normalize(cross(${v}_n, ${v}_t) * tangent.w);`);
                } else {
                    body.push(`vec3 ${v} = normalize(vBitangent);`);
                }
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'mainLightDirection': {
                const v = varName(id);
                body.push(`vec3 ${v} = normalize(vec3(0.5, 1.0, 0.5));`);
                variables[`${id}_direction`] = { name: v, type: 'vec3' };
                break;
            }
            case 'viewDirection': {
                const v = varName(id);
                body.push(`vec3 ${v} = normalize(u_cameraPosition - vPosition);`); 
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'viewVector': {
                const v = varName(id);
                body.push(`vec3 ${v} = u_cameraPosition - vPosition;`); 
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'preview': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = ${i};`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'rotateAboutAxis': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const axis = getInput(id, 'axis', 'vec3(0.0, 1.0, 0.0)', 'vec3');
                const rot = getInput(id, 'rotation', '0.0', 'float');
                const v = varName(id);
                
                body.push(`vec3 ${v}_k = normalize(${axis});`);
                body.push(`float ${v}_c = cos(${rot});`);
                body.push(`float ${v}_s = sin(${rot});`);
                body.push(`vec3 ${v} = ${i} * ${v}_c + cross(${v}_k, ${i}) * ${v}_s + ${v}_k * dot(${v}_k, ${i}) * (1.0 - ${v}_c);`);
                
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'normalBlend': {
                const a = getInput(id, 'a', 'vec3(0.0, 0.0, 1.0)', 'vec3');
                const b = getInput(id, 'b', 'vec3(0.0, 0.0, 1.0)', 'vec3');
                const v = varName(id);
                body.push(`vec3 ${v} = normalize(vec3(${a}.xy + ${b}.xy, ${a}.z * ${b}.z));`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'checkerboard': {
                const defUv = mode === 'vertex' ? 'uv' : 'vUv';
                const uv = getInput(id, 'uv', defUv, 'vec2');
                const colA = getInput(id, 'colorA', 'vec3(0.8)', 'vec3');
                const colB = getInput(id, 'colorB', 'vec3(0.2)', 'vec3');
                const freq = getInput(id, 'freq', 'vec2(10.0)', 'vec2');
                const v = varName(id);
                body.push(`vec2 ${v}_uv = floor(${uv} * ${freq});`);
                body.push(`float ${v}_t = mod(${v}_uv.x + ${v}_uv.y, 2.0);`);
                body.push(`vec3 ${v} = mix(${colA}, ${colB}, ${v}_t);`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'contrast': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const c = getInput(id, 'contrast', '1.0', 'float');
                const v = varName(id);
                body.push(`vec3 ${v} = (${i} - 0.5) * ${c} + 0.5;`);
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'fadeTransition': {
                const noise = getInput(id, 'noise', '0.0', 'float');
                const fade = getInput(id, 'fade', '0.0', 'float');
                const contrast = getInput(id, 'contrast', '1.0', 'float');
                const v = varName(id);
                body.push(`float ${v} = clamp((${noise} - ${fade}) * ${contrast} + 0.5, 0.0, 1.0);`);
                variables[`${id}_out`] = { name: v, type: 'float' };
                break;
            }
            case 'channelMask': {
                const i = getInput(id, 'in', 'vec4(0.0)', 'vec4');
                const mask = node.data.channelMask || 'RGBA';
                const v = varName(id);
                const r = mask.includes('R') ? '1.0' : '0.0';
                const g = mask.includes('G') ? '1.0' : '0.0';
                const b = mask.includes('B') ? '1.0' : '0.0';
                const a = mask.includes('A') ? '1.0' : '0.0';
                body.push(`vec4 ${v} = ${i} * vec4(${r}, ${g}, ${b}, ${a});`);
                variables[`${id}_out`] = { name: v, type: 'vec4' };
                break;
            }
            case 'colorspaceConversion': {
                const i = getInput(id, 'in', 'vec3(0.0)', 'vec3');
                const v = varName(id);
                
                const from = node.data.conversionFrom || 'RGB';
                const to = node.data.conversionTo || 'Linear';
                
                if (from === 'RGB' && to === 'HSV') {
                    body.push(`vec3 ${v} = rgb2hsv(${i});`);
                } else if (from === 'HSV' && to === 'RGB') {
                     body.push(`vec3 ${v} = hsv2rgb(${i});`);
                } else {
                     body.push(`vec3 ${v} = ${i};`);
                }
                
                variables[`${id}_out`] = { name: v, type: 'vec3' };
                break;
            }
            case 'vertexColor': {
                const v = varName(id);
                body.push(`vec4 ${v} = vColor;`);
                variables[`${id}_out`] = { name: v, type: 'vec4' };
                break;
            }
            default: {
                // Pass-through for simple nodes or unknown to avoid breaking chain
                if (!variables[`${id}_out`] && !variables[`${id}_rgba`]) {
                     const v = varName(id);
                     body.push(`float ${v} = 0.0; // Unhandled: ${node.type}`);
                     variables[`${id}_out`] = { name: v, type: 'float' };
                }
            }
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
          
          if (variables[`${targetNodeId}_out`]) {
              resultVar = castTo(variables[`${targetNodeId}_out`].name, variables[`${targetNodeId}_out`].type, 'vec3');
          } else if (variables[`${targetNodeId}_rgba`]) {
              resultVar = castTo(variables[`${targetNodeId}_rgba`].name, 'vec4', 'vec3');
          } else if (variables[`${targetNodeId}_rgb`]) {
              resultVar = variables[`${targetNodeId}_rgb`].name;
          } else if (variables[`${targetNodeId}_r`]) {
              const r = variables[`${targetNodeId}_r`].name;
              resultVar = `vec3(${r})`;
          }

          // Apply Gamma Correction to Preview (Linear -> sRGB)
          // 1/2.2 approx 0.4545
          finalAssignment = `gl_FragColor = vec4(pow(max(${resultVar}, 0.0), vec3(0.4545)), 1.0);`;
      }
  } else if (mode === 'fragment') {
      const master = nodes.find(n => n.type === 'output');
      if (master) {
          functions.add(LIGHTING_FUNCTIONS);
          
          const color = getInput(master.id, 'color', 'vec3(0.5)', 'vec3');
          const alpha = getInput(master.id, 'alpha', '1.0', 'float');
          const normal = getInput(master.id, 'normal', 'vNormal', 'vec3'); 
          
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
          
          // Apply Gamma Correction to Final Output
          body.push(`vec3 finalColor = pow(max(lighting + ${emission}, 0.0), vec3(0.4545));`);
          
          body.push(`gl_FragColor = vec4(finalColor, ${alpha});`);
      } else {
          finalAssignment = `gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0);`; 
      }
  } else {
      const master = nodes.find(n => n.type === 'vertex');
      if (master) {
          const pos = getInput(master.id, 'position', 'position', 'vec3'); 
          const normal = getInput(master.id, 'normal', 'normal', 'vec3');
          const tangent = getInput(master.id, 'tangent', 'tangent.xyz', 'vec3'); 

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