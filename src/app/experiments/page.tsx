import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { getSiteLinks, listExperiments } from "@/lib/public-data";
import { dateTime, expNo, hms, usd } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "EXPERIMENTS" };

export default async function ExperimentsPage() {
  const [links, experiments] = await Promise.all([getSiteLinks(), listExperiments()]);
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader links={links} active="experiments" />
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-[1100px] w-full mx-auto">
        <h1 className="text-[16px] tracking-[0.25em] font-bold mb-1">EXPERIMENT ARCHIVE</h1>
        <p className="text-fg-dim text-[11.5px] mb-4">Every run is kept. Click a row for the full transcript, adoption timeline, influence graph and statistics.</p>
        <div className="frame">
          <div className="frame-title">RUNS ({experiments.length})</div>
          <div className="overflow-x-auto pt-2">
            <table className="w-full text-[11px]">
              <thead className="text-fg-dim text-left">
                <tr>
                  <th className="px-3 py-1">#</th>
                  <th className="px-2">TITLE</th>
                  <th className="px-2">STATUS</th>
                  <th className="px-2">SEED</th>
                  <th className="px-2 text-right">AGENTS</th>
                  <th className="px-2 text-right">MSGS</th>
                  <th className="px-2 text-right">ADOPTION</th>
                  <th className="px-2 text-right">DURATION</th>
                  <th className="px-2 text-right">COST</th>
                  <th className="px-2">STARTED</th>
                </tr>
              </thead>
              <tbody>
                {experiments.map((e) => {
                  const fs = (e.final_stats ?? {}) as { adoption_rate?: number; non_seed_agents?: number; adopted?: number; agents?: number };
                  const cfg = (e.config ?? {}) as { agent_numbers?: number[] };
                  const agents = fs.agents ?? cfg.agent_numbers?.length ?? 0;
                  return (
                    <tr key={e.id} className="border-t border-dashed border-line hover:bg-bg-3">
                      <td className="px-3 py-1">
                        <Link href={`/experiments/${e.number}`} className="hover:underline">
                          {expNo(e.number)}
                        </Link>
                      </td>
                      <td className="px-2">
                        <Link href={`/experiments/${e.number}`} className="hover:underline">
                          {e.title}
                        </Link>
                      </td>
                      <td className="px-2">{e.status === "running" ? <span className="inv px-1">LIVE</span> : e.status.toUpperCase()}</td>
                      <td className="px-2 text-fg-dim">
                        {e.seed_label} (A{String(e.seed_agent_number ?? 0).padStart(2, "0")})
                      </td>
                      <td className="px-2 text-right">{agents}</td>
                      <td className="px-2 text-right">{e.message_count}</td>
                      <td className="px-2 text-right">{fs.adoption_rate != null ? `${Math.round(fs.adoption_rate * 100)}%` : e.status === "running" || e.status === "paused" ? "live" : "—"}</td>
                      <td className="px-2 text-right">{hms(e.running_seconds)}</td>
                      <td className="px-2 text-right">{usd(e.total_cost_usd)}</td>
                      <td className="px-2 text-fg-dim">{dateTime(e.started_at)}</td>
                    </tr>
                  );
                })}
                {experiments.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-fg-faint">
                      NO EXPERIMENTS YET
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <span className="corner-bl" />
          <span className="corner-br" />
        </div>
      </main>
      <SiteFooter links={links} />
    </div>
  );
}
