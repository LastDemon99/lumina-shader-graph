import type { NodeModule } from '../types';

export const vertexColorNode: NodeModule = {
  type: 'vertexColor',
  definition: {
    type: 'vertexColor',
    label: 'Vertex Color',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(4)', type: 'vec4' }],
  },
  ui: {
    width: 'wide',
    preview: { enabled: true },
    sections: [],
  },
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      ctx.body.push(`vec4 ${v} = vColor;`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
      return true;
    },
  },
};
