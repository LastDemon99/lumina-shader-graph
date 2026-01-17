import type { NodeModule } from '../types';

export const colorNode: NodeModule = {
  type: 'color',
  definition: {
    type: 'color',
    label: 'Color',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: false },
    sections: [
      {
        id: 'value',
        controls: [
          {
            id: 'value',
            label: 'Color',
            controlType: 'color',
            bind: { scope: 'data', key: 'value' },
          },
        ],
      },
    ],
  },
  socketRules: {
    outputs: {
      out: {
        fallbackSocket: true,
      },
    },
  },
  initialData: () => ({ value: '#ffffff' }),
};
