import type { NodeModule } from '../types';

export const signNode: NodeModule = {
    type: 'sign',
    definition: {
        type: 'sign',
        label: 'Sign',
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
            const type = ctx.getDynamicType(['in']);
            const val = ctx.getInput(ctx.id, 'in', '0.0', type);
            const v = ctx.varName(ctx.id);

            // sign() is a built-in GLSL function
            // It returns 1.0 for positive, -1.0 for negative, and 0.0 for zero.
            ctx.body.push(`${type} ${v} = sign(${val});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
