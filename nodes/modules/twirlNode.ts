import type { NodeModule } from '../types';

export const twirlNode: NodeModule = {
  type: 'twirl',
  definition: {
    type: 'twirl',
    label: 'Twirl',
    inputs: [
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'center', label: 'Center(2)', type: 'vec2' },
      { id: 'strength', label: 'Strength(1)', type: 'float' },
      { id: 'offset', label: 'Offset(2)', type: 'vec2' },
    ],
    outputs: [{ id: 'out', label: 'Out(2)', type: 'vec2' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const center = ctx.getInput(ctx.id, 'center', 'vec2(0.5)', 'vec2');
      const strength = ctx.getInput(ctx.id, 'strength', '10.0', 'float');
      const offset = ctx.getInput(ctx.id, 'offset', 'vec2(0.0)', 'vec2');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec2 ${v}_delta = ${uv} - ${center} - ${offset};`);
      ctx.body.push(`float ${v}_angle = ${strength} * length(${v}_delta);`);
      ctx.body.push(`float ${v}_x = cos(${v}_angle) * ${v}_delta.x - sin(${v}_angle) * ${v}_delta.y;`);
      ctx.body.push(`float ${v}_y = sin(${v}_angle) * ${v}_delta.x + cos(${v}_angle) * ${v}_delta.y;`);
      ctx.body.push(`vec2 ${v} = vec2(${v}_x + ${center}.x + ${offset}.x, ${v}_y + ${center}.y + ${offset}.y);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
      return true;
    },
  },
};
