import type { NodeModule } from '../types';

export const vertexNode: NodeModule = {
  type: 'vertex',
  definition: {
    type: 'vertex',
    label: 'Vertex Master',
    inputs: [
      { id: 'position', label: 'Position(3)', type: 'vec3' },
      { id: 'normal', label: 'Normal(3)', type: 'vec3' },
      { id: 'tangent', label: 'Tangent(3)', type: 'vec3' },
    ],
    outputs: [],
  },
  ui: { sections: [] },
  glsl: {
    emit: () => {
      // Master node handled by generator final assembly.
      return true;
    },
  },
};
