import type { NodeModule } from '../types';

export const uvNode: NodeModule = {
  type: 'uv',
  definition: {
    type: 'uv',
    label: 'UV Coordinates',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(4)', type: 'vec4' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      const source = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      ctx.body.push(`vec4 ${v} = vec4(${source}, 0.0, 1.0);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
      return true;
    },
  },
};
