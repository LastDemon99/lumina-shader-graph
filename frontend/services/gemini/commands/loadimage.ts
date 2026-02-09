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

    // Delegate placement/editing decisions to the backend agent.
    // It will use shader graph ops to apply edits (preferred), and may call image generation if requested.
    await ctx.runGeminiPipeline(`/loadimage ${userIntent}`.trim(), inv.attachment, inv.selectedAssetId);

    return true;
}
