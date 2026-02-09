import type { NodeModule } from '../types';

export const outputNode: NodeModule = {
  type: 'output',
  definition: {
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
      { id: 'alphaClip', label: 'Alpha Clip(1)', type: 'float' },
    ],
    outputs: [],
  },
  ui: {
    sections: [],
    preview: { enabled: false },
  },
  initialData: () => ({
    inputValues: {
      alpha: 1,
    },
  }),
  metadata: {
    isMasterNode: true,
  },
  glsl: {
    emit: () => {
      // Master node handled by generator final assembly.
      return true;
    },
  },
};
