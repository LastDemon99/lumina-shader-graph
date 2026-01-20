import type { NodeModule } from '../types';

export const radiansToDegreesNode: NodeModule = {
    type: 'radiansToDegrees',
    definition: {
        type: 'radiansToDegrees',
        label: 'Radians To Degrees',
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

            // degrees() is a built-in GLSL function that converts radians to degrees
            // Formula: degrees = radians * (180.0 / PI)
            ctx.body.push(`${type} ${v} = degrees(${val});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
