
export type SocketType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'color' | 'texture' | 'textureArray' | 'sampler' | 'gradient' | 'mat2' | 'mat3' | 'mat4' | 'samplerState';

export interface SocketDef {
  id: string;
  label: string;
  type: SocketType;
}

export type NodeType =
  | 'output'
  | 'vertex'
  | 'preview'
  | 'object'
  | 'position'
  | 'normal'
  | 'tangent'
  | 'bitangent'
  | 'mainLightDirection'
  | 'viewDirection'
  | 'viewVector'
  | 'vertexColor'
  | 'color'
  | 'vector2'
  | 'vector3'
  | 'vector4'
  | 'slider'
  | 'time'
  | 'camera'
  | 'screen'
  | 'screenPosition'
  | 'sceneDepth'
  | 'sceneDepthDifference'
  | 'float'
  | 'textureAsset'
  | 'texture'
  | 'sampleTexture2D'
  | 'textureSize'
  | 'texture2DArrayAsset'
  | 'sampleTexture2DArray'
  | 'sampleTexture2DLOD'
  | 'gatherTexture2D'
  | 'calculateLevelOfDetailTexture'
  | 'samplerState'
  | 'gradient'
  | 'sampleGradient'
  | 'flipbook'
  | 'polarCoordinates'
  | 'radialShear'
  | 'parallaxMapping'
  | 'matrixConstruction'
  | 'dielectricSpecular'
  | 'metalReflectance'
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'reciprocal'
  | 'power'
  | 'ceiling'
  | 'floor'
  | 'round'
  | 'fraction'
  | 'inverseLerp'
  | 'remap'
  | 'maximum'
  | 'minimum'
  | 'truncate'
  | 'clamp'
  | 'sine'
  | 'cosine'
  | 'mix'
  | 'uv'
  | 'rotate'
  | 'twirl'
  | 'transform'
  | 'rotateAboutAxis'
  | 'absolute'
  | 'arccosine'
  | 'arcsine'
  | 'arctangent'
  | 'arctangent2'
  | 'dot'
  | 'cross'
  | 'distance'
  | 'normalize'
  | 'length'
  | 'step'
  | 'smoothstep'
  | 'saturate'
  | 'oneMinus'
  | 'negate'
  | 'posterize'
  | 'split'
  | 'combine'
  | 'checkerboard'
  | 'voronoi'
  | 'simpleNoise'
  | 'blend'
  | 'normalBlend'
  | 'channelMask'
  | 'colorMask'
  | 'colorspaceConversion'
  | 'contrast'
  | 'dither'
  | 'fadeTransition'
  | 'hue'
  | 'invertColors'
  | 'swizzle'
  | (string & {});

export interface GradientStop {
  id: string;
  t: number; // 0 to 1
  color: string; // hex
}

export interface NodeData {
  value?: any; // For purely static source nodes like Float/Color/Vector3 nodes
  minValue?: number | string; // For Slider Node
  maxValue?: number | string; // For Slider Node
  inputValues?: Record<string, any>; // For inline inputs on logic nodes (e.g. Voronoi Scale)
  glslName?: string;
  space?: string; // For Vector Nodes (Bitangent, etc.)
  blendMode?: string; // For Blend Node
  reciprocalMethod?: 'Default' | 'Fast'; // For Reciprocal Node
  normalBlendMode?: 'Default' | 'Reoriented'; // For Normal Blend Node
  matrixMode?: 'Row' | 'Column'; // For Matrix Construction Node
  channelMask?: string; // For Channel Mask Node (e.g. 'RG', 'B')
  invertMask?: string; // For Invert Colors Node (e.g. 'R', 'G', 'RGB')
  mask?: string; // For Swizzle Node (e.g. 'xyz', 'xx')
  conversionMode?: string; // For Colorspace Conversion (Legacy)
  conversionFrom?: 'RGB' | 'Linear' | 'HSV'; // For Colorspace Conversion
  conversionTo?: 'RGB' | 'Linear' | 'HSV'; // For Colorspace Conversion
  range?: string; // For Hue Node (e.g. 'degrees', 'radians')
  rotationUnit?: 'Radians' | 'Degrees'; // For Rotate About Axis Node
  invertChannels?: { x: boolean; y: boolean; z: boolean; w: boolean }; // Legacy/Alternative
  textureAsset?: string; // Base64 or URL for Texture Node
  layers?: string[]; // For Texture Array Asset (Previews)
  layerCount?: number; // Number of layers in the atlas
  textureType?: 'Default' | 'Normal'; // Interpretation of texture data
  samplerFilter?: 'Linear' | 'Point' | 'Trilinear'; // For Sampler State Node
  samplerWrap?: 'Repeat' | 'Clamp' | 'Mirror' | 'MirrorOnce'; // For Sampler State Node
  clamp?: boolean; // For Calculate LOD Node
  invertX?: boolean; // For Flipbook Node
  invertY?: boolean; // For Flipbook Node
  parallaxChannel?: 'r' | 'g' | 'b' | 'a'; // For Parallax Mapping Node
  uvChannel?: string; // For UV Node (e.g. 'uv0', 'uv1')
  transformSpaceFrom?: string; // For Transform Node (e.g. 'Object', 'World')
  transformSpaceTo?: string; // For Transform Node
  transformType?: string; // For Transform Node (e.g. 'Position', 'Direction', 'Normal')
  screenPositionMode?: 'Default' | 'Raw' | 'Center' | 'Tiled' | 'Pixel'; // For Screen Position Node
  sceneDepthMode?: 'Linear01' | 'Raw' | 'Eye'; // For Scene Depth Node
  dielectricMaterial?: 'Common' | 'Custom' | 'RustedMetal' | 'Water' | 'Ice' | 'Glass'; // For Dielectric Specular Node
  metalType?: 'Iron' | 'Silver' | 'Aluminium' | 'Gold' | 'Copper' | 'Chromium' | 'Nickel' | 'Titanium' | 'Cobalt' | 'Platinum'; // For Metal Reflectance Node
  previewObject?: 'sphere' | 'box' | 'quad'; // For Preview Node
  previewMode?: '2d' | '3d'; // For Node Preview state persistence
  previewCollapsed?: boolean; // Persist if the node preview is collapsed
  nodeCollapsed?: boolean; // NEW: Persist if the entire node is collapsed (Unity style)
  gradientStops?: GradientStop[]; // For Gradient Node
}

export interface ShaderNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  inputs: SocketDef[];
  outputs: SocketDef[];
  data: NodeData;
}

export interface Connection {
  id: string;
  sourceNodeId: string;
  sourceSocketId: string;
  targetNodeId: string;
  targetSocketId: string;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// For Gemini Generation
export interface GeneratedGraph {
  nodes: Omit<ShaderNode, 'data'> & { initialValue?: any }[];
  connections: Connection[];
}
