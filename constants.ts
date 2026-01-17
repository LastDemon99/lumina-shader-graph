



import { ShaderNode, NodeType } from './types';

export const NODE_DEFINITIONS: Record<NodeType, Omit<ShaderNode, 'id' | 'x' | 'y' | 'data'>> = {
  vertex: {
    type: 'vertex',
    label: 'Vertex Master',
    inputs: [
      { id: 'position', label: 'Position(3)', type: 'vec3' },
      { id: 'normal', label: 'Normal(3)', type: 'vec3' },
      { id: 'tangent', label: 'Tangent(3)', type: 'vec3' }
    ],
    outputs: []
  },
  output: {
    type: 'output',
    label: 'Fragment Master',
    inputs: [
      { id: 'color', label: 'Base Color(3)', type: 'vec3' },
      { id: 'smoothness', label: 'Smoothness(1)', type: 'float' },
      { id: 'normal', label: 'Normal (Tangent Space)(3)', type: 'vec3' },
      { id: 'emission', label: 'Emission(3)', type: 'vec3' },
      { id: 'occlusion', label: 'Ambient Occlusion(1)', type: 'float' },
      { id: 'specular', label: 'Specular Color(3)', type: 'vec3' },
      { id: 'alpha', label: 'Alpha(1)', type: 'float' },
      { id: 'alphaClip', label: 'Alpha Clip(1)', type: 'float' }
    ],
    outputs: []
  },
  object: {
    type: 'object',
    label: 'Object',
    inputs: [],
    outputs: [
      { id: 'position', label: 'Position(3)', type: 'vec3' },
      { id: 'scale', label: 'Scale(3)', type: 'vec3' },
      { id: 'worldBoundsMin', label: 'World Bounds Min(3)', type: 'vec3' },
      { id: 'worldBoundsMax', label: 'World Bounds Max(3)', type: 'vec3' },
      { id: 'boundsSize', label: 'Bounds Size(3)', type: 'vec3' }
    ]
  },
  preview: {
    type: 'preview',
    label: 'Preview',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' }
    ],
    outputs: [
       { id: 'out', label: 'Out', type: 'vec3' }
    ]
  },
  swizzle: {
    type: 'swizzle',
    label: 'Swizzle',
    inputs: [{ id: 'in', label: 'In(4)', type: 'vec4' }],
    outputs: [{ id: 'out', label: 'Out(4)', type: 'vec4' }]
  },
  mainLightDirection: {
    type: 'mainLightDirection',
    label: 'Main Light Direction',
    inputs: [],
    outputs: [
      { id: 'direction', label: 'Direction(3)', type: 'vec3' }
    ]
  },
  camera: {
    type: 'camera',
    label: 'Camera',
    inputs: [],
    outputs: [
      { id: 'position', label: 'Position(3)', type: 'vec3' },
      { id: 'direction', label: 'Direction(3)', type: 'vec3' },
      { id: 'orthographic', label: 'Orthographic(1)', type: 'float' },
      { id: 'nearPlane', label: 'Near Plane(1)', type: 'float' },
      { id: 'farPlane', label: 'Far Plane(1)', type: 'float' },
      { id: 'zBufferSign', label: 'Z Buffer Sign(1)', type: 'float' },
      { id: 'width', label: 'Width(1)', type: 'float' },
      { id: 'height', label: 'Height(1)', type: 'float' }
    ]
  },
  screen: {
    type: 'screen',
    label: 'Screen',
    inputs: [],
    outputs: [
      { id: 'width', label: 'Width(1)', type: 'float' },
      { id: 'height', label: 'Height(1)', type: 'float' }
    ]
  },
  screenPosition: {
    type: 'screenPosition',
    label: 'Screen Position',
    inputs: [],
    outputs: [
      { id: 'out', label: 'Out(4)', type: 'vec4' }
    ]
  },
  sceneDepth: {
    type: 'sceneDepth',
    label: 'Scene Depth',
    inputs: [{ id: 'uv', label: 'UV(2)', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }]
  },
  sceneDepthDifference: {
    type: 'sceneDepthDifference',
    label: 'Scene Depth Difference',
    inputs: [
        { id: 'uv', label: 'Scene UV(4)', type: 'vec4' },
        { id: 'position', label: 'Position WS(3)', type: 'vec3' }
    ],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }]
  },
  gradient: {
      type: 'gradient',
      label: 'Gradient',
      inputs: [],
      outputs: [{ id: 'out', label: 'Out(G)', type: 'gradient' }]
  },
  sampleGradient: {
      type: 'sampleGradient',
      label: 'Sample Gradient',
      inputs: [
          { id: 'gradient', label: 'Gradient(G)', type: 'gradient' },
          { id: 'time', label: 'Time(1)', type: 'float' }
      ],
      outputs: [{ id: 'out', label: 'Out(4)', type: 'vec4' }]
  },
  flipbook: {
    type: 'flipbook',
    label: 'Flipbook',
    inputs: [
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'width', label: 'Width(1)', type: 'float' },
      { id: 'height', label: 'Height(1)', type: 'float' },
      { id: 'tile', label: 'Tile(1)', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out(2)', type: 'vec2' }]
  },
  polarCoordinates: {
    type: 'polarCoordinates',
    label: 'Polar Coordinates',
    inputs: [
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'center', label: 'Center(2)', type: 'vec2' },
      { id: 'radialScale', label: 'Radial Scale(1)', type: 'float' },
      { id: 'lengthScale', label: 'Length Scale(1)', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out(2)', type: 'vec2' }]
  },
  radialShear: {
    type: 'radialShear',
    label: 'Radial Shear',
    inputs: [
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'center', label: 'Center(2)', type: 'vec2' },
      { id: 'strength', label: 'Strength(2)', type: 'vec2' },
      { id: 'offset', label: 'Offset(2)', type: 'vec2' }
    ],
    outputs: [{ id: 'out', label: 'Out(2)', type: 'vec2' }]
  },
  parallaxMapping: {
    type: 'parallaxMapping',
    label: 'Parallax Mapping',
    inputs: [
      { id: 'texture', label: 'Heightmap(T2)', type: 'texture' },
      { id: 'sampler', label: 'Sampler(SS)', type: 'samplerState' },
      { id: 'amplitude', label: 'Amplitude(1)', type: 'float' },
      { id: 'uv', label: 'UV(2)', type: 'vec2' }
    ],
    outputs: [{ id: 'out', label: 'ParallaxUVs(2)', type: 'vec2' }]
  },
  textureAsset: {
    type: 'textureAsset',
    label: 'Texture 2D Asset',
    inputs: [],
    outputs: [
      { id: 'texture', label: 'Texture(T2)', type: 'texture' }
    ]
  },
  texture2DArrayAsset: {
    type: 'texture2DArrayAsset',
    label: 'Texture 2D Array Asset',
    inputs: [],
    outputs: [
      { id: 'texture', label: 'Texture(T2A)', type: 'textureArray' }
    ]
  },
  samplerState: {
    type: 'samplerState',
    label: 'Sampler State',
    inputs: [],
    outputs: [
      { id: 'out', label: 'Out(SS)', type: 'samplerState' }
    ]
  },
  texture: {
    type: 'texture',
    label: 'Sample Texture 2D',
    inputs: [
      { id: 'texture', label: 'Texture(T2)', type: 'texture' },
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'sampler', label: 'Sampler(SS)', type: 'samplerState' }
    ],
    outputs: [
      { id: 'rgba', label: 'RGBA(4)', type: 'vec4' },
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'a', label: 'A', type: 'float' }
    ]
  },
  textureSize: {
    type: 'textureSize',
    label: 'Texture Size',
    inputs: [
      { id: 'texture', label: 'Texture(T2)', type: 'texture' }
    ],
    outputs: [
      { id: 'width', label: 'Width(1)', type: 'float' },
      { id: 'height', label: 'Height(1)', type: 'float' },
      { id: 'texelWidth', label: 'Texel Width(1)', type: 'float' },
      { id: 'texelHeight', label: 'Texel Height(1)', type: 'float' }
    ]
  },
  sampleTexture2DArray: {
    type: 'sampleTexture2DArray',
    label: 'Sample Texture 2D Array',
    inputs: [
      { id: 'texture', label: 'Texture Array(T2A)', type: 'textureArray' },
      { id: 'index', label: 'Index(1)', type: 'float' },
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'sampler', label: 'Sampler(SS)', type: 'samplerState' }
    ],
    outputs: [
      { id: 'rgba', label: 'RGBA(4)', type: 'vec4' },
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'a', label: 'A', type: 'float' }
    ]
  },
  gatherTexture2D: {
    type: 'gatherTexture2D',
    label: 'Gather Texture 2D',
    inputs: [
      { id: 'texture', label: 'Texture(T2)', type: 'texture' },
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'sampler', label: 'Sampler(SS)', type: 'samplerState' },
      { id: 'offset', label: 'Offset(2)', type: 'vec2' }
    ],
    outputs: [
      { id: 'rgba', label: 'RGBA(4)', type: 'vec4' },
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'a', label: 'A', type: 'float' }
    ]
  },
  sampleTexture2DLOD: {
    type: 'sampleTexture2DLOD',
    label: 'Sample Texture 2D LOD',
    inputs: [
      { id: 'texture', label: 'Texture(T2)', type: 'texture' },
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'sampler', label: 'Sampler(SS)', type: 'samplerState' },
      { id: 'lod', label: 'LOD(1)', type: 'float' }
    ],
    outputs: [
      { id: 'rgba', label: 'RGBA(4)', type: 'vec4' },
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'a', label: 'A', type: 'float' }
    ]
  },
  calculateLevelOfDetailTexture: {
    type: 'calculateLevelOfDetailTexture',
    label: 'Calculate LOD Texture 2D',
    inputs: [
      { id: 'texture', label: 'Texture(T2)', type: 'texture' },
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'sampler', label: 'Sampler(SS)', type: 'samplerState' }
    ],
    outputs: [
      { id: 'lod', label: 'LOD(1)', type: 'float' }
    ]
  },
  position: {
    type: 'position',
    label: 'Position',
    inputs: [],
    outputs: [{ id: 'out', label: 'XYZ', type: 'vec3' }]
  },
  normal: {
    type: 'normal',
    label: 'Normal Vector',
    inputs: [],
    outputs: [{ id: 'out', label: 'XYZ', type: 'vec3' }]
  },
  tangent: {
    type: 'tangent',
    label: 'Tangent Vector',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  bitangent: {
    type: 'bitangent',
    label: 'Bitangent Vector',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  viewDirection: {
    type: 'viewDirection',
    label: 'View Direction',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }]
  },
  viewVector: {
    type: 'viewVector',
    label: 'View Vector',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }]
  },
  vertexColor: {
    type: 'vertexColor',
    label: 'Vertex Color',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(4)', type: 'vec4' }]
  },
  color: {
    type: 'color',
    label: 'Color Input',
    inputs: [],
    outputs: [{ id: 'rgb', label: 'RGB', type: 'vec3' }]
  },
  vector2: {
    type: 'vector2',
    label: 'Vector 2',
    inputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec2' }]
  },
  vector3: {
    type: 'vector3',
    label: 'Vector 3',
    inputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' },
      { id: 'z', label: 'Z', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  vector4: {
    type: 'vector4',
    label: 'Vector 4',
    inputs: [
      { id: 'x', label: 'X', type: 'float' },
      { id: 'y', label: 'Y', type: 'float' },
      { id: 'z', label: 'Z', type: 'float' },
      { id: 'w', label: 'W', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec4' }]
  },
  matrixConstruction: {
    type: 'matrixConstruction',
    label: 'Matrix Construction',
    inputs: [
      { id: 'm0', label: 'M0(4)', type: 'vec4' },
      { id: 'm1', label: 'M1(4)', type: 'vec4' },
      { id: 'm2', label: 'M2(4)', type: 'vec4' },
      { id: 'm3', label: 'M3(4)', type: 'vec4' }
    ],
    outputs: [
      { id: 'mat4', label: '4x4', type: 'mat4' },
      { id: 'mat3', label: '3x3', type: 'mat3' },
      { id: 'mat2', label: '2x2', type: 'mat2' }
    ]
  },
  dielectricSpecular: {
    type: 'dielectricSpecular',
    label: 'Dielectric Specular',
    inputs: [
      { id: 'range', label: 'Range(0-1)', type: 'float' },
      { id: 'ior', label: 'IOR', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  },
  metalReflectance: {
    type: 'metalReflectance',
    label: 'Metal Reflectance',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }]
  },
  float: {
    type: 'float',
    label: 'Float Input',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  },
  slider: {
    type: 'slider',
    label: 'Slider',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }]
  },
  time: {
    type: 'time',
    label: 'Time',
    inputs: [],
    outputs: [
      { id: 'out', label: 'Time(1)', type: 'float' },
      { id: 'sineTime', label: 'Sine Time(1)', type: 'float' },
      { id: 'cosineTime', label: 'Cosine Time(1)', type: 'float' },
      { id: 'deltaTime', label: 'Delta Time(1)', type: 'float' },
      { id: 'smoothDeltaTime', label: 'Smooth Delta(1)', type: 'float' }
    ]
  },
  uv: {
    type: 'uv',
    label: 'UV Coordinates',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(4)', type: 'vec4' }]
  },
  rotate: {
    type: 'rotate',
    label: 'Rotate',
    inputs: [
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'center', label: 'Center(2)', type: 'vec2' },
      { id: 'rotation', label: 'Rotation(1)', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out(2)', type: 'vec2' }]
  },
  twirl: {
    type: 'twirl',
    label: 'Twirl',
    inputs: [
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'center', label: 'Center(2)', type: 'vec2' },
      { id: 'strength', label: 'Strength(1)', type: 'float' },
      { id: 'offset', label: 'Offset(2)', type: 'vec2' }
    ],
    outputs: [{ id: 'out', label: 'Out(2)', type: 'vec2' }]
  },
  transform: {
    type: 'transform',
    label: 'Transform',
    inputs: [{ id: 'in', label: 'In(3)', type: 'vec3' }],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }]
  },
  rotateAboutAxis: {
    type: 'rotateAboutAxis',
    label: 'Rotate About Axis',
    inputs: [
        { id: 'in', label: 'In(3)', type: 'vec3' },
        { id: 'axis', label: 'Axis(3)', type: 'vec3' },
        { id: 'rotation', label: 'Rotation(1)', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }]
  },
  add: {
    type: 'add',
    label: 'Add',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  subtract: {
    type: 'subtract',
    label: 'Subtract',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  multiply: {
    type: 'multiply',
    label: 'Multiply',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  divide: {
    type: 'divide',
    label: 'Divide',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  reciprocal: {
    type: 'reciprocal',
    label: 'Reciprocal',
    inputs: [{ id: 'in', label: 'In', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  },
  power: {
    type: 'power',
    label: 'Power',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  ceiling: {
    type: 'ceiling',
    label: 'Ceiling',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }], // Updated to vec3
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  floor: {
    type: 'floor',
    label: 'Floor',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }], // Updated to vec3
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  round: {
    type: 'round',
    label: 'Round',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }], // Updated to vec3
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  fraction: {
    type: 'fraction',
    label: 'Fraction',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }], // Updated to vec3
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  inverseLerp: {
    type: 'inverseLerp',
    label: 'Inverse Lerp',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 't', label: 'T', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  remap: {
    type: 'remap',
    label: 'Remap',
    inputs: [
        { id: 'in', label: 'In', type: 'vec3' },
        { id: 'inMinMax', label: 'In Min Max', type: 'vec2' },
        { id: 'outMinMax', label: 'Out Min Max', type: 'vec2' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  maximum: {
    type: 'maximum',
    label: 'Maximum',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  minimum: {
    type: 'minimum',
    label: 'Minimum',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  truncate: {
    type: 'truncate',
    label: 'Truncate',
    inputs: [{ id: 'in', label: 'In', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  clamp: {
    type: 'clamp',
    label: 'Clamp',
    inputs: [
      { id: 'in', label: 'In', type: 'float' },
      { id: 'min', label: 'Min', type: 'float' },
      { id: 'max', label: 'Max', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  sine: {
    type: 'sine',
    label: 'Sine',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }], // Updated to vec3
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  cosine: {
    type: 'cosine',
    label: 'Cosine',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }], // Updated to vec3
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  mix: {
    type: 'mix',
    label: 'Lerp (Mix)',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 't', label: 'T', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  blend: {
    type: 'blend',
    label: 'Blend',
    inputs: [
      { id: 'base', label: 'Base', type: 'vec3' },
      { id: 'blend', label: 'Blend', type: 'vec3' },
      { id: 'opacity', label: 'Opacity', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  normalBlend: {
    type: 'normalBlend',
    label: 'Normal Blend',
    inputs: [
      { id: 'a', label: 'A', type: 'vec3' },
      { id: 'b', label: 'B', type: 'vec3' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  channelMask: {
    type: 'channelMask',
    label: 'Channel Mask',
    inputs: [{ id: 'in', label: 'In', type: 'vec4' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec4' }]
  },
  colorMask: {
    type: 'colorMask',
    label: 'Color Mask',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'maskColor', label: 'Mask Color', type: 'vec3' },
      { id: 'range', label: 'Range', type: 'float' },
      { id: 'fuzziness', label: 'Fuzziness', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  },
  colorspaceConversion: {
    type: 'colorspaceConversion',
    label: 'Colorspace Conversion',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  contrast: {
    type: 'contrast',
    label: 'Contrast',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'contrast', label: 'Contrast', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  dither: {
    type: 'dither',
    label: 'Dither',
    inputs: [
      { id: 'in', label: 'In', type: 'float' },
      { id: 'screenPos', label: 'Screen Pos(4)', type: 'vec4' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  },
  fadeTransition: {
    type: 'fadeTransition',
    label: 'Fade Transition',
    inputs: [
      { id: 'noise', label: 'NoiseValue(1)', type: 'float' },
      { id: 'fade', label: 'FadeValue(1)', type: 'float' },
      { id: 'contrast', label: 'FadeContrast(1)', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Fade(1)', type: 'float' }]
  },
  hue: {
    type: 'hue',
    label: 'Hue',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'offset', label: 'Offset', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  invertColors: {
    type: 'invertColors',
    label: 'Invert Colors',
    inputs: [{ id: 'in', label: 'In', type: 'vec4' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec4' }]
  },
  absolute: {
    type: 'absolute',
    label: 'Absolute',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }], // Updated to vec3
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  arccosine: {
    type: 'arccosine',
    label: 'Arccosine',
    inputs: [{ id: 'in', label: 'In', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  arcsine: {
    type: 'arcsine',
    label: 'Arcsine',
    inputs: [{ id: 'in', label: 'In', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  arctangent: {
    type: 'arctangent',
    label: 'Arctangent',
    inputs: [{ id: 'in', label: 'In', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  arctangent2: {
    type: 'arctangent2',
    label: 'Arctangent2',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  dot: {
    type: 'dot',
    label: 'Dot Product',
    inputs: [
      { id: 'a', label: 'A', type: 'vec3' },
      { id: 'b', label: 'B', type: 'vec3' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  },
  cross: {
    type: 'cross',
    label: 'Cross Product',
    inputs: [
      { id: 'a', label: 'A', type: 'vec3' },
      { id: 'b', label: 'B', type: 'vec3' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  normalize: {
    type: 'normalize',
    label: 'Normalize',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  length: {
    type: 'length',
    label: 'Length',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  },
  distance: {
    type: 'distance',
    label: 'Distance',
    inputs: [
      { id: 'a', label: 'A', type: 'vec3' },
      { id: 'b', label: 'B', type: 'vec3' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  },
  step: {
    type: 'step',
    label: 'Step',
    inputs: [
      { id: 'edge', label: 'Edge', type: 'float' },
      { id: 'in', label: 'In', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  smoothstep: {
    type: 'smoothstep',
    label: 'Smoothstep',
    inputs: [
      { id: 'e1', label: 'Edge1', type: 'float' },
      { id: 'e2', label: 'Edge2', type: 'float' },
      { id: 'in', label: 'In', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  saturate: {
    type: 'saturate',
    label: 'Saturate',
    inputs: [{ id: 'in', label: 'In', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  oneMinus: {
    type: 'oneMinus',
    label: 'One Minus',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }], // Updated to vec3
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  negate: {
    type: 'negate',
    label: 'Negate',
    inputs: [{ id: 'in', label: 'In', type: 'vec3' }], // Updated to vec3
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  posterize: {
    type: 'posterize',
    label: 'Posterize',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'steps', label: 'Steps', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  split: {
    type: 'split',
    label: 'Split',
    inputs: [{ id: 'in', label: 'In', type: 'vec4' }],
    outputs: [
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'a', label: 'A', type: 'float' }
    ]
  },
  combine: {
    type: 'combine',
    label: 'Combine',
    inputs: [
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  checkerboard: {
    type: 'checkerboard',
    label: 'Checkerboard',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'colorA', label: 'Color A', type: 'vec3' },
      { id: 'colorB', label: 'Color B', type: 'vec3' },
      { id: 'freq', label: 'Frequency', type: 'vec2' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }]
  },
  voronoi: {
    type: 'voronoi',
    label: 'Voronoi',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'angleOffset', label: 'Angle Offset', type: 'float' },
      { id: 'cellDensity', label: 'Cell Density', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  },
  simpleNoise: {
    type: 'simpleNoise',
    label: 'Simple Noise',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'scale', label: 'Scale', type: 'float' }
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }]
  }
};

export const INITIAL_NODES: ShaderNode[] = [
  {
    id: 'vertex-node',
    ...NODE_DEFINITIONS.vertex,
    x: 800,
    y: 150,
    data: { previewMode: '3d' }
  },
  {
    id: 'master-node',
    ...NODE_DEFINITIONS.output,
    x: 800,
    y: 450,
    data: { previewMode: '3d' }
  },
  {
    id: 'color-1',
    ...NODE_DEFINITIONS.color,
    x: 400,
    y: 400,
    data: { value: '#ff0055', previewMode: '3d' }
  },
  {
    id: 'uv-1',
    ...NODE_DEFINITIONS.uv,
    x: 100,
    y: 400,
    data: { previewMode: '3d' }
  }
];

export const INITIAL_CONNECTIONS = [];
