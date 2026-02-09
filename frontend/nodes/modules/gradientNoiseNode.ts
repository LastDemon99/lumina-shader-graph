import type { NodeModule } from '../types';

export const gradientNoiseNode: NodeModule = {
    type: 'gradientNoise',
    definition: {
        type: 'gradientNoise',
        label: 'Gradient Noise',
        inputs: [
            { id: 'uv', label: 'UV(2)', type: 'vec2' },
            { id: 'scale', label: 'Scale(1)', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out(1)', type: 'float' }],
    },
    initialData: () => ({
        inputValues: {
            scale: 10.0,
        },
    }),
    ui: {
        width: 'normal',
        preview: { enabled: true },
    },
    glsl: {
        emit: ctx => {
            // Force Deterministic hash for better performance and consistency
            ctx.functions.add(`
                vec2 unity_gradientNoise_dir(vec2 p) {
                    p = mod(p, 289.0);
                    float x = mod((34.0 * p.x + 1.0) * p.x, 289.0) + p.y;
                    x = mod((34.0 * x + 1.0) * x, 289.0);
                    x = fract(x / 41.0) * 2.0 - 1.0;
                    return normalize(vec2(x - floor(x + 0.5), abs(x) - 0.5));
                }
            `);

            ctx.functions.add(`
                float unity_gradientNoise(vec2 p) {
                    vec2 ip = floor(p);
                    vec2 fp = fract(p);
                    float d00 = dot(unity_gradientNoise_dir(ip), fp);
                    float d01 = dot(unity_gradientNoise_dir(ip + vec2(0.0, 1.0)), fp - vec2(0.0, 1.0));
                    float d10 = dot(unity_gradientNoise_dir(ip + vec2(1.0, 0.0)), fp - vec2(1.0, 0.0));
                    float d11 = dot(unity_gradientNoise_dir(ip + vec2(1.0, 1.0)), fp - vec2(1.0, 1.0));
                    fp = fp * fp * fp * (fp * (fp * 6.0 - 15.0) + 10.0);
                    return mix(mix(d00, d10, fp.x), mix(d01, d11, fp.x), fp.y) + 0.5;
                }
            `);

            const defUv = ctx.mode === 'vertex' ? 'uv' : 'vUv';
            const uv = ctx.getInput(ctx.id, 'uv', defUv, 'vec2');
            const scale = ctx.getInput(ctx.id, 'scale', '10.0', 'float');
            const v = ctx.varName(ctx.id);

            ctx.body.push(`float ${v} = unity_gradientNoise(${uv} * ${scale});`);
            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        }
    }
};
