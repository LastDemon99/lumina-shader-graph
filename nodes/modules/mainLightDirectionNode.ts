import type { NodeModule } from '../types';

export const mainLightDirectionNode: NodeModule = {
  type: 'mainLightDirection',
  definition: {
    type: 'mainLightDirection',
    label: 'Main Light Direction',
    inputs: [],
    outputs: [{ id: 'direction', label: 'Direction(3)', type: 'vec3' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v} = normalize(vec3(0.5, 1.0, 0.5));`);
      ctx.variables[`${ctx.id}_direction`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
