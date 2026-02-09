import type { NodeModule } from '../types';

export const refractNode: NodeModule = {
    type: 'refract',
    definition: {
        type: 'refract',
        label: 'Refract',
        inputs: [
            { id: 'incident', label: 'Incident', type: 'vec3' },
            { id: 'normal', label: 'Normal', type: 'vec3' },
            { id: 'iorSource', label: 'IORSource', type: 'float' },
            { id: 'iorMedium', label: 'IORMedium', type: 'float' },
        ],
        outputs: [
            { id: 'refracted', label: 'Refracted', type: 'vec3' },
            { id: 'intensity', label: 'Intensity', type: 'float' },
        ],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [
            {
                id: 'settings',
                controls: [
                    {
                        id: 'mode',
                        label: 'Mode',
                        controlType: 'select',
                        bind: { scope: 'data', key: 'mode' },
                        select: {
                            options: [
                                { label: 'Safe', value: 'Safe' },
                                { label: 'Critical Angle', value: 'Critical Angle' }
                            ]
                        }
                    }
                ]
            }
        ],
    },
    initialData: () => ({
        mode: 'Safe',
        iorSource: 1.0,
        iorMedium: 1.5,
    }),
    glsl: {
        emit: ctx => {
            const defIncident = 'normalize(vPosition - u_cameraPosition)';
            const defNorm = 'vNormal';

            const inInc = ctx.getInput(ctx.id, 'incident', defIncident, 'vec3');
            const inNorm = ctx.getInput(ctx.id, 'normal', defNorm, 'vec3');
            const inSource = ctx.getInput(ctx.id, 'iorSource', '1.0', 'float');
            const inMedium = ctx.getInput(ctx.id, 'iorMedium', '1.5', 'float');

            const v = ctx.varName(ctx.id);

            // eta is the ratio of indices of refraction (source/medium)
            ctx.body.push(`float ${v}_eta = ${inSource} / ${inMedium};`);

            // Built-in refract returns 0.0 if total internal reflection occurs
            ctx.body.push(`vec3 ${v}_refr = refract(normalize(${inInc}), normalize(${inNorm}), ${v}_eta);`);

            // Intensity is 1.0 if refraction is successful, 0.0 if TIR occurs
            ctx.body.push(`float ${v}_int = dot(${v}_refr, ${v}_refr) > 0.0 ? 1.0 : 0.0;`);

            ctx.variables[`${ctx.id}_refracted`] = { name: `${v}_refr`, type: 'vec3' };
            ctx.variables[`${ctx.id}_intensity`] = { name: `${v}_int`, type: 'float' };
            return true;
        },
    },
};
