import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const matrixConstructionNode: NodeModule = {
  type: 'matrixConstruction',
  definition: NODE_DEFINITIONS.matrixConstruction,
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'matrixMode',
            label: 'Mode',
            controlType: 'select',
            bind: { scope: 'data', key: 'matrixMode' },
            select: {
              options: [
                { label: 'Row', value: 'Row' },
                { label: 'Column', value: 'Column' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    matrixMode: 'Row',
  }),
};
