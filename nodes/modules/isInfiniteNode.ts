import type { NodeModule } from '../types';

export const isInfiniteNode: NodeModule = {
    type: 'isInfinite',
    definition: {
        type: 'isInfinite',
        label: 'Is Infinite',
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

            // WebGL 1.0 doesn't have isinf().
            // Infinity behaves such that any finite addition doesn't change it, or more simply:
            // abs(x) > VERY_LARGE_NUMBER.
            ctx.body.push(`float ${v} = (abs(${i}) > 1e38) ? 1.0 : 0.0;`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
