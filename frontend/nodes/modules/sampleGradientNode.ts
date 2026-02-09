import type { NodeModule } from '../types';

export const sampleGradientNode: NodeModule = {
  type: 'sampleGradient',
  definition: {
    type: 'sampleGradient',
    label: 'Sample Gradient',
    inputs: [
      { id: 'gradient', label: 'Gradient', type: 'gradient' },
      { id: 'time', label: 'Time', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec4' }],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const time = ctx.getInput(ctx.id, 'time', '0.0', 'float');
      const v = ctx.varName(ctx.id);

      const gradConn = ctx.connections.find(
        c => c.targetNodeId === ctx.id && c.targetSocketId === 'gradient'
      );
      const gradNode = gradConn ? ctx.nodes.find(n => n.id === gradConn.sourceNodeId) : null;
      let stops =
        (gradNode?.data.gradientStops as Array<{ id: string; t: number; color: string }> | undefined) ||
        [
          { id: '1', t: 0, color: '#000000' },
          { id: '2', t: 1, color: '#ffffff' },
        ];
      stops = [...stops].sort((a, b) => a.t - b.t);

      const hexToVec3 = (hex: string) => {
        const r = parseInt(hex.substr(1, 2), 16) / 255;
        const g = parseInt(hex.substr(3, 2), 16) / 255;
        const b = parseInt(hex.substr(5, 2), 16) / 255;
        return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
      };

      ctx.body.push(`vec3 ${v}_c = vec3(0.0);`);
      ctx.body.push(`float ${v}_t = clamp(${time}, 0.0, 1.0);`);

      if (stops.length === 0) {
        ctx.body.push(`${v}_c = vec3(1.0, 0.0, 1.0);`);
      } else if (stops.length === 1) {
        ctx.body.push(`${v}_c = ${hexToVec3(stops[0].color)};`);
      } else {
        ctx.body.push(`if (${v}_t <= ${stops[0].t.toFixed(5)}) {`);
        ctx.body.push(`  ${v}_c = ${hexToVec3(stops[0].color)};`);
        ctx.body.push(`}`);
        for (let i = 0; i < stops.length - 1; i++) {
          const s1 = stops[i];
          const s2 = stops[i + 1];
          const range = Math.max(s2.t - s1.t, 0.00001);
          ctx.body.push(`else if (${v}_t <= ${s2.t.toFixed(5)}) {`);
          ctx.body.push(
            `  float t_norm = (${v}_t - ${s1.t.toFixed(5)}) / ${range.toFixed(5)};`
          );
          ctx.body.push(
            `  ${v}_c = mix(${hexToVec3(s1.color)}, ${hexToVec3(s2.color)}, t_norm);`
          );
          ctx.body.push(`}`);
        }
        ctx.body.push(`else {`);
        ctx.body.push(`  ${v}_c = ${hexToVec3(stops[stops.length - 1].color)};`);
        ctx.body.push(`}`);
      }

      ctx.body.push(`vec4 ${v} = vec4(${v}_c, 1.0);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec4' };
      return true;
    },
  },
};
