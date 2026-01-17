import type { NodeModule } from '../types';

export const timeNode: NodeModule = {
  type: 'time',
  definition: {
    type: 'time',
    label: 'Time',
    inputs: [],
    outputs: [
      { id: 'out', label: 'Time(1)', type: 'float' },
      { id: 'sineTime', label: 'Sine Time(1)', type: 'float' },
      { id: 'cosineTime', label: 'Cosine Time(1)', type: 'float' },
    ],
  },
  ui: { sections: [] },
  glsl: {
    emit: ctx => {
      const v = ctx.varName(ctx.id);
      ctx.body.push(`float ${v} = u_time;`);
      ctx.body.push(`float ${v}_sin = sin(u_time);`);
      ctx.body.push(`float ${v}_cos = cos(u_time);`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
      ctx.variables[`${ctx.id}_sineTime`] = { name: `${v}_sin`, type: 'float' };
      ctx.variables[`${ctx.id}_cosineTime`] = { name: `${v}_cos`, type: 'float' };
      return true;
    },
  },
};
