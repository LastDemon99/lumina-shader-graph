import type { NodeModule } from '../types';

const BAYER4_FUNCTION = `
float bayer4(vec2 p) {
    vec2 f = mod(p, 4.0);
    float x = f.x;
    float y = f.y;

    // 4x4 Bayer matrix thresholds in [0,1)
    // Row0:  0  8  2 10
    // Row1: 12  4 14  6
    // Row2:  3 11  1  9
    // Row3: 15  7 13  5
    if (y < 1.0) {
        if (x < 1.0) return 0.0 / 16.0;
        if (x < 2.0) return 8.0 / 16.0;
        if (x < 3.0) return 2.0 / 16.0;
        return 10.0 / 16.0;
    }
    if (y < 2.0) {
        if (x < 1.0) return 12.0 / 16.0;
        if (x < 2.0) return 4.0 / 16.0;
        if (x < 3.0) return 14.0 / 16.0;
        return 6.0 / 16.0;
    }
    if (y < 3.0) {
        if (x < 1.0) return 3.0 / 16.0;
        if (x < 2.0) return 11.0 / 16.0;
        if (x < 3.0) return 1.0 / 16.0;
        return 9.0 / 16.0;
    }
    {
        if (x < 1.0) return 15.0 / 16.0;
        if (x < 2.0) return 7.0 / 16.0;
        if (x < 3.0) return 13.0 / 16.0;
        return 5.0 / 16.0;
    }
}
`;

export const ditherNode: NodeModule = {
  type: 'dither',
  definition: {
    type: 'dither',
    label: 'Dither',
    inputs: [
      { id: 'in', label: 'In', type: 'float' },
      { id: 'screenPos', label: 'Screen Pos(4)', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
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
        // Screen position isn't available in vertex mode.
        ctx.body.push(`float ${v} = ${i};`);
        ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
        return true;
      }

      ctx.functions.add(BAYER4_FUNCTION);

      const sp = ctx.getInput(ctx.id, 'screenPos', 'vec4(0.0)', 'vec4');
      // Use pixel-space-ish coords; if normalized coords are provided, pattern still repeats.
      ctx.body.push(`float ${v}_t = bayer4(floor(${sp}.xy));`);
      ctx.body.push(`float ${v} = step(${v}_t, ${i});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
