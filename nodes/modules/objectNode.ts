import type { NodeModule } from '../types';

export const objectNode: NodeModule = {
  type: 'object',
  definition: {
    type: 'object',
    label: 'Object',
    inputs: [],
    outputs: [
      { id: 'position', label: 'Position(3)', type: 'vec3' },
      { id: 'scale', label: 'Scale(3)', type: 'vec3' },
      { id: 'worldBoundsMin', label: 'World Bounds Min(3)', type: 'vec3' },
      { id: 'worldBoundsMax', label: 'World Bounds Max(3)', type: 'vec3' },
      { id: 'boundsSize', label: 'Bounds Size(3)', type: 'vec3' },
    ],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v}_boundsMin = u_boundsMin;`);
      ctx.body.push(`vec3 ${v}_boundsMax = u_boundsMax;`);
      ctx.body.push(`vec3 ${v}_boundsSize = (${v}_boundsMax - ${v}_boundsMin);`);
      ctx.body.push(`vec3 ${v}_pos = (${v}_boundsMin + ${v}_boundsMax) * 0.5;`);
      ctx.body.push(`vec3 ${v}_scale = ${v}_boundsSize;`);

      ctx.variables[`${ctx.id}_worldBoundsMin`] = { name: `${v}_boundsMin`, type: 'vec3' };
      ctx.variables[`${ctx.id}_worldBoundsMax`] = { name: `${v}_boundsMax`, type: 'vec3' };
      ctx.variables[`${ctx.id}_boundsSize`] = { name: `${v}_boundsSize`, type: 'vec3' };
      ctx.variables[`${ctx.id}_position`] = { name: `${v}_pos`, type: 'vec3' };
      ctx.variables[`${ctx.id}_scale`] = { name: `${v}_scale`, type: 'vec3' };
      return true;
    },
  },
};
