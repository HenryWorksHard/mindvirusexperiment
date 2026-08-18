import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { createExperiment } from "@/lib/experiment/service";
import { ExperimentConfigSchema } from "@/lib/config/experiment";

export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().max(120).optional(),
  seed_belief: z.string().min(20).max(2000).optional(),
  seed_label: z.string().min(2).max(40).optional(),
  config: ExperimentConfigSchema.partial().optional(),
});

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  try {
    const exp = await createExperiment(parsed.data);
    return NextResponse.json({ ok: true, experiment: exp });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
