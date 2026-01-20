import type { NodeModule } from '../types';

export const reflectionNode: NodeModule = {
    type: 'reflection',
    definition: {
        type: 'reflection',
        label: 'Reflection',
        inputs: [
            { id: 'in', label: 'In', type: 'vec3' },
            { id: 'normal', label: 'Normal', type: 'vec3' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [],
    },
    glsl: {
        emit: ctx => {
            const type = ctx.getDynamicType(['in', 'normal']);

            // In: View Direction (normalize(vPosition - u_cameraPosition))
            // Normal: World Normal (vNormal)
            const defIn = 'normalize(vPosition - u_cameraPosition)';
            const defNorm = 'vNormal';

            const inDir = ctx.getInput(ctx.id, 'in', defIn, type);
            const inNorm = ctx.getInput(ctx.id, 'normal', defNorm, type);
            const v = ctx.varName(ctx.id);

            // reflect(I, N) is the built-in GLSL function for the reflection vector calculation:
            // R = I - 2.0 * dot(N, I) * N
            ctx.body.push(`${type} ${v} = reflect(${inDir}, ${inNorm});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type };
            return true;
        },
    },
};
