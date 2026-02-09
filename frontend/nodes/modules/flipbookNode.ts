import type { NodeModule } from '../types';

export const flipbookNode: NodeModule = {
  type: 'flipbook',
  definition: {
    type: 'flipbook',
    label: 'Flipbook',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'width', label: 'Width', type: 'float' },
      { id: 'height', label: 'Height', type: 'float' },
      { id: 'tile', label: 'Tile', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec2' }],
  },
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'invertX',
            label: 'Invert X',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'invertX' },
          },
          {
            id: 'invertY',
            label: 'Invert Y',
            controlType: 'toggle',
            bind: { scope: 'data', key: 'invertY' },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    invertX: false,
    invertY: false,
  }),
  glsl: {
    emit: ctx => {
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const width = ctx.getInput(ctx.id, 'width', '1.0', 'float');
      const height = ctx.getInput(ctx.id, 'height', '1.0', 'float');
      const tile = ctx.getInput(ctx.id, 'tile', '0.0', 'float');

      const invX = !!ctx.node.data.invertX;
      const invY = !!ctx.node.data.invertY;

      const v = ctx.varName(ctx.id);

      ctx.body.push(`float ${v}_w = max(${width}, 1.0);`);
      ctx.body.push(`float ${v}_h = max(${height}, 1.0);`);
      ctx.body.push(`float ${v}_tile = floor(mod(${tile}, ${v}_w * ${v}_h));`);
      ctx.body.push(`float ${v}_r = floor(${v}_tile / ${v}_w);`);
      ctx.body.push(`float ${v}_c = ${v}_tile - ${v}_r * ${v}_w;`);

      if (invX) ctx.body.push(`${v}_c = (${v}_w - 1.0) - ${v}_c;`);
      if (invY) ctx.body.push(`${v}_r = (${v}_h - 1.0) - ${v}_r;`);

      ctx.body.push(`vec2 ${v}_scale = vec2(1.0 / ${v}_w, 1.0 / ${v}_h);`);
      ctx.body.push(`vec2 ${v}_offset = vec2(${v}_c, ${v}_r) * ${v}_scale;`);
      ctx.body.push(`vec2 ${v} = (${uv} * ${v}_scale) + ${v}_offset;`);

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
      return true;
    },
  },
};
