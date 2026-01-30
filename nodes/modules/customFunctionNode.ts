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
        code: `// Custom Function GLSL\n// Inputs: in1, in2\n// Output: out\n\nvoid CustomFunction(float a, float b, out vec3 result) {\n    result = vec3(a + b, 0.0, 1.0);\n}`,
        functionName: 'CustomFunction',
        inputNames: ['in1', 'in2'],
        outputName: 'out',
        inputValues: {
            in1: 0.5,
            in2: 0.5
        }
    }),
    glsl: {
        emit: (ctx) => {
            const code = ctx.node.data.code as string || '';
            const functionName = ctx.node.data.functionName as string || 'CustomFunction';
            const inputIds = ['in1', 'in2'];
            const outputId = 'out';

            // Inject the custom function definition
            ctx.functions.add(code);

            // Call the function
            const inputs = inputIds.map(id => ctx.getInput(ctx.id, id, '0.0', 'float'));
            const outVar = ctx.varName(ctx.id);

            ctx.body.push(`vec3 ${outVar};`);
            ctx.body.push(`${functionName}(${inputs.join(', ')}, ${outVar});`);

            ctx.variables[`${ctx.id}_${outputId}`] = { name: outVar, type: 'vec3' };
            return true;
        },
    },
    metadata: {
        headerColor: 'bg-indigo-900',
    }
};
