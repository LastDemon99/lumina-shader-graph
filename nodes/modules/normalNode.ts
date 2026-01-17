import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const normalNode: NodeModule = {
  type: 'normal',
  definition: NODE_DEFINITIONS.normal,
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'space',
            label: 'Space',
            controlType: 'select',
            bind: { scope: 'data', key: 'space' },
            select: {
              options: [
                { label: 'World', value: 'World' },
                { label: 'Object', value: 'Object' },
                { label: 'View', value: 'View' },
                { label: 'Tangent', value: 'Tangent' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    space: 'World',
  }),
};
