import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const textureSizeNode: NodeModule = {
  type: 'textureSize',
  definition: NODE_DEFINITIONS.textureSize,
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
