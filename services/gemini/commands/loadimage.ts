import type { CommandContext, CommandInvocation } from './types';

export const matchLoadImage = (prompt: string) => String(prompt || '').trim().match(/^\/loadimage\b/i);

export async function runLoadImage(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
    const m = String(inv.prompt || '').trim().match(/^\/loadimage\s*([\s\S]*)$/i);
    if (!m) return false;

    if (!inv.attachment) {
        ctx.setLinterLogs(prev => [...prev, 'LoadAsset: attach an image to load it as an asset.']);
        return true;
    }

    const userIntent = String(m[1] || '').trim();

    // Default name logic (no inference as requested)
    const defaultSnapshotName = `asset-${new Date().getTime()}`;
    ctx.addSessionAsset(inv.attachment, defaultSnapshotName);

    if (!userIntent) {
        ctx.setLinterLogs(prev => [...prev, `Asset saved as ${defaultSnapshotName}`]);
        return true;
    }

    ctx.setGenerationPhase('routing');
    const handleLog = (msg: string) => ctx.setLinterLogs(prev => [...prev, msg]);

    try {
        console.log('[LoadAsset] User Intent Text:', userIntent);
        const intent = await ctx.geminiService.inferLoadAssetIntent(userIntent, ctx.sessionAssets, inv.attachment, handleLog);
        console.log('[LoadAsset] Inferred Intent Object:', intent);

        if (intent && (intent.action === 'apply' || intent.action === 'edit')) {
            const isEdit = intent.action === 'edit';
            const isAi = intent.method === 'ai';

            handleLog(`Strategy: ${intent.action} via ${intent.method.toUpperCase()} (${Math.round(intent.confidence * 100)}% confidence).`);
            if (intent.reasoning) console.log('[LoadAsset] Reasoning:', intent.reasoning);

            if (isAi && isEdit) {
                // Generative AI modification (Image-to-Image)
                handleLog('Delegating to AI Texture Pipeline (Image-to-Image)...');
                await ctx.runGeminiTexturePipeline(userIntent, inv.attachment);
            } else {
                // Procedural/Graph modification or simple apply
                handleLog(`Delegating to Graph Editor Agent (${isEdit ? 'Modification' : 'Placement'})...`);
                const editorPrompt = isEdit
                    ? `The user just loaded an image and wants to EDIT it using shader nodes. Request: ${userIntent}. Action: Add the asset and build the node logic to achieve the effect.`
                    : `The user just loaded a new image asset and wants to use it as is. Request: ${userIntent}. Action: Add a texture node and connect it appropriately.`;

                await ctx.runGeminiPipeline(editorPrompt, inv.attachment);
            }
        } else {
            console.log('[LoadAsset] Action: Save only.');
            handleLog(`Asset saved (intent: save only).`);
        }
    } catch (e: any) {
        console.error(e);
        ctx.setLinterLogs(prev => [...prev, `LoadAsset error: ${e?.message || String(e)}`]);
    } finally {
        ctx.setGenerationPhase('idle');
    }

    return true;
}
