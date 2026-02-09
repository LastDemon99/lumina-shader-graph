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
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      const val = Number(ctx.node.data.value ?? 0).toFixed(5);
      ctx.body.push(`float ${v} = ${val};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
