import type { NodeModule } from '../types';

type NormalBlendMode = 'Default' | 'Reoriented';

export const normalBlendNode: NodeModule = {
  type: 'normalBlend',
  definition: {
    type: 'normalBlend',
    label: 'Normal Blend',
    inputs: [
      { id: 'a', label: 'A(3)', type: 'vec3' },
      { id: 'b', label: 'B(3)', type: 'vec3' },
    ],
    outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
  },
  initialData: () => ({
    mode: 'Default',
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
            id: 'mode',
            label: 'Mode',
            controlType: 'select',
            bind: { scope: 'data', key: 'mode' },
            select: {
              options: [
                { label: 'Default', value: 'Default' },
                { label: 'Reoriented', value: 'Reoriented' },
              ],
            },
          },
        ],
      },
    ],
  },
  socketRules: {
    fallbackSocket: { input: 'a', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const mode = (ctx.node.data.mode as NormalBlendMode) || 'Default';
      const a = ctx.getInput(ctx.id, 'a', 'vec3(0.0, 0.0, 1.0)', 'vec3');
      const b = ctx.getInput(ctx.id, 'b', 'vec3(0.0, 0.0, 1.0)', 'vec3');
      const v = ctx.varName(ctx.id);

      if (mode === 'Default') {
        // Whiteout blend
        ctx.body.push(`vec3 ${v} = normalize(vec3(${a}.xy + ${b}.xy, ${a}.z * ${b}.z));`);
      } else {
        // Reoriented Normal Blend (RNM)
        // t = n1 + vec3(0,0,1)
        // u = n2 * vec3(-1,-1,1)
        // r = t*dot(t, u) - u*t.z
        const t = `${v}_t`;
        const u = `${v}_u`;
        ctx.body.push(`vec3 ${t} = ${a} + vec3(0.0, 0.0, 1.0);`);
        ctx.body.push(`vec3 ${u} = ${b} * vec3(-1.0, -1.0, 1.0);`);
        ctx.body.push(`vec3 ${v} = normalize(${t} * dot(${t}, ${u}) - ${u} * ${t}.z);`);
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
      return true;
    },
  },
};
