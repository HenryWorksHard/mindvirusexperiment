import { NextResponse } from "next/server";
import { requireRunnerSecret } from "@/lib/auth/guard";
import { runTick } from "@/lib/orchestrator/tick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Orchestration heartbeat. Idempotent + lease-guarded, so it is safe to call
 * from several drivers at once (pg_cron in prod, scripts/runner.ts in dev,
 * a manual admin "kick"). Does nothing unless an experiment is `running`.
 */
async function handle(req: Request) {
  const denied = await requireRunnerSecret(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const budget = Math.min(52_000, Math.max(5_000, Number(url.searchParams.get("budget") ?? 48_000)));
  const report = await runTick({ timeBudgetMs: budget, source: url.searchParams.get("source") ?? "http" });
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
