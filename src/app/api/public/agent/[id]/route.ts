import { NextResponse } from "next/server";
import { publicRateLimit } from "@/lib/auth/guard";
import { getAgentDetail } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = await publicRateLimit("agent", 120, 60_000);
  if (limited) return limited;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const detail = await getAgentDetail(id);
  if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}
