import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const metalReflectanceNode: NodeModule = {
  type: 'metalReflectance',
  definition: NODE_DEFINITIONS.metalReflectance,
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'metalType',
            label: 'Metal',
            controlType: 'select',
            bind: { scope: 'data', key: 'metalType' },
            select: {
              options: [
                { label: 'Iron', value: 'Iron' },
                { label: 'Silver', value: 'Silver' },
                { label: 'Aluminium', value: 'Aluminium' },
                { label: 'Gold', value: 'Gold' },
                { label: 'Copper', value: 'Copper' },
                { label: 'Chromium', value: 'Chromium' },
                { label: 'Nickel', value: 'Nickel' },
                { label: 'Titanium', value: 'Titanium' },
                { label: 'Cobalt', value: 'Cobalt' },
                { label: 'Platinum', value: 'Platinum' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    metalType: 'Iron',
  }),
};
