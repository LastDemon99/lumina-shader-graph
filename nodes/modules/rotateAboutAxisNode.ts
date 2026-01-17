import type { NodeModule } from '../types';

export const rotateAboutAxisNode: NodeModule = {
  type: 'rotateAboutAxis',
  definition: {
    type: 'rotateAboutAxis',
    label: 'Rotate About Axis',
    inputs: [
      { id: 'in', label: 'In', type: 'vec3' },
      { id: 'axis', label: 'Axis', type: 'vec3' },
      { id: 'rotation', label: 'Rotation', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'vec3');
      const axis = ctx.getInput(ctx.id, 'axis', 'vec3(0.0, 1.0, 0.0)', 'vec3');
      const rot = ctx.getInput(ctx.id, 'rotation', '0.0', 'float');
      const v = ctx.varName(ctx.id);

      ctx.body.push(`vec3 ${v}_k = normalize(${axis});`);
      ctx.body.push(`float ${v}_c = cos(${rot});`);
      ctx.body.push(`float ${v}_s = sin(${rot});`);
      ctx.body.push(
        `vec3 ${v} = ${i} * ${v}_c + cross(${v}_k, ${i}) * ${v}_s + ${v}_k * dot(${v}_k, ${i}) * (1.0 - ${v}_c);`
      );

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
