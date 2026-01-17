import type { NodeModule } from '../types';

type ScreenPositionMode = 'Default' | 'Raw' | 'Center' | 'Tiled' | 'Pixel';

export const screenPositionNode: NodeModule = {
  type: 'screenPosition',
  definition: {
    type: 'screenPosition',
    label: 'Screen Position',
    inputs: [],
    outputs: [{ id: 'out', label: 'Out(4)', type: 'vec4' }],
  },
  initialData: () => ({
    screenPositionMode: 'Default',
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
            id: 'screenPositionMode',
            label: 'Mode',
            controlType: 'select',
            bind: { scope: 'data', key: 'screenPositionMode' },
            select: {
              options: [
                { label: 'Default', value: 'Default' },
                { label: 'Raw', value: 'Raw' },
                { label: 'Center', value: 'Center' },
                { label: 'Tiled', value: 'Tiled' },
                { label: 'Pixel', value: 'Pixel' },
              ],
            },
          },
        ],
      },
    ],
  },
  glsl: {
    emit: ctx => {
      const positionMode = (ctx.node.data.screenPositionMode as ScreenPositionMode | undefined) || 'Default';
      const v = ctx.varName(ctx.id);

      if (ctx.mode === 'vertex') {
        ctx.body.push(`vec4 ${v} = vec4(0.0); // Unavailable in Vertex Shader`);
      } else {
        if (positionMode === 'Default') {
          ctx.body.push(
            `vec4 ${v} = vec4((gl_FragCoord.xy - u_viewPort.xy) / u_viewPort.zw, 0.0, 1.0);`
          );
        } else if (positionMode === 'Raw') {
          ctx.body.push(`vec4 ${v} = gl_FragCoord;`);
        } else if (positionMode === 'Center') {
          ctx.body.push(
            `vec4 ${v} = vec4(((gl_FragCoord.xy - u_viewPort.xy) / u_viewPort.zw) * 2.0 - 1.0, 0.0, 1.0);`
          );
        } else if (positionMode === 'Tiled') {
          ctx.body.push(`vec4 ${v} = vec4((gl_FragCoord.xy - u_viewPort.xy) / u_viewPort.w, 0.0, 1.0);`);
        } else if (positionMode === 'Pixel') {
          ctx.body.push(`vec4 ${v} = vec4(gl_FragCoord.xy - u_viewPort.xy, 0.0, 1.0);`);
        }
      }

      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
      return true;
    },
  },
};
