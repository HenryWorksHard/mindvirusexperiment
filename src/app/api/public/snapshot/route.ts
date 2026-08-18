import { NextResponse } from "next/server";
import { publicRateLimit } from "@/lib/auth/guard";
import { getLiveSnapshot } from "@/lib/public-data";
import { getCurrentExperiment } from "@/lib/experiment/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const limited = await publicRateLimit("snapshot", 90, 60_000);
  if (limited) return limited;
  const url = new URL(req.url);
  const requested = url.searchParams.get("experiment");
  const messages = Math.min(400, Math.max(10, Number(url.searchParams.get("messages") ?? 150)));
  const events = Math.min(300, Math.max(10, Number(url.searchParams.get("events") ?? 100)));
  const current = await getCurrentExperiment();
  const id = requested && /^[0-9a-f-]{36}$/i.test(requested) ? requested : current?.id ?? null;
  const snap = await getLiveSnapshot(id, { messageLimit: messages, eventLimit: events });
  return NextResponse.json({ ...snap, current_experiment_id: current?.id ?? null }, { headers: { "Cache-Control": "no-store" } });
}
