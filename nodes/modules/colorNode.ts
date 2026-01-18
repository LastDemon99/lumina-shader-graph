import type { NodeModule } from '../types';

export const colorNode: NodeModule = {
  type: 'color',
  definition: {
    type: 'color',
    label: 'Color',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'color' }],
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
      // Use an explicit socket-based name so preview heuristics can reliably
      // identify this as a color value (vs a generic vec3 data vector).
      const v = ctx.varName(ctx.id, 'rgb');
      const hex = (ctx.node.data.value || '#ffffff') as string;
      const rgb = ctx.toGLSL(hex, 'vec3', ctx.mode);
      ctx.body.push(`vec3 ${v} = ${rgb};`);

      // Compatibility: some legacy code/graphs used `rgb` as the output socket id.
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'color' };
      ctx.variables[`${ctx.id}_rgb`] = { name: v, type: 'color' };
      return true;
    },
  },
};
