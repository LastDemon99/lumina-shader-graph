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

    ctx.setGenerationPhase('drafting');
    const handleLog = (msg: string) => ctx.setLinterLogs(prev => [...prev, msg]);

    try {
        console.log('[LoadAsset] User Intent Text:', userIntent);
        const intent = await ctx.geminiService.inferLoadAssetIntent(userIntent, handleLog);
        console.log('[LoadAsset] Inferred Intent Object:', intent);

        if (intent?.apply) {
            console.log('[LoadAsset] Action: Delegating to Editor agent.');
            handleLog('Intent detected: Apply to graph. Passing to Editor agent...');

            // We pass it to the Editor agent (which uses gemini-3-flash-preview by default for edits)
            // We explicitly mention the attachment is the new asset to be applied.
            const editorPrompt = `The user just loaded a new image asset and wants to use it. 
User request: ${userIntent}
Action: Add a texture node using the attached asset and connect it according to the request.`;

            await ctx.runGeminiPipeline(editorPrompt, inv.attachment);
        } else {
            console.log('[LoadAsset] Action: Save only.');
            handleLog(`Asset saved as ${defaultSnapshotName} (intent: save only).`);
        }
    } catch (e: any) {
        console.error(e);
        ctx.setLinterLogs(prev => [...prev, `LoadAsset error: ${e?.message || String(e)}`]);
    } finally {
        ctx.setGenerationPhase('idle');
    }

    return true;
}
