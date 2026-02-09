import type { NodeModule } from '../types';

export const whiteBalanceNode: NodeModule = {
    type: 'whiteBalance',
    definition: {
        type: 'whiteBalance',
        label: 'White Balance',
        inputs: [
            { id: 'in', label: 'In(3)', type: 'vec3' },
            { id: 'temperature', label: 'Temperature(1)', type: 'float' },
            { id: 'tint', label: 'Tint(1)', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out(3)', type: 'vec3' }],
    },
    initialData: () => ({
        inputValues: {
            temperature: 0.0,
            tint: 0.0,
        }
    }),
    ui: {
        width: 'normal',
        preview: { enabled: true },
    },
    glsl: {
        emit: ctx => {
            const i = ctx.getInput(ctx.id, 'in', 'vec3(1.0)', 'vec3');
            const temp = ctx.getInput(ctx.id, 'temperature', '0.0', 'float');
            const tint = ctx.getInput(ctx.id, 'tint', '0.0', 'float');
            const v = ctx.varName(ctx.id);

            // 1. Linear RGB to LMS (Bradford)
            ctx.body.push(`mat3 ${v}_rgb2lms = mat3(
                0.8951, -0.7502, 0.0389,
                0.2664,  1.7135, -0.0685,
               -0.1614,  0.0367,  1.0296
            );`);

            // 2. LMS to Linear RGB (Inverse Bradford)
            ctx.body.push(`mat3 ${v}_lms2rgb = mat3(
                0.98699, 0.43231, -0.00853,
               -0.14705, 0.51836,  0.04004,
                0.15996, 0.04929,  0.96849
            );`);

            ctx.body.push(`vec3 ${v}_lms = ${v}_rgb2lms * ${i};`);

            // 3. Calculate Gains
            // Temperature: Warm (+1) -> Boost Red/L, Cut Blue/S.
            // Tint: Magenta (+1) -> Boost Red/L & Blue/S, Cut Green/M.

            ctx.body.push(`float ${v}_t1 = ${temp} * 0.6;`);
            ctx.body.push(`float ${v}_t2 = ${tint} * 0.6;`);

            ctx.body.push(`${v}_lms.x *= pow(2.0, ${v}_t1 + ${v}_t2);`);  // L (Red-ish)
            ctx.body.push(`${v}_lms.y *= pow(2.0, -${v}_t2);`);           // M (Green-ish) - Cut for Magenta
            ctx.body.push(`${v}_lms.z *= pow(2.0, -${v}_t1 + ${v}_t2);`); // S (Blue-ish)

            ctx.body.push(`vec3 ${v} = ${v}_lms2rgb * ${v}_lms;`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'vec3' };
            return true;
        },
    },
};
