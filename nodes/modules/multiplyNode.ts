import type { NodeModule } from '../types';

export const multiplyNode: NodeModule = {
  type: 'multiply',
  definition: {
    type: 'multiply',
    label: 'Multiply',
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
      const one = type === 'float' ? '1.0' : `${type}(1.0)`;
      const a = ctx.getInput(ctx.id, 'a', one, type);
      const b = ctx.getInput(ctx.id, 'b', one, type);
      const v = ctx.varName(ctx.id);
      ctx.body.push(`${type} ${v} = ${a} * ${b};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
