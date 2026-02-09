import type { NodeModule } from '../types';

export const fresnelEffectNode: NodeModule = {
    type: 'fresnelEffect',
    definition: {
        type: 'fresnelEffect',
        label: 'Fresnel Effect',
        inputs: [
            { id: 'normal', label: 'Normal', type: 'vec3' },
            { id: 'viewDir', label: 'View Dir', type: 'vec3' },
            { id: 'power', label: 'Power', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [],
    },
    initialData: () => ({
        power: 2.0,
    }),
    glsl: {
        emit: ctx => {
            // Normal: World Normal
            // ViewDir: World View Direction
            const inNormal = ctx.getInput(ctx.id, 'normal', 'vNormal', 'vec3');
            const inViewDir = ctx.getInput(ctx.id, 'viewDir', 'normalize(u_cameraPosition - vPosition)', 'vec3');
            const inPower = ctx.getInput(ctx.id, 'power', '2.0', 'float');

            const v = ctx.varName(ctx.id);

            // Implementation: pow(1.0 - saturate(dot(normalize(Normal), normalize(ViewDir))), Power)
            ctx.body.push(`vec3 ${v}_n = normalize(${inNormal});`);
            ctx.body.push(`vec3 ${v}_v = normalize(${inViewDir});`);
            ctx.body.push(`float ${v}_dot = clamp(dot(${v}_n, ${v}_v), 0.0, 1.0);`);
            ctx.body.push(`float ${v} = pow(1.0 - ${v}_dot, ${inPower});`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
