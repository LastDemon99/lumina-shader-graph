import type { NodeModule } from '../types';

export const multiplyNode: NodeModule = {
  type: 'multiply',
  definition: {
    type: 'multiply',
    label: 'Multiply',
    inputs: [
      { id: 'a', label: 'A', type: 'vec4' },
      { id: 'b', label: 'B', type: 'vec4' },
    ],
    outputs: [{ id: 'out', label: 'Out', type: 'vec4' }],
  },
  ui: {
    width: 'normal',
    preview: { enabled: true },
    sections: [],
  },
  socketRules: {
    fallbackSocket: { input: 'a', output: 'out' },
  },
  glsl: {
    emit: ctx => {
      const connA = ctx.connections.find(c => c.targetNodeId === ctx.id && c.targetSocketId === 'a');
      const connB = ctx.connections.find(c => c.targetNodeId === ctx.id && c.targetSocketId === 'b');

      const typeA = (connA ? ctx.variables[`${connA.sourceNodeId}_${connA.sourceSocketId}`]?.type : null) || 'float';
      const typeB = (connB ? ctx.variables[`${connB.sourceNodeId}_${connB.sourceSocketId}`]?.type : null) || 'float';

      const getBase = (t: string) => t === 'color' ? 'vec3' : t;
      const tA = getBase(typeA);
      const tB = getBase(typeB);

      const v = ctx.varName(ctx.id);

      // Handle Matrix-Vector multiplication specifically
      if (tA.startsWith('vec') && tB.startsWith('mat')) {
        const rank = tB.charAt(3);
        const vecT = `vec${rank}`;
        const a = ctx.getInput(ctx.id, 'a', `${vecT}(0.0)`, vecT);
        const b = ctx.getInput(ctx.id, 'b', `${tB}(1.0)`, tB);
        ctx.body.push(`${vecT} ${v} = ${a} * ${b};`);
        ctx.variables[`${ctx.id}_out`] = { name: v, type: vecT };
        return true;
      }

      if (tA.startsWith('mat') && tB.startsWith('vec')) {
        const rank = tA.charAt(3);
        const vecT = `vec${rank}`;
        const a = ctx.getInput(ctx.id, 'a', `${tA}(1.0)`, tA);
        const b = ctx.getInput(ctx.id, 'b', `${vecT}(0.0)`, vecT);
        ctx.body.push(`${vecT} ${v} = ${a} * ${b};`);
        ctx.variables[`${ctx.id}_out`] = { name: v, type: vecT };
        return true;
      }

      // Default behavior (Scalar/Vector broadcast)
      const type = ctx.getDynamicType?.(['a', 'b']) ?? 'float';
      const one = type === 'float' ? '1.0' : `${type}(1.0)`;
      const aVal = ctx.getInput(ctx.id, 'a', one, type);
      const bVal = ctx.getInput(ctx.id, 'b', one, type);
      ctx.body.push(`${type} ${v} = ${aVal} * ${bVal};`);
      ctx.variables[`${ctx.id}_out`] = { name: v, type };
      return true;
    },
  },
};
