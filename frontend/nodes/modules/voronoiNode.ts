import type { NodeModule } from '../types';

export const voronoiNode: NodeModule = {
  type: 'voronoi',
  definition: {
    type: 'voronoi',
    label: 'Voronoi',
    inputs: [
      { id: 'uv', label: 'UV', type: 'vec2' },
      { id: 'angleOffset', label: 'Angle Offset', type: 'float' },
      { id: 'cellDensity', label: 'Cell Density', type: 'float' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'float' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'uv', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      ctx.functions.add(`
                vec2 random2(vec2 p) {
                    return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
                }
                float voronoi(vec2 uv, float angleOffset, float cellDensity) {
                    vec2 g = floor(uv * cellDensity);
                    vec2 f = fract(uv * cellDensity);
                    float res = 8.0;
                    for(int y=-1; y<=1; y++) {
                        for(int x=-1; x<=1; x++) {
                            vec2 lattice = vec2(float(x),float(y));
                            vec2 offset = random2(lattice + g);
                            offset = 0.5 + 0.5*sin(angleOffset + 6.2831*offset);
                            vec2 d = lattice + offset - f;
                            float dist = length(d);
                            if(dist < res) {
                                res = dist;
                            }
                        }
                    }
                    return res;
                }`);

      const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
      const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
      const angle = ctx.getInput(ctx.id, 'angleOffset', '2.0', 'float');
      const density = ctx.getInput(ctx.id, 'cellDensity', '5.0', 'float');
      const v = ctx.varName(ctx.id);
      ctx.body.push(`float ${v} = voronoi(${uv}, ${angle}, ${density});`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      return true;
    },
  },
};
