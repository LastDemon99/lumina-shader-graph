import type { NodeModule } from '../types';

export const matrixConstructionNode: NodeModule = {
  type: 'matrixConstruction',
  definition: {
    type: 'matrixConstruction',
    label: 'Matrix Construction',
    inputs: [
      { id: 'm0', label: 'M0', type: 'vec4' },
      { id: 'm1', label: 'M1', type: 'vec4' },
      { id: 'm2', label: 'M2', type: 'vec4' },
      { id: 'm3', label: 'M3', type: 'vec4' },
    ],
    outputs: [
      { id: 'mat4', label: 'Mat4', type: 'mat4' },
      { id: 'mat3', label: 'Mat3', type: 'mat3' },
      { id: 'mat2', label: 'Mat2', type: 'mat2' },
    ],
  },
  ui: {
    sections: [
      {
        id: 'main',
        controls: [
          {
            id: 'matrixMode',
            label: 'Mode',
            controlType: 'select',
            bind: { scope: 'data', key: 'matrixMode' },
            select: {
              options: [
                { label: 'Row', value: 'Row' },
                { label: 'Column', value: 'Column' },
              ],
            },
          },
        ],
      },
    ],
  },
  initialData: () => ({
    matrixMode: 'Row',
  }),
  glsl: {
    emit: ctx => {
      const mode = (ctx.node.data.matrixMode || 'Row') as string;

      const m0 = ctx.getInput(ctx.id, 'm0', 'vec4(1.0, 0.0, 0.0, 0.0)', 'vec4');
      const m1 = ctx.getInput(ctx.id, 'm1', 'vec4(0.0, 1.0, 0.0, 0.0)', 'vec4');
      const m2 = ctx.getInput(ctx.id, 'm2', 'vec4(0.0, 0.0, 1.0, 0.0)', 'vec4');
      const m3 = ctx.getInput(ctx.id, 'm3', 'vec4(0.0, 0.0, 0.0, 1.0)', 'vec4');

      const v = ctx.varName(ctx.id);

      if (mode === 'Column') {
        ctx.body.push(`mat4 ${v}_mat4 = mat4(${m0}, ${m1}, ${m2}, ${m3});`);
      } else {
        // GLSL mat4 constructor is column-major; transpose when authoring rows.
        ctx.body.push(
          `mat4 ${v}_mat4 = mat4(` +
            `vec4(${m0}.x, ${m1}.x, ${m2}.x, ${m3}.x), ` +
            `vec4(${m0}.y, ${m1}.y, ${m2}.y, ${m3}.y), ` +
            `vec4(${m0}.z, ${m1}.z, ${m2}.z, ${m3}.z), ` +
            `vec4(${m0}.w, ${m1}.w, ${m2}.w, ${m3}.w)` +
            `);`
        );
      }

      ctx.body.push(`mat3 ${v}_mat3 = mat3(${v}_mat4);`);
      ctx.body.push(`mat2 ${v}_mat2 = mat2(${v}_mat4);`);

      ctx.variables[`${ctx.id}_mat4`] = { name: `${v}_mat4`, type: 'mat4' };
      ctx.variables[`${ctx.id}_mat3`] = { name: `${v}_mat3`, type: 'mat3' };
      ctx.variables[`${ctx.id}_mat2`] = { name: `${v}_mat2`, type: 'mat2' };
      return true;
    },
  },
};
