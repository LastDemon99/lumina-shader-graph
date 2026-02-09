import type { NodeModule } from '../types';

type RangeMode = 'Degrees' | 'Normalized';

const COLOR_FUNCTIONS_VERTEX_ONLY = `
vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
`;

export const hueNode: NodeModule = {
  type: 'hue',
  definition: {
    type: 'hue',
    label: 'Hue',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'offset', label: 'Offset', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  initialData: () => ({
    range: 'Degrees',
  }),
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [
      {
        id: 'settings',
        title: 'Settings',
        controls: [
          {
            id: 'range',
            label: 'Range',
            controlType: 'select',
            bind: { scope: 'data', key: 'range' },
            select: {
              options: [
                { label: 'Degrees', value: 'Degrees' },
                { label: 'Normalized', value: 'Normalized' },
              ],
            },
          },
        ],
      },
    ],
  },
  socketRules: {
    fallbackSocket: { input: 'in', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      // In fragment shaders, rgb2hsv/hsv2rgb are already provided via COLOR_FUNCTIONS.
      // In vertex shaders, inject them to avoid missing-symbol GLSL errors.
      if (ctx.mode === 'vertex') {
        ctx.functions.add(COLOR_FUNCTIONS_VERTEX_ONLY);
      }

      const range = (ctx.node.data.range as RangeMode) || 'Degrees';
      const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'vec3');
      const offset = ctx.getInput(ctx.id, 'offset', '0.0', 'float');
      const v = ctx.varName(ctx.id);

      let adjustedOffset = offset;
      if (range === 'Degrees') {
        adjustedOffset = `(${offset} / 360.0)`;
      }

      ctx.body.push(`vec3 ${v}_hsv = rgb2hsv(${i});`);
      ctx.body.push(`${v}_hsv.x = fract(${v}_hsv.x + ${adjustedOffset});`);
      ctx.body.push(`vec3 ${v} = hsv2rgb(${v}_hsv);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
