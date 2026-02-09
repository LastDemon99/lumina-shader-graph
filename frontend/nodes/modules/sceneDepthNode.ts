import type { NodeModule } from '../types';

type SceneDepthMode = 'Linear01' | 'Eye' | 'Raw';

export const sceneDepthNode: NodeModule = {
  type: 'sceneDepth',
  definition: {
    type: 'sceneDepth',
    label: 'Scene Depth',
    inputs: [{ id: 'uv', label: 'UV(2)', type: 'vec2' }],
    outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
  },
  initialData: () => ({
    sceneDepthMode: 'Linear01',
  }),
  ui: {
    width: 'normal',
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
      const depthMode = (ctx.node.data.sceneDepthMode as SceneDepthMode | undefined) || 'Linear01';
      const v = ctx.varName(ctx.id);

      if (ctx.mode === 'vertex') {
        ctx.body.push(`float ${v} = 0.0; // Unavailable in Vertex Shader`);
      } else {
        if (depthMode === 'Raw') {
          ctx.body.push(`float ${v} = gl_FragCoord.z;`);
        } else {
          ctx.body.push(`float ${v}_z_ndc = 2.0 * gl_FragCoord.z - 1.0;`);
          ctx.body.push(
            `float ${v}_linear = (2.0 * u_cameraNear * u_cameraFar) / (u_cameraFar + u_cameraNear - ${v}_z_ndc * (u_cameraFar - u_cameraNear));`
          );

          if (depthMode === 'Eye') {
            ctx.body.push(`float ${v} = ${v}_linear;`);
          } else {
            ctx.body.push(`float ${v} = ${v}_linear / u_cameraFar;`);
          }
        }
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
