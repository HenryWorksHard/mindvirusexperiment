import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { ExperimentConfigSchema } from "@/lib/config/experiment";
import {
  pauseExperiment,
  resetExperiment,
  resumeExperiment,
  startExperiment,
  stopExperiment,
  updateDraftExperiment,
  updateLiveConfig,
} from "@/lib/experiment/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  action: z.enum(["start", "pause", "resume", "stop", "reset", "update", "live-config"]),
  title: z.string().max(120).optional(),
  seed_belief: z.string().min(20).max(2000).optional(),
  seed_label: z.string().min(2).max(40).optional(),
  config: ExperimentConfigSchema.partial().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const b = parsed.data;
  try {
    let exp;
    switch (b.action) {
      case "start": exp = await startExperiment(id); break;
      case "pause": exp = await pauseExperiment(id); break;
      case "resume": exp = await resumeExperiment(id); break;
      case "stop": exp = await stopExperiment(id, "stopped by admin"); break;
      case "reset": exp = await resetExperiment(id); break;
      case "update": exp = await updateDraftExperiment(id, { title: b.title, seed_belief: b.seed_belief, seed_label: b.seed_label, config: b.config }); break;
      case "live-config": exp = await updateLiveConfig(id, b.config ?? {}); break;
    }
    return NextResponse.json({ ok: true, experiment: exp });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
