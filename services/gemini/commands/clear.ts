import type { CommandContext, CommandInvocation } from './types';

export const matchClear = (prompt: string) => String(prompt || '').trim().match(/^\/clear\b/i);

export async function runClear(inv: CommandInvocation, ctx: CommandContext): Promise<boolean> {
    const m = String(inv.prompt || '').trim().match(/^\/clear\b/i);
    if (!m) return false;

    // This is handled by the UI (GeminiAssistantSidebar.tsx) for messages,
    // but we return true here so the dispatcher knows it's a valid command 
    // and doesn't try to pass it to the generic AI pipeline.
    return true;
}
