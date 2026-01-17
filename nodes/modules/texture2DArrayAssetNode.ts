import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const texture2DArrayAssetNode: NodeModule = {
  type: 'texture2DArrayAsset',
  definition: NODE_DEFINITIONS.texture2DArrayAsset,
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
};
