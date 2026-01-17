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
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      const hex = (ctx.node.data.value || '#ffffff') as string;
      const rgb = ctx.toGLSL(hex, 'vec3', ctx.mode);
      ctx.body.push(`vec3 ${v} = ${rgb};`);

      // Compatibility: some legacy code/graphs used `rgb` as the output socket id.
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      ctx.variables[`${ctx.id}_rgb`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
