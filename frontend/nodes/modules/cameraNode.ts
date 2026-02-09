import type { NodeModule } from '../types';

export const cameraNode: NodeModule = {
  type: 'camera',
  definition: {
    type: 'camera',
    label: 'Camera',
    inputs: [],
    outputs: [
      { id: 'position', label: 'Position(3)', type: 'vec3' },
      { id: 'direction', label: 'Direction(3)', type: 'vec3' },
      { id: 'orthographic', label: 'Orthographic(1)', type: 'float' },
      { id: 'nearPlane', label: 'Near Plane(1)', type: 'float' },
      { id: 'farPlane', label: 'Far Plane(1)', type: 'float' },
      { id: 'zBufferSign', label: 'Z Buffer Sign(1)', type: 'float' },
      { id: 'width', label: 'Width(1)', type: 'float' },
      { id: 'height', label: 'Height(1)', type: 'float' },
    ],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);

      ctx.body.push(`vec3 ${v}_pos = u_cameraPosition;`);
      ctx.body.push(
        `vec3 ${v}_dir = normalize((u_view_inv * vec4(0.0, 0.0, -1.0, 0.0)).xyz);`
      );
      ctx.body.push(`float ${v}_ortho = 0.0;`);
      ctx.body.push(`float ${v}_near = u_cameraNear;`);
      ctx.body.push(`float ${v}_far = u_cameraFar;`);
      ctx.body.push(`float ${v}_zsign = 1.0;`);
      ctx.body.push(`float ${v}_w = u_viewPort.z;`);
      ctx.body.push(`float ${v}_h = u_viewPort.w;`);

      ctx.variables[`${ctx.id}_position`] = { name: `${v}_pos`, type: 'vec3' };
      ctx.variables[`${ctx.id}_direction`] = { name: `${v}_dir`, type: 'vec3' };
      ctx.variables[`${ctx.id}_orthographic`] = { name: `${v}_ortho`, type: 'float' };
      ctx.variables[`${ctx.id}_nearPlane`] = { name: `${v}_near`, type: 'float' };
      ctx.variables[`${ctx.id}_farPlane`] = { name: `${v}_far`, type: 'float' };
      ctx.variables[`${ctx.id}_zBufferSign`] = { name: `${v}_zsign`, type: 'float' };
      ctx.variables[`${ctx.id}_width`] = { name: `${v}_w`, type: 'float' };
      ctx.variables[`${ctx.id}_height`] = { name: `${v}_h`, type: 'float' };
      return true;
    },
  },
};
