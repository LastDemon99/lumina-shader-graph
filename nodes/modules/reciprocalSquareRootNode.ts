import type { NodeModule } from '../types';

export const reciprocalSquareRootNode: NodeModule = {
    type: 'reciprocalSquareRoot',
    definition: {
        type: 'reciprocalSquareRoot',
        label: 'Reciprocal Square Root',
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
            const val = ctx.getInput(ctx.id, 'in', '1.0', type);
            const v = ctx.varName(ctx.id);

            // inversesqrt() is the built-in GLSL function for 1.0 / sqrt(x)
            // It is polymorphic and highly optimized on GPUs.
            ctx.body.push(`${type} ${v} = inversesqrt(${val});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
