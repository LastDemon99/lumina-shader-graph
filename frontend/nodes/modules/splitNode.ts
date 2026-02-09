import type { NodeModule } from '../types';

export const splitNode: NodeModule = {
  type: 'split',
  definition: {
    type: 'split',
    label: 'Split',
    inputs: [{ id: 'in', label: 'In', type: 'vec4' }],
    outputs: [
      { id: 'r', label: 'R', type: 'float' },
      { id: 'g', label: 'G', type: 'float' },
      { id: 'b', label: 'B', type: 'float' },
      { id: 'a', label: 'A', type: 'float' },
    ],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'in', output: 'r' },
  },
  glsl: {
    emit: ctx => {
      const i = ctx.getInput(ctx.id, 'in', 'vec4(0.0)', 'vec4');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec4 ${v} = ${i};`);
      ctx.variables[`${ctx.id}_r`] = { name: `${v}.r`, type: 'float' };
      ctx.variables[`${ctx.id}_g`] = { name: `${v}.g`, type: 'float' };
      ctx.variables[`${ctx.id}_b`] = { name: `${v}.b`, type: 'float' };
      ctx.variables[`${ctx.id}_a`] = { name: `${v}.a`, type: 'float' };
      return true;
    },
  },
};
