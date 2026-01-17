import type { NodeModule } from '../types';

export const blendNode: NodeModule = {
  type: 'blend',
  definition: {
    type: 'blend',
    label: 'Blend',
    inputs: [
      { id: 'base', label: 'Base', type: 'vec3' },
      { id: 'blend', label: 'Blend', type: 'vec3' },
      { id: 'opacity', label: 'Opacity', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const base = ctx.getInput(ctx.id, 'base', 'vec3(0.0)', 'vec3');
      const blend = ctx.getInput(ctx.id, 'blend', 'vec3(1.0)', 'vec3');
      const opacity = ctx.getInput(ctx.id, 'opacity', '1.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = mix(${base}, ${blend}, clamp(${opacity}, 0.0, 1.0));`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
