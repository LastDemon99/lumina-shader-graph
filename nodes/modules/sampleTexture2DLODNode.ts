import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const sampleTexture2DLODNode: NodeModule = {
  type: 'sampleTexture2DLOD',
  definition: NODE_DEFINITIONS.sampleTexture2DLOD,
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
