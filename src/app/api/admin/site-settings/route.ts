import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guard";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Body = z.object({
  x_url: z.string().url().max(200).nullable().optional(),
  contract_address: z.string().max(120).nullable().optional(),
  contract_label: z.string().max(20).nullable().optional(),
});

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const db = supabaseAdmin();
  const { data: cur } = await db.from("site_settings").select("value").eq("key", "links").maybeSingle();
  const value = { ...((cur?.value as Record<string, unknown>) ?? {}), ...parsed.data };
  const { error } = await db.from("site_settings").upsert({ key: "links", value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, value });
}
