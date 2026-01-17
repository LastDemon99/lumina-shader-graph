import type { NodeModule } from '../types';

export const polarCoordinatesNode: NodeModule = {
  type: 'polarCoordinates',
  definition: {
    type: 'polarCoordinates',
    label: 'Polar Coordinates',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'center', label: 'Center', type: 'vec2' },
      { id: 'radialScale', label: 'Radial Scale', type: 'float' },
      { id: 'lengthScale', label: 'Length Scale', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec2' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const center = ctx.getInput(ctx.id, 'center', 'vec2(0.5)', 'vec2');
      const radScale = ctx.getInput(ctx.id, 'radialScale', '1.0', 'float');
      const lenScale = ctx.getInput(ctx.id, 'lengthScale', '1.0', 'float');
      const v = ctx.varName(ctx.id);

      ctx.body.push(`vec2 ${v}_delta = ${uv} - ${center};`);
      ctx.body.push(`float ${v}_radius = length(${v}_delta) * 2.0 * ${lenScale};`);
      ctx.body.push(`float ${v}_angle = atan(${v}_delta.y, ${v}_delta.x) * 0.159154943;`);
      ctx.body.push(`${v}_angle = fract((${v}_angle + 0.5) * ${radScale});`);
      ctx.body.push(`vec2 ${v} = vec2(${v}_radius, ${v}_angle);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
      return true;
    },
  },
};
