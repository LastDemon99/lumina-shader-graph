import type { NodeModule } from '../types';

export const degreesToRadiansNode: NodeModule = {
    type: 'degreesToRadians',
    definition: {
        type: 'degreesToRadians',
        label: 'Degrees To Radians',
        inputs: [
            { id: 'in', label: 'In', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: false },
        sections: [],
    },
    glsl: {
        emit: ctx => {
            const type = ctx.getDynamicType(['in']);
            const val = ctx.getInput(ctx.id, 'in', '0.0', type);
            const v = ctx.varName(ctx.id);

            // radians() is a built-in GLSL function that converts degrees to radians
            // It is polymorphic, so it works for float, vec2, vec3, and vec4.
            ctx.body.push(`${type} ${v} = radians(${val});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
