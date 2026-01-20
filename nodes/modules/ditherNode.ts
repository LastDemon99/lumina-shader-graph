import type { NodeModule } from '../types';

const BAYER4_FUNCTION = `
float bayer4(vec2 p) {
    vec2 f = mod(floor(p), 4.0);
    int x = int(f.x);
    int y = int(f.y);
    int index = y * 4 + x;
    
    if (index == 0) return 0.0; if (index == 1) return 0.5; if (index == 2) return 0.125; if (index == 3) return 0.625;
    if (index == 4) return 0.75; if (index == 5) return 0.25; if (index == 6) return 0.875; if (index == 7) return 0.375;
    if (index == 8) return 0.1875; if (index == 9) return 0.6875; if (index == 10) return 0.0625; if (index == 11) return 0.5625;
    if (index == 12) return 0.9375; if (index == 13) return 0.4375; if (index == 14) return 0.8125; if (index == 15) return 0.3125;
    return 0.0;
}
`;

export const ditherNode: NodeModule = {
  type: 'dither',
  definition: {
    type: 'dither',
    label: 'Dither',
    inputs: [
      { id: 'in', label: 'In(1)', type: 'float' },
      { id: 'screenPos', label: 'Screen Position(4)', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
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
      const i = ctx.getInput(ctx.id, 'in', '0.0', 'float');
      const v = ctx.varName(ctx.id);

      if (ctx.mode === 'vertex') {
        ctx.body.push(`float ${v} = ${i};`);
        ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
        return true;
      }

      ctx.functions.add(BAYER4_FUNCTION);

      // Default to normalized screen coordinates if not connected
      // (gl_FragCoord.xy - u_viewPort.xy) / u_viewPort.zw
      const defaultScreenPos = `vec4((gl_FragCoord.xy - u_viewPort.xy) / u_viewPort.zw, 0.0, 1.0)`;
      const sp = ctx.getInput(ctx.id, 'screenPos', defaultScreenPos, 'vec4');

      // The bayer4 function expects pixel coordinates.
      // Since sp is normalized (0-1) from typical ScreenPosition nodes, we multiply by viewport size.
      ctx.body.push(`vec2 ${v}_pixel = ${sp}.xy * u_viewPort.zw;`);
      ctx.body.push(`float ${v}_dither = bayer4(${v}_pixel);`);
      ctx.body.push(`float ${v} = step(${v}_dither, ${i});`);

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
