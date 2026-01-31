import type { NodeModule } from '../types';

export const customFunctionNode: NodeModule = {
    type: 'customFunction',
    definition: {
        type: 'customFunction',
        label: 'Custom Function',
        inputs: [
            { id: 'in1', label: 'In 1', type: 'float' },
            { id: 'in2', label: 'In 2', type: 'float' },
        ],
        outputs: [{ id: 'out', label: 'Out', type: 'vec3' }],
    },
    ui: {
        width: 'wide',
        preview: { enabled: true },
        sections: [],
    },
    initialData: () => ({
        code: `// Custom Function GLSL\n// IMPORTANT:\n// - Define exactly one: void main(...)
//   Respect:
//     - Inputs (Arguments): must match this node's sockets count/order.
//     - Outputs (Out Params): declare outputs using 'out' qualifiers matching output sockets.
//   Expected Signature example: void main(float in1, float in2, out vec3 result)\n//   In node previews, 'texture' sockets behave like an already-sampled color (vec4 RGBA).\n// - Available Constants: PI, TAU, PHI, E, SQRT2.\n// - Available Globals: u_time (float), u_cameraPosition (vec3).\n// - Available Varyings: vUv (vec2), vPosition (vec3), vNormal (vec3), vColor (vec4).\n\nvoid main(float in1, float in2, out vec3 result) {\n    result = vec3(in1 + in2, 0.0, 1.0);\n}`,
        functionName: 'main',
        inputNames: ['in1', 'in2'],
        outputName: 'result',
        inputValues: {
            in1: 0.5,
            in2: 0.5
        }
    }),
    glsl: {
        emit: (ctx) => {
            const code = ctx.node.data.code as string || '';
            const internalName = `func_${ctx.id.replace(/-/g, '_')}`;
            const sanitizedId = ctx.id.replace(/-/g, '_');
            const needsLocalFragCoord = ctx.mode === 'fragment' && /\bgl_FragCoord\b/.test(code);
            const localFragCoordVar = `lumina_gl_FragCoord_${sanitizedId}`;

            // Automatic Type Mapping: Convert high-level types to GLSL ES 1.0 types
            const mapType = (type: string) => {
                if (type === 'texture') return 'sampler2D';
                if (type === 'textureArray') return 'sampler2DArray';
                return type;
            };

            // Automatic Renaming: Change 'void main' to the unique internal name
            // This allows the user to use the 'main' convention without collisions.
            let processedCode = code.replace(/void\s+main\s*\(/g, `void ${internalName}(`);

            // Internal behavior: previews render into sub-viewports, so gl_FragCoord is offset
            // by the viewport origin. To keep user code consistent, we remap gl_FragCoord to
            // local coords *only inside this custom function* when referenced.
            if (needsLocalFragCoord) {
                processedCode = [
                    `#ifndef LUMINA_CUSTOM_FUNCTION_LOCAL_FRAGCOORD_${sanitizedId}`,
                    `#define LUMINA_CUSTOM_FUNCTION_LOCAL_FRAGCOORD_${sanitizedId}`,
                    `vec4 ${localFragCoordVar};`,
                    `#endif`,
                    `#define gl_FragCoord ${localFragCoordVar}`,
                    processedCode,
                    `#undef gl_FragCoord`,
                ].join('\n');
            }

            ctx.functions.add(processedCode);

            const inputsList = ctx.node.inputs;
            const outputsList = ctx.node.outputs;

            // Prepare inputs
            const inputs = inputsList.map(socket => ctx.getInput(ctx.id, socket.id, '0.0', socket.type));

            // Prepare outputs (may have multiple)
            const outVars = outputsList.map(outSocket => {
                const v = ctx.varName(ctx.id, outSocket.id);
                // CRITICAL: WebGL 1.0 does not allow local sampler variables or sampler out params.
                // We only declare local variables for non-sampler types.
                if (outSocket.type !== 'texture' && outSocket.type !== 'textureArray') {
                    ctx.body.push(`${mapType(outSocket.type)} ${v};`);
                }
                return v;
            });

            if (needsLocalFragCoord) {
                ctx.body.push(`${localFragCoordVar} = vec4(gl_FragCoord.xy - u_viewPort.xy, gl_FragCoord.zw);`);
            }

            // Call the renamed internal function
            ctx.body.push(`${internalName}(${[...inputs, ...outVars].join(', ')});`);

            // Register output variables for downstream nodes
            outputsList.forEach((outSocket, i) => {
                ctx.variables[`${ctx.id}_${outSocket.id}`] = { name: outVars[i], type: outSocket.type };
            });

            return true;
        },
    },
    metadata: {
        headerColor: 'bg-indigo-900',
    }
};
