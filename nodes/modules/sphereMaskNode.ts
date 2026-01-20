import type { NodeModule } from '../types';

export const sphereMaskNode: NodeModule = {
    type: 'sphereMask',
    definition: {
        type: 'sphereMask',
        label: 'Sphere Mask',
        inputs: [
            { id: 'coords', label: 'Coords', type: 'vec2' },
            { id: 'center', label: 'Center', type: 'vec2' },
            { id: 'radius', label: 'Radius', type: 'float' },
            { id: 'hardness', label: 'Hardness', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'float' }],
    },
    ui: {
        width: 'normal',
        preview: { enabled: true },
        sections: [],
    },
    initialData: () => ({
        radius: 0.1,
        hardness: 0.8,
    }),
    glsl: {
        emit: ctx => {
            let type = ctx.getDynamicType(['coords', 'center']);

            // Fix: Cap dimension at vec3. 
            // Often vec4 inputs (like UVs or Homogeneous Pos) have W=1 or W=0 which 
            // causes invalid distances when compared to a default Center generated with different W.
            // Sphere Mask implies spatial (3D) or planar (2D) masking.
            if (type === 'vec4') type = 'vec3';

            const defCoords = ctx.mode === 'vertex' ? 'uv' : 'vUv';
            const coords = ctx.getInput(ctx.id, 'coords', defCoords, type);

            const defCenter = type === 'float' ? '0.5' : `${type}(0.5)`;
            const center = ctx.getInput(ctx.id, 'center', defCenter, type);

            const radius = ctx.getInput(ctx.id, 'radius', '0.1', 'float');
            const hardness = ctx.getInput(ctx.id, 'hardness', '0.8', 'float');

            const v = ctx.varName(ctx.id);

            // 1. Calculate distance between Coords and Center
            ctx.body.push(`float ${v}_dist = distance(${coords}, ${center});`);

            // 2. Apply Radius and Hardness
            // Formula: 1.0 - saturate((dist - radius) / (1.0 - hardness))
            // To avoid division by zero when hardness is 1.0, we use a small epsilon
            ctx.body.push(`float ${v} = 1.0 - clamp((${v}_dist - ${radius}) / (1.00001 - ${hardness}), 0.0, 1.0);`);

            ctx.variables[`${ctx.id}_out`] = { name: v, type: 'float' };
            return true;
        },
    },
};
