import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const gatherTexture2DNode: NodeModule = {
  type: 'gatherTexture2D',
  definition: NODE_DEFINITIONS.gatherTexture2D,
  ui: {
    sections: [
      {
        id: 'source',
        controls: [
          {
            id: 'textureAsset',
            label: 'Source',
            controlType: 'texture',
            bind: { scope: 'data', key: 'textureAsset' },
            texture: { variant: 'asset' },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    textureAsset: undefined,
  }),
};
