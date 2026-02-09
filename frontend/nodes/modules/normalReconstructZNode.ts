import type { NodeModule } from '../types';

export const normalReconstructZNode: NodeModule = {
    type: 'normalReconstructZ',
    definition: {
        type: 'normalReconstructZ',
        label: 'Normal Reconstruct Z',
        inputs: [{ id: 'in', label: 'In(2)', type: 'vec2' }],
        outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
    },
    metadata: {
        isDataVector: true, // It produces a normal (data vector)
    },
    glsl: {
        emit: ctx => {
            const i = ctx.getInput(ctx.id, 'in', 'vec2(0.0)', 'vec2');
            const v = ctx.varName(ctx.id);

            ctx.body.push(`float ${v}_d2 = clamp(dot(${i}, ${i}), 0.0, 1.0);`);
            ctx.body.push(`float ${v}_z = sqrt(1.0 - ${v}_d2);`);
            ctx.body.push(`vec3 ${v} = normalize(vec3(${i}, ${v}_z));`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
            return true;
        },
    },
};
