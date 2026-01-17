import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const flipbookNode: NodeModule = {
  type: 'flipbook',
  definition: NODE_DEFINITIONS.flipbook,
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'invertX',
            label: 'Invert X',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'invertX' },
          },
          {
            id: 'invertY',
            label: 'Invert Y',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'invertY' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    invertX: false,
    invertY: false,
  }),
};
