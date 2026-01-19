import type { NodeModule } from '../types';

export const sliderNode: NodeModule = {
  type: 'slider',
  definition: {
    type: 'slider',
    label: 'Slider',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
  },
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
      {
        id: 'settings',
        title: 'Range Settings',
        layout: 'row',
        controls: [
          {
            id: 'min',
            label: 'Min',
            controlType: 'number',
            bind: { scope: 'data', key: 'minValue' },
          },
          {
            id: 'max',
            label: 'Max',
            controlType: 'number',
            bind: { scope: 'data', key: 'maxValue' },
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
