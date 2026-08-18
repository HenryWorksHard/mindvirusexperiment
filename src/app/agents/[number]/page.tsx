import { notFound, redirect } from "next/navigation";
import { getCurrentExperiment } from "@/lib/experiment/service";
import { supabaseAdmin } from "@/lib/supabase/server";
import { AgentPageView } from "@/components/live/AgentPageView";
import { getSiteLinks } from "@/lib/public-data";

export const dynamic = "force-dynamic";

/** Standalone inspector page for the current experiment: /agents/07 */
export default async function AgentPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1 || n > 20) notFound();
  const exp = await getCurrentExperiment();
  if (!exp) redirect("/");
  const db = supabaseAdmin();
  const { data: agent } = await db.from("agents").select("*").eq("experiment_id", exp.id).eq("number", n).maybeSingle();
  if (!agent) notFound();
  const { data: agents } = await db.from("agents").select("*").eq("experiment_id", exp.id).order("number");
  const links = await getSiteLinks();
  return <AgentPageView agent={agent} agents={agents ?? []} links={links} />;
}
