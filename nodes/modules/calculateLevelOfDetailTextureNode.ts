import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const calculateLevelOfDetailTextureNode: NodeModule = {
  type: 'calculateLevelOfDetailTexture',
  definition: NODE_DEFINITIONS.calculateLevelOfDetailTexture,
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'textureAsset',
            label: 'Source',
            controlType: 'texture',
            bind: { scope: 'data', key: 'textureAsset' },
            texture: { variant: 'asset' },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
          {
            id: 'clamp',
            label: 'Clamp',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'clamp' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    clamp: false,
    textureAsset: undefined,
  }),
};
