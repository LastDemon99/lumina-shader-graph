import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const positionNode: NodeModule = {
  type: 'position',
  definition: NODE_DEFINITIONS.position,
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
                { label: 'Absolute World', value: 'Absolute World' },
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
