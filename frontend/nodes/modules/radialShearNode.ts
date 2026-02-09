import type { NodeModule } from '../types';

export const radialShearNode: NodeModule = {
  type: 'radialShear',
  definition: {
    type: 'radialShear',
    label: 'Radial Shear',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'center', label: 'Center', type: 'vec2' },
      { id: 'strength', label: 'Strength', type: 'vec2' },
      { id: 'offset', label: 'Offset', type: 'vec2' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec2' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const center = ctx.getInput(ctx.id, 'center', 'vec2(0.5)', 'vec2');
      const strength = ctx.getInput(ctx.id, 'strength', 'vec2(10.0)', 'vec2');
      const offset = ctx.getInput(ctx.id, 'offset', 'vec2(0.0)', 'vec2');
      const v = ctx.varName(ctx.id);

      ctx.body.push(`vec2 ${v}_delta = ${uv} - ${center};`);
      ctx.body.push(`float ${v}_delta2 = dot(${v}_delta, ${v}_delta);`);
      ctx.body.push(`vec2 ${v}_tangential = vec2(${v}_delta.y, -${v}_delta.x);`);
      ctx.body.push(`vec2 ${v} = ${uv} + ${v}_tangential * ${v}_delta2 * ${strength} + ${offset};`);

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
      return true;
    },
  },
};
