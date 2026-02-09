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
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [
      {
        id: 'params',
        controls: [
          {
            id: 'center',
            label: 'Center',
            controlType: 'vector2',
            bind: { scope: 'data', key: 'center' },
          },
          {
            id: 'strength',
            label: 'Strength',
            controlType: 'number',
            bind: { scope: 'data', key: 'strength' },
            number: { step: 0.1 },
          },
          {
            id: 'offset',
            label: 'Offset',
            controlType: 'vector2',
            bind: { scope: 'data', key: 'offset' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    center: { x: 0.5, y: 0.5 },
    strength: 10.0,
    offset: { x: 0, y: 0 },
  }),
  glsl: {
    emit: ctx => {
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');

      const rawCenter = ctx.node.data.center || { x: 0.5, y: 0.5 };
      const center = ctx.getInput(ctx.id, 'center', `vec2(${rawCenter.x}, ${rawCenter.y})`, 'vec2');

      const rawStrength = ctx.node.data.strength ?? 10.0;
      const strength = ctx.getInput(ctx.id, 'strength', rawStrength.toFixed(2), 'float');

      const rawOffset = ctx.node.data.offset || { x: 0, y: 0 };
      const offset = ctx.getInput(ctx.id, 'offset', `vec2(${rawOffset.x}, ${rawOffset.y})`, 'vec2');

      const v = ctx.varName(ctx.id);

      ctx.body.push(`vec2 ${v}_delta = ${uv} - ${center};`);
      ctx.body.push(`float ${v}_dist = length(${v}_delta);`);
      ctx.body.push(`float ${v}_angle = ${strength} * ${v}_dist;`);
      ctx.body.push(`float ${v}_s = sin(${v}_angle);`);
      ctx.body.push(`float ${v}_c = cos(${v}_angle);`);
      ctx.body.push(`vec2 ${v} = vec2(${v}_c * ${v}_delta.x - ${v}_s * ${v}_delta.y, ${v}_s * ${v}_delta.x + ${v}_c * ${v}_delta.y) + ${center} + ${offset};`);

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
      return true;
    },
  },
};
