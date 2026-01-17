import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';
import type { GradientStop } from '../../types';

export const gradientNode: NodeModule = {
  type: 'gradient',
  definition: NODE_DEFINITIONS.gradient,
  ui: {
    width: 'wide',
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'gradientStops',
            label: 'Gradient',
            controlType: 'gradient',
            bind: { scope: 'data', key: 'gradientStops' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    gradientStops: [
      { id: '1', t: 0, color: '#000000' },
      { id: '2', t: 1, color: '#ffffff' },
    ] satisfies GradientStop[],
  }),
};
