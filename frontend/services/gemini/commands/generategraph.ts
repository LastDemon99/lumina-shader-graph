import type { CommandContext, CommandInvocation } from './types';

export const matchGenerateGraph = (prompt: string) => String(prompt || '').trim().match(/^\/generategraph\b/i);

export async function runGenerateGraph(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
    const m = String(inv.prompt || '').trim().match(/^\/generategraph(?:\s+([\s\S]*))?$/i);
    if (!m) return false;

    const arg = (m[1] ?? '').trim();
    if (!arg && !inv.attachment) {
        ctx.setLinterLogs(prev => [...prev, 'GenerateGraph: provide a prompt or attach an image.']);
        return true;
    }

    // We explicitly use 'architect' agent
    await ctx.runGeminiPipeline(arg, inv.attachment);
    return true;
}
