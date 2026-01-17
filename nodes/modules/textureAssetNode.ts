import type { NodeModule } from '../types';

export const textureAssetNode: NodeModule = {
  type: 'textureAsset',
  definition: {
    type: 'textureAsset',
    label: 'Texture Asset',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'texture' }],
  },
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'textureAsset',
            label: 'Texture',
            controlType: 'texture',
            bind: { scope: 'data', key: 'textureAsset' },
            texture: { variant: 'asset' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    textureAsset: undefined,
  }),
  glsl: {
    emit: () => {
      // Source node only; samplers are declared/used by texture sampling nodes.
      return true;
    },
  },
};
