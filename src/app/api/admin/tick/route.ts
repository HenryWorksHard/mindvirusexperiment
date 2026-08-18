import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { runTick } from "@/lib/orchestrator/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Admin "kick": run one tick immediately (same code path as the heartbeat). */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const report = await runTick({ timeBudgetMs: 45_000, source: "admin" });
  return NextResponse.json(report);
}
