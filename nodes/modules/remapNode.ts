import type { NodeModule } from '../types';

export const remapNode: NodeModule = {
  type: 'remap',
  definition: {
    type: 'remap',
    label: 'Remap',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'inMinMax', label: 'In Min Max', type: 'vec2' },
      { id: 'outMinMax', label: 'Out Min Max', type: 'vec2' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'in', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'vec3');
      const inMM = ctx.getInput(ctx.id, 'inMinMax', 'vec2(-1.0, 1.0)', 'vec2');
      const outMM = ctx.getInput(ctx.id, 'outMinMax', 'vec2(0.0, 1.0)', 'vec2');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec3 ${v}_t = (${i} - ${inMM}.x) / (${inMM}.y - ${inMM}.x + 0.00001);`);
      ctx.body.push(`vec3 ${v} = mix(vec3(${outMM}.x), vec3(${outMM}.y), ${v}_t);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
