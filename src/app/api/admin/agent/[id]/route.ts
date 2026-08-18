import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { clearAgentContext, clearAgentMemory, getAgentPrompt, setAgentEnabled, triggerAgentTurn } from "@/lib/experiment/agent-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ action: z.enum(["turn", "enable", "disable", "clear-context", "clear-memory"]) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    switch (parsed.data.action) {
      case "turn": return NextResponse.json({ ok: true, result: await triggerAgentTurn(id) });
      case "enable": await setAgentEnabled(id, true); break;
      case "disable": await setAgentEnabled(id, false); break;
      case "clear-context": await clearAgentContext(id); break;
      case "clear-memory": await clearAgentMemory(id); break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Admin-only: view the assembled system prompt. Never public. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const p = await getAgentPrompt(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ base_prompt: p.base_prompt, identity_prompt: p.identity_prompt, seed_prompt: p.seed_prompt, system_prompt: p.system_prompt });
}
