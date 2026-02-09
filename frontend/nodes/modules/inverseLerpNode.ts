import type { NodeModule } from '../types';

export const inverseLerpNode: NodeModule = {
  type: 'inverseLerp',
  definition: {
    type: 'inverseLerp',
    label: 'Inverse Lerp',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 't', label: 'T', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 't', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const type = ctx.getDynamicType?.(['a', 'b', 't']) ?? 'float';
      const zero = type === 'float' ? '0.0' : `${type}(0.0)`;
      const one = type === 'float' ? '1.0' : `${type}(1.0)`;
      const epsilon = type === 'float' ? '0.00001' : `${type}(0.00001)`;

      const a = ctx.getInput(ctx.id, 'a', zero, type);
      const b = ctx.getInput(ctx.id, 'b', one, type);
      const t = ctx.getInput(ctx.id, 't', zero, type);

      const v = ctx.varName(ctx.id);
      ctx.body.push(`${type} ${v} = clamp((${t} - ${a}) / (${b} - ${a} + ${epsilon}), 0.0, 1.0);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
