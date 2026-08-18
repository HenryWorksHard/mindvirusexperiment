import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guard";
import { getAdminState } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const state = await getAdminState();
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
