import type { NodeModule } from '../types';

export const divideNode: NodeModule = {
  type: 'divide',
  definition: {
    type: 'divide',
    label: 'Divide',
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
      const epsilon = type === 'float' ? '0.00001' : `${type}(0.00001)`;
      const a = ctx.getInput(ctx.id, 'a', one, type);
      const b = ctx.getInput(ctx.id, 'b', one, type);
      const v = ctx.varName(ctx.id);
      ctx.body.push(`${type} ${v} = ${a} / (${b} + ${epsilon});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
