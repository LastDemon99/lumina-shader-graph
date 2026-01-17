import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const parallaxMappingNode: NodeModule = {
  type: 'parallaxMapping',
  definition: NODE_DEFINITIONS.parallaxMapping,
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'textureAsset',
            label: 'Heightmap',
            controlType: 'texture',
            bind: { scope: 'data', key: 'textureAsset' },
            texture: { variant: 'asset' },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
          {
            id: 'parallaxChannel',
            label: 'Sample Channel',
            controlType: 'select',
            bind: { scope: 'data', key: 'parallaxChannel' },
            select: {
              options: [
                { label: 'R', value: 'r' },
                { label: 'G', value: 'g' },
                { label: 'B', value: 'b' },
                { label: 'A', value: 'a' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    parallaxChannel: 'g',
    textureAsset: undefined,
  }),
};
