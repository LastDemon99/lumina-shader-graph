import type { NodeModule } from '../types';

export const replaceColorNode: NodeModule = {
    type: 'replaceColor',
    definition: {
        type: 'replaceColor',
        label: 'Replace Color',
        inputs: [
            { id: 'in', label: 'In(3)', type: 'vec3' },
            { id: 'from', label: 'From(3)', type: 'color' },
            { id: 'to', label: 'To(3)', type: 'color' },
            { id: 'range', label: 'Range(1)', type: 'float' },
            { id: 'fuzziness', label: 'Fuzziness(1)', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
    },
    initialData: () => ({
        inputValues: {
            from: '#ff0000',
            to: '#0000ff',
            range: 0.1,
            fuzziness: 0.1,
        }
    }),
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [
            {
                id: 'properties',
                controls: [
                    {
                        id: 'range',
                        label: 'Range(1)',
                        controlType: 'float',
                        bind: { scope: 'inputValues', key: 'range' },
                        when: { kind: 'not', cond: { kind: 'connected', socketId: 'range', direction: 'input' } },
                    },
                    {
                        id: 'fuzziness',
                        label: 'Fuzziness(1)',
                        controlType: 'float',
                        bind: { scope: 'inputValues', key: 'fuzziness' },
                        when: { kind: 'not', cond: { kind: 'connected', socketId: 'fuzziness', direction: 'input' } },
                    },
                ],
            },
        ],
    },
    glsl: {
        emit: ctx => {
            const i = ctx.getInput(ctx.id, 'in', 'vec3(0.0)', 'vec3');
            const from = ctx.getInput(ctx.id, 'from', 'vec3(1.0, 0.0, 0.0)', 'vec3');
            const to = ctx.getInput(ctx.id, 'to', 'vec3(0.0, 0.0, 1.0)', 'vec3');
            const range = ctx.getInput(ctx.id, 'range', '0.1', 'float');
            const fuzziness = ctx.getInput(ctx.id, 'fuzziness', '0.1', 'float');
            const v = ctx.varName(ctx.id);

            // 1. Distance between In and From
            // 2. Subtract Range from distance
            // 3. Divide by Fuzziness
            // 4. Saturate to create the mask (0 = replace, 1 = keep original)
            // 5. Lerp(To, In, mask)

            ctx.body.push(`float ${v}_dist = distance(${i}, ${from});`);
            ctx.body.push(`float ${v}_mask = clamp((${v}_dist - ${range}) / max(${fuzziness}, 0.00001), 0.0, 1.0);`);
            ctx.body.push(`vec3 ${v} = mix(${to}, ${i}, ${v}_mask);`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
            return true;
        },
    },
};
