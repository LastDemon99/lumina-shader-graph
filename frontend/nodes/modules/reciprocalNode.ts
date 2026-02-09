import type { NodeModule } from '../types';

const METHOD_OPTIONS = [
  { label: 'Default', value: 'Default' },
  { label: 'Fast', value: 'Fast' },
];

export const reciprocalNode: NodeModule = {
  type: 'reciprocal',
  definition: {
    type: 'reciprocal',
    label: 'Reciprocal',
    inputs: [{ id: 'in', label: 'In', type: 'float' }],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [
      {
        id: 'method',
        controls: [
          {
            id: 'reciprocalMethod',
            label: 'Method',
            controlType: 'select',
            bind: { scope: 'data', key: 'reciprocalMethod' },
            select: { options: METHOD_OPTIONS },
          },
        ],
      },
    ],
  },
  socketRules: {
    fallbackSocket: { input: 'in', output: 'out' },
  },
  initialData: () => ({ reciprocalMethod: 'Default' }),
  glsl: {
    emit: ctx => {
      const i = ctx.getInput(ctx.id, 'in', '1.0', 'float');
      const method = (ctx.node.data as any)?.reciprocalMethod || 'Default';
      const v = ctx.varName(ctx.id);

      if (method === 'Fast') {
        ctx.body.push(`float ${v} = 1.0 / ${i};`);
      } else {
        ctx.body.push(`float ${v} = 1.0 / (${i} + 0.00001);`);
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
