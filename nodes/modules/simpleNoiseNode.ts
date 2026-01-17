import type { NodeModule } from '../types';

export const simpleNoiseNode: NodeModule = {
  type: 'simpleNoise',
  definition: {
    type: 'simpleNoise',
    label: 'Simple Noise',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'scale', label: 'Scale', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
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
      ctx.functions.add(`
                float random(vec2 st) {
                    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
                }
                float noise(vec2 st) {
                    vec2 i = floor(st);
                    vec2 f = fract(st);
                    float a = random(i);
                    float b = random(i + vec2(1.0, 0.0));
                    float c = random(i + vec2(0.0, 1.0));
                    float d = random(i + vec2(1.0, 1.0));
                    vec2 u = f * f * (3.0 - 2.0 * f);
                    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
                }`);

      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const scale = ctx.getInput(ctx.id, 'scale', '10.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`float ${v} = noise(${uv} * ${scale});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
