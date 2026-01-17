import { NODE_DEFINITIONS } from '../../constants';
import type { NodeModule } from '../types';

export const sliderNode: NodeModule = {
  type: 'slider',
  definition: NODE_DEFINITIONS.slider,
  ui: {
    width: 'wide',
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'value',
            label: 'Value',
            controlType: 'range',
            bind: { scope: 'data', key: 'value' },
            range: { minKey: 'minValue', maxKey: 'maxValue', step: 0.01 },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    value: 0.5,
    minValue: 0,
    maxValue: 1,
  }),
};
