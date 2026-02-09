import type { NodeModule } from '../types';

export const isNaNNode: NodeModule = {
    type: 'isNaN',
    definition: {
        type: 'isNaN',
        label: 'Is NaN',
        inputs: [
            { id: 'in', label: 'In', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [],
    },
    glsl: {
        emit: ctx => {
            const i = ctx.getInput(ctx.id, 'in', '0.0', 'float');
            const v = ctx.varName(ctx.id);

            // WebGL 1.0 (GLSL ES 1.0) doesn't have isnan().
            // A common trick is x != x, which is true only for NaN.
            ctx.body.push(`float ${v} = (${i} != ${i}) ? 1.0 : 0.0;`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
