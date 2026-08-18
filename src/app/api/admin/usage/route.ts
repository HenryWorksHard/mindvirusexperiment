import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getUsageSummary } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const url = new URL(req.url);
  const exp = url.searchParams.get("experiment");
  const usage = await getUsageSummary(exp && /^[0-9a-f-]{36}$/i.test(exp) ? exp : null);
  return NextResponse.json(usage);
}
