import type { NodeModule } from '../types';

export const floatNode: NodeModule = {
  type: 'float',
  definition: {
    type: 'float',
    label: 'Float',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
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
            label: 'Value',
            controlType: 'number',
            bind: { scope: 'data', key: 'value' },
            number: { step: 0.01 },
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
  initialData: () => ({ value: 0.5 }),
};
