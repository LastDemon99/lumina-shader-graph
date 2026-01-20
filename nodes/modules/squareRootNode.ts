import type { NodeModule } from '../types';

export const squareRootNode: NodeModule = {
    type: 'squareRoot',
    definition: {
        type: 'squareRoot',
        label: 'Square Root',
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

            // sqrt() is a built-in GLSL function
            // It is polymorphic (works with float, vec2, vec3, vec4)
            ctx.body.push(`${type} ${v} = sqrt(${val});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
