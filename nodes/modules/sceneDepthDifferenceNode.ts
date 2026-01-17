import type { NodeModule } from '../types';

type SceneDepthMode = 'Linear01' | 'Eye' | 'Raw';

export const sceneDepthDifferenceNode: NodeModule = {
  type: 'sceneDepthDifference',
  definition: {
    type: 'sceneDepthDifference',
    label: 'Scene Depth Difference',
    inputs: [
      { id: 'uv', label: 'Scene UV(4)', type: 'vec4' },
      { id: 'position', label: 'Position WS(3)', type: 'vec3' },
    ],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
  },
  initialData: () => ({
    sceneDepthMode: 'Linear01',
  }),
  ui: {
    width: 'wide',
    preview: { enabled: true },
    sections: [
      {
        id: 'mode',
        title: 'Mode',
        controls: [
          {
            id: 'sceneDepthMode',
            label: 'Mode',
            controlType: 'select',
            bind: { scope: 'data', key: 'sceneDepthMode' },
            select: {
              options: [
                { label: 'Linear01', value: 'Linear01' },
                { label: 'Eye', value: 'Eye' },
                { label: 'Raw', value: 'Raw' },
              ],
            },
          },
        ],
      },
    ],
  },
  glsl: {
    emit: ctx => {
      const modeStr = (ctx.node.data.sceneDepthMode as SceneDepthMode | undefined) || 'Linear01';
      const v = ctx.varName(ctx.id);
      const pos = ctx.getInput(ctx.id, 'position', 'vPosition', 'vec3');

      if (ctx.mode === 'vertex') {
        ctx.body.push(`float ${v} = 0.0;`);
      } else {
        ctx.body.push(`vec4 ${v}_viewPos = u_view * vec4(${pos}, 1.0);`);
        ctx.body.push(`float ${v}_surfEye = -${v}_viewPos.z;`);
        ctx.body.push(`float ${v}_sceneEye = u_cameraFar;`);
        ctx.body.push(`float ${v}_diff = max(0.0, ${v}_sceneEye - ${v}_surfEye);`);

        if (modeStr === 'Linear01') {
          ctx.body.push(`float ${v} = ${v}_diff / u_cameraFar;`);
        } else if (modeStr === 'Raw') {
          ctx.body.push(`float ${v} = ${v}_diff * 0.01;`);
        } else {
          ctx.body.push(`float ${v} = ${v}_diff;`);
        }
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
