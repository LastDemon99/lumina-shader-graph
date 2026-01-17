import type { NodeModule } from '../types';

export const colorMaskNode: NodeModule = {
  type: 'colorMask',
  definition: {
    type: 'colorMask',
    label: 'Color Mask',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'maskColor', label: 'Mask Color', type: 'vec3' },
      { id: 'range', label: 'Range', type: 'float' },
      { id: 'fuzziness', label: 'Fuzziness', type: 'float' },
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
      const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'vec3');
      const maskColor = ctx.getInput(ctx.id, 'maskColor', 'vec3(1.0)', 'vec3');
      const range = ctx.getInput(ctx.id, 'range', '0.1', 'float');
      const fuzziness = ctx.getInput(ctx.id, 'fuzziness', '0.0', 'float');
      const v = ctx.varName(ctx.id);

      // Distance-based keying with a soft edge.
      // Output is 1.0 when colors match, 0.0 when far away.
      ctx.body.push(`float ${v}_d = length(${i} - ${maskColor});`);
      ctx.body.push(`float ${v}_f = max(${fuzziness}, 1e-5);`);
      ctx.body.push(`float ${v} = 1.0 - smoothstep(${range}, ${range} + ${v}_f, ${v}_d);`);

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
