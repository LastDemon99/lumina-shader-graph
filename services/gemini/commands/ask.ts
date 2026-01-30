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

    ctx.setGenerationPhase('drafting'); // Use drafting to indicate thinking
    const handleLog = (msg: string) => ctx.setLinterLogs(prev => [...prev, msg]);

    try {
        const answer = await ctx.geminiService.askQuestion(
            question,
            ctx.nodes,
            ctx.connections,
            inv.attachedNodes,
            handleLog
        );
        if (answer && ctx.onAssistantResponse) {
            ctx.onAssistantResponse(answer);
        }
    } catch (e: any) {
        console.error(e);
        ctx.setLinterLogs(prev => [...prev, `Ask error: ${e?.message || String(e)}`]);
    } finally {
        ctx.setGenerationPhase('idle');
    }

    return true;
}
