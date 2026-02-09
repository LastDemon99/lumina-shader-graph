import type { NodeModule } from '../types';

export const checkerboardNode: NodeModule = {
  type: 'checkerboard',
  definition: {
    type: 'checkerboard',
    label: 'Checkerboard',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'colorA', label: 'Color A', type: 'color' },
      { id: 'colorB', label: 'Color B', type: 'color' },
      { id: 'freq', label: 'Frequency', type: 'vec2' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'uv', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const colA = ctx.getInput(ctx.id, 'colorA', 'vec3(0.8)', 'vec3');
      const colB = ctx.getInput(ctx.id, 'colorB', 'vec3(0.2)', 'vec3');
      const freq = ctx.getInput(ctx.id, 'freq', 'vec2(10.0)', 'vec2');

      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec2 ${v}_uv = floor(${uv} * ${freq});`);
      ctx.body.push(`float ${v}_t = mod(${v}_uv.x + ${v}_uv.y, 2.0);`);
      ctx.body.push(`vec3 ${v} = mix(${colA}, ${colB}, ${v}_t);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
