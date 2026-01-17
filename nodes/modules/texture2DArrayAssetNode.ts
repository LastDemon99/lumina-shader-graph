import type { NodeModule } from '../types';

export const texture2DArrayAssetNode: NodeModule = {
  type: 'texture2DArrayAsset',
  definition: {
    type: 'texture2DArrayAsset',
    label: 'Texture 2D Array Asset',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out', type: 'textureArray' }],
  },
  ui: {
    width: 'wide',
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'layers',
            label: 'Texture Layers',
            controlType: 'textureArray',
            bind: { scope: 'data', key: 'layers' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    layers: [],
    layerCount: 0,
    textureAsset: undefined,
  }),
  glsl: {
    emit: () => {
      // Source node only; samplers are declared/used by texture sampling nodes.
      return true;
    },
  },
};
