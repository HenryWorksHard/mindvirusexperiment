"use client";
import { useMemo } from "react";
import type { AgentRow, BeliefStateRow, BeliefStage } from "@/lib/types";
import type { EdgeAgg } from "@/lib/public-data";
import { codeOf } from "@/lib/format";

export const STAGE_GLYPH: Record<BeliefStage, string> = {
  unexposed: "-",
  exposed: ".",
  engaged: ":",
  considering: "+",
  partial: "#",
  strong: "##",
  propagating: ">>",
};

const STAGE_TONE: Record<BeliefStage, number> = {
  unexposed: 0.35,
  exposed: 0.5,
  engaged: 0.62,
  considering: 0.74,
  partial: 0.85,
  strong: 1,
  propagating: 1,
};

export function NetworkMap({
  agents,
  beliefByNumber,
  edges,
  flash,
  onSelect,
  selected,
  compact = false,
}: {
  agents: AgentRow[];
  beliefByNumber: Map<number, BeliefStateRow>;
  edges: EdgeAgg[];
  flash: { source: number; target: number; at: number; id: string }[];
  onSelect: (agent: AgentRow) => void;
  selected?: number | null;
  compact?: boolean;
}) {
  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 46;
  const positions = useMemo(() => {
    const n = agents.length || 1;
    const map = new Map<number, { x: number; y: number }>();
    agents.forEach((a, i) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      map.set(a.number, { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
    });
    return map;
  }, [agents, cx, cy, r]);

  const maxW = Math.max(1, ...edges.map((e) => e.weight));
  const seedNumber = agents.find((a) => a.is_seed)?.number ?? null;

  return (
    <div className="w-full h-full flex flex-col">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full max-h-full" role="img" aria-label="Agent network map">
        {/* faint ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1c1c1c" strokeDasharray="2 4" />
        {/* edges */}
        {edges.map((e) => {
          const a = positions.get(e.source);
          const b = positions.get(e.target);
          if (!a || !b) return null;
          const w = e.weight / maxW;
          const est = e.estimated > 0;
          return (
            <line
              key={`${e.source}-${e.target}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={est ? "#ffffff" : "#8a8a8a"}
              strokeOpacity={0.12 + w * (est ? 0.6 : 0.4)}
              strokeWidth={est ? 1.2 : 0.8}
              strokeDasharray={est ? "1 3" : "4 4"}
            />
          );
        })}
        {/* reply flashes */}
        {flash.map((f) => {
          const a = positions.get(f.source);
          const b = positions.get(f.target);
          if (!a || !b) return null;
          return <line key={f.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeWidth={1.5} className="edge-flash" />;
        })}
        {/* nodes */}
        {agents.map((a) => {
          const p = positions.get(a.number)!;
          const b = beliefByNumber.get(a.number);
          const stage: BeliefStage = (b?.stage as BeliefStage) ?? "unexposed";
          const tone = a.is_seed ? 1 : STAGE_TONE[stage];
          const speaking = a.status === "speaking" || a.status === "thinking";
          const isSel = selected === a.number;
          const label = `[${a.code}]`;
          const glyph = a.is_seed ? "SEED" : STAGE_GLYPH[stage];
          const disabled = !a.enabled;
          const boxW = 46;
          const boxH = 18;
          return (
            <g key={a.id} transform={`translate(${p.x},${p.y})`} className="cursor-pointer" onClick={() => onSelect(a)}>
              {speaking ? <circle r={14} fill="none" stroke="#fff" className="pulse-ring" /> : null}
              {a.is_seed ? (
                <rect x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} fill="#fff" stroke="#fff" />
              ) : (
                <rect x={-boxW / 2} y={-boxH / 2} width={boxW} height={boxH} fill="#000" stroke={isSel ? "#fff" : "#4a4a4a"} strokeDasharray={isSel ? undefined : "2 2"} />
              )}
              <text
                x={0}
                y={4}
                textAnchor="middle"
                fontSize={compact ? 10 : 11}
                fontFamily="inherit"
                fill={a.is_seed ? "#000" : disabled ? "#3a3a3a" : `rgba(232,232,232,${tone})`}
                fontWeight={stage === "strong" || stage === "propagating" || a.is_seed ? 700 : 400}
              >
                {label}
              </text>
              <text x={0} y={boxH / 2 + 11} textAnchor="middle" fontSize={9} fontFamily="inherit" fill={a.is_seed ? "#fff" : disabled ? "#3a3a3a" : `rgba(232,232,232,${Math.max(0.35, tone)})`}>
                {disabled ? "OFF" : glyph}
              </text>
              {speaking ? (
                <text x={0} y={-boxH / 2 - 5} textAnchor="middle" fontSize={8} fill="#fff" className="blink">
                  {a.status === "thinking" ? "THINKING" : "SPEAKING"}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* center caption */}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={9} fill="#5c5c5c">
          {agents.length} AGENTS / 1 ROOM
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={9} fill="#5c5c5c">
          {seedNumber ? `SEED ${codeOf(seedNumber)}` : "NO SEED"}
        </text>
      </svg>
      {!compact ? (
        <div className="px-2 pb-1 text-[9px] leading-4 text-fg-faint tracking-wide flex flex-wrap gap-x-3">
          <span>- unexposed</span>
          <span>. exposed</span>
          <span>: engaged</span>
          <span>+ considering</span>
          <span># partial</span>
          <span>## strong</span>
          <span>&gt;&gt; propagating</span>
          <span className="inv px-1">SEED</span>
          <span>--- reply</span>
          <span>··· est. influence</span>
        </div>
      ) : null}
    </div>
  );
}
