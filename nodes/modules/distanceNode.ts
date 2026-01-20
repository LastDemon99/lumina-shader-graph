import type { NodeModule } from '../types';

export const distanceNode: NodeModule = {
  type: 'distance',
  definition: {
    type: 'distance',
    label: 'Distance',
    inputs: [
      { id: 'a', label: 'A', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
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
      // Determine the highest rank of inputs (e.g., if one is vec3, both are treated as vec3)
      let type = ctx.getDynamicType(['a', 'b']);
      if (type === 'vec4') type = 'vec3';
      const zero = type === 'float' ? '0.0' : `${type}(0.0)`;

      // getInput with '0.0' fallback will automatically be cast to the target 'type'
      const a = ctx.getInput(ctx.id, 'a', zero, type);
      const b = ctx.getInput(ctx.id, 'b', zero, type);
      const v = ctx.varName(ctx.id);

      // distance() is built-in for all vector sizes
      ctx.body.push(`float ${v} = distance(${a}, ${b});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
