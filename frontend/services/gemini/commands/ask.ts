import type { CommandContext, CommandInvocation } from './types';

export const matchAsk = (prompt: string) => String(prompt || '').trim().match(/^\/ask\b/i);

export async function runAsk(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
    const m = String(inv.prompt || '').trim().match(/^\/ask\s+([\s\S]+)$/i);
    if (!m) return false;

    const question = String(m[1] || '').trim();
    if (!question) {
        ctx.setLinterLogs(prev => [...prev, 'Ask: Please provide a question. Example: /ask how to create a water shader?']);
        return true;
    }

    // Backend handles answering (and may decide whether to emit ops or not).
    await ctx.runGeminiPipeline(`/ask ${question}`.trim(), inv.attachment, inv.selectedAssetId);

    return true;
}
