import type { CommandContext, CommandInvocation } from './types';

export const matchEditGraph = (prompt: string) => String(prompt || '').trim().match(/^\/editgraph\b/i);

export async function runEditGraph(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
    const m = String(inv.prompt || '').trim().match(/^\/editgraph(?:\s+([\s\S]*))?$/i);
    if (!m) return false;

    const arg = (m[1] ?? '').trim();
    if (!arg && !inv.attachment) {
        ctx.setLinterLogs(prev => [...prev, 'EditGraph: provide edit instructions.']);
        return true;
    }

    // We explicitly use 'editor' agent (runGeminiPipeline handles agent selection or we could force it if needed, 
    // but usually /editgraph implies editor mode which is the default for existing graphs unless forced)
    // Actually, runGeminiPipeline will detect the slash command and force the agent.
    await ctx.runGeminiPipeline(inv.prompt || '', inv.attachment);
    return true;
}
