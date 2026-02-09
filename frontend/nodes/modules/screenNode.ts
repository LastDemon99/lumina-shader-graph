import type { NodeModule } from '../types';

export const screenNode: NodeModule = {
  type: 'screen',
  definition: {
    type: 'screen',
    label: 'Screen',
    inputs: [],
    outputs: [
      { id: 'width', label: 'Width(1)', type: 'float' },
      { id: 'height', label: 'Height(1)', type: 'float' },
    ],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      // u_viewPort = vec4(x, y, width, height)
      ctx.variables[`${ctx.id}_width`] = { name: `u_viewPort.z`, type: 'float' };
      ctx.variables[`${ctx.id}_height`] = { name: `u_viewPort.w`, type: 'float' };
      return true;
    },
  },
};
