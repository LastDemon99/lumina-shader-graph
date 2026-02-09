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
                float unity_noise_randomValue(vec2 uv) {
                    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
                }
                float unity_valueNoise(vec2 uv) {
                    vec2 i = floor(uv);
                    vec2 f = fract(uv);
                    // Quintic interpolation for smoother gradients
                    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);

                    float a = unity_noise_randomValue(i + vec2(0.0, 0.0));
                    float b = unity_noise_randomValue(i + vec2(1.0, 0.0));
                    float c = unity_noise_randomValue(i + vec2(0.0, 1.0));
                    float d = unity_noise_randomValue(i + vec2(1.0, 1.0));

                    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
                }
                float unity_simpleNoise(vec2 uv, float scale) {
                    float total = 0.0;
                    float freq = 1.0;
                    float amp = 1.0;
                    for(int i = 0; i < 3; i++) {
                        total += unity_valueNoise(uv * scale * freq) * amp;
                        freq *= 2.0;
                        amp *= 0.5;
                    }
                    return total;
                }
            `);

      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const scale = ctx.getInput(ctx.id, 'scale', '10.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`float ${v} = unity_simpleNoise(${uv}, ${scale} / 3.0);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
