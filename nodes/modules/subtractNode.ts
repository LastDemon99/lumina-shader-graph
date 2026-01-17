import type { NodeModule } from '../types';

export const subtractNode: NodeModule = {
  type: 'subtract',
  definition: {
    type: 'subtract',
    label: 'Subtract',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'a', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const type = ctx.getDynamicType?.(['a', 'b']) ?? 'float';
      const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
      const a = ctx.getInput(ctx.id, 'a', zero, type);
      const b = ctx.getInput(ctx.id, 'b', zero, type);
      const v = ctx.varName(ctx.id);
      ctx.body.push(`${type} ${v} = ${a} - ${b};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
