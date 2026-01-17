import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const textureAssetNode: NodeModule = {
  type: 'textureAsset',
  definition: NODE_DEFINITIONS.textureAsset,
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
};
