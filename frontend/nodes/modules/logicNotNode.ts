import type { NodeModule } from '../types';

export const logicNotNode: NodeModule = {
    type: 'not',
    definition: {
        type: 'not',
        label: 'Not',
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

            ctx.body.push(`float ${v} = (${i} > 0.5) ? 0.0 : 1.0;`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
