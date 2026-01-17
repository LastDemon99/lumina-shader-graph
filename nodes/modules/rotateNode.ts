import type { NodeModule } from '../types';

export const rotateNode: NodeModule = {
  type: 'rotate',
  definition: {
    type: 'rotate',
    label: 'Rotate',
    inputs: [
      { id: 'uv', label: 'UV(2)', type: 'vec2' },
      { id: 'center', label: 'Center(2)', type: 'vec2' },
      { id: 'rotation', label: 'Rotation(1)', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out(2)', type: 'vec2' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const center = ctx.getInput(ctx.id, 'center', 'vec2(0.5)', 'vec2');
      const rotation = ctx.getInput(ctx.id, 'rotation', '0.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`float ${v}_c = cos(${rotation});`);
      ctx.body.push(`float ${v}_s = sin(${rotation});`);
      ctx.body.push(`mat2 ${v}_m = mat2(${v}_c, -${v}_s, ${v}_s, ${v}_c);`);
      ctx.body.push(`vec2 ${v} = ${v}_m * (${uv} - ${center}) + ${center};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec2' };
      return true;
    },
  },
};
