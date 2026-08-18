"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentRow, SiteLinks } from "@/lib/types";
import { SiteHeader, SiteFooter } from "@/components/SiteHeader";
import { AgentInspector } from "./AgentInspector";

export function AgentPageView({ agent, agents, links }: { agent: AgentRow; agents: AgentRow[]; links: SiteLinks }) {
  const router = useRouter();
  const [sel, setSel] = useState<AgentRow>(agent);
  return (
    <div className="min-h-dvh flex flex-col">
      <SiteHeader links={links} active="agents" />
      <main className="flex-1" />
      <SiteFooter links={links} />
      <AgentInspector key={sel.id} agent={sel} agents={agents} onClose={() => router.push("/")} onSelectAgent={setSel} />
    </div>
  );
}
