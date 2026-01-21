import type { NodeModule } from '../types';

export const logicOrNode: NodeModule = {
    type: 'or',
    definition: {
        type: 'or',
        label: 'Or',
        inputs: [
            { id: 'a', label: 'A', type: 'float' },
            { id: 'b', label: 'B', type: 'float' },
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
            const a = ctx.getInput(ctx.id, 'a', '0.0', 'float');
            const b = ctx.getInput(ctx.id, 'b', '0.0', 'float');
            const v = ctx.varName(ctx.id);

            ctx.body.push(`float ${v} = (${a} > 0.5 || ${b} > 0.5) ? 1.0 : 0.0;`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
