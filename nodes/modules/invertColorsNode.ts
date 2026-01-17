import type { NodeModule } from '../types';

export const invertColorsNode: NodeModule = {
  type: 'invertColors',
  definition: {
    type: 'invertColors',
    label: 'Invert Colors',
    inputs: [{ id: 'in', label: 'In', type: 'vec4' }],
    outputs: [{ id: 'out', label: 'Out', type: 'vec4' }],
  },
  ui: {
    width: 'wide',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'in', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const i = ctx.getInput(ctx.id, 'in', 'vec4(0.0)', 'vec4');
      const v = ctx.varName(ctx.id);
      // Invert RGB, preserve alpha.
      ctx.body.push(`vec4 ${v} = vec4(vec3(1.0) - ${i}.rgb, ${i}.a);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
      return true;
    },
  },
};
