import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const textureNode: NodeModule = {
  type: 'texture',
  definition: NODE_DEFINITIONS.texture,
  ui: {
    width: 'wide',
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
          {
            id: 'textureType',
            label: 'Type',
            controlType: 'select',
            bind: { scope: 'data', key: 'textureType' },
            select: {
              options: [
                { label: 'Default', value: 'Default' },
                { label: 'Normal', value: 'Normal' },
              ],
            },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
          {
            id: 'space',
            label: 'Space',
            controlType: 'select',
            bind: { scope: 'data', key: 'space' },
            select: {
              options: [
                { label: 'Tangent', value: 'Tangent' },
                { label: 'Object', value: 'Object' },
              ],
            },
            when: { kind: 'not', cond: { kind: 'connected', socketId: 'texture', direction: 'input' } },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    textureAsset: undefined,
    textureType: 'Default',
    space: 'Tangent',
  }),
};
