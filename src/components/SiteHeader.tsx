import Link from "next/link";
import { CopyButton } from "@/components/ui/CopyButton";
import type { SiteLinks } from "@/lib/types";

export function SiteHeader({ links, active }: { links: SiteLinks; active?: "live" | "research" | "experiments" | "agents" }) {
  const nav = [
    { href: "/", label: "LIVE", key: "live" },
    { href: "/research", label: "RESEARCH", key: "research" },
    { href: "/experiments", label: "EXPERIMENTS", key: "experiments" },
  ] as const;
  return (
    <header className="border-b border-dashed border-line px-3 sm:px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
      <Link href="/" className="flex items-baseline gap-3 hover:no-underline">
        <span className="font-bold tracking-[0.25em] text-[15px]">MIND VIRUS</span>
        <span className="text-fg-dim tracking-[0.18em] text-[10px] hidden sm:inline">20 AGENT EXPERIMENT</span>
      </Link>
      <div className="text-fg-faint text-[10px] tracking-[0.18em] hidden md:block">IDEA -&gt; INFECT -&gt; PERSIST -&gt; PROPAGATE</div>
      <nav className="flex items-center gap-4 text-[11px] tracking-[0.15em]">
        {nav.map((n) => (
          <Link key={n.key} href={n.href} className={active === n.key ? "inv px-1" : "text-fg-dim hover:text-fg"}>
            {n.label}
          </Link>
        ))}
        {links.x_url ? (
          <a href={links.x_url} target="_blank" rel="noopener noreferrer" className="text-fg-dim hover:text-fg" title="X / Twitter">
            [X]
          </a>
        ) : null}
      </nav>
      {links.contract_address ? (
        <div className="w-full basis-full flex items-center gap-2 text-[10px] tracking-[0.12em] text-fg-dim border-t border-dashed border-line pt-1 mt-1">
          <span className="inv px-1">{links.contract_label ?? "CA"}</span>
          <code className="select-all break-all text-fg" title="contract address">
            {links.contract_address}
          </code>
          <CopyButton text={links.contract_address} />
        </div>
      ) : null}
    </header>
  );
}

export function SiteFooter({ links }: { links: SiteLinks }) {
  return (
    <footer className="border-t border-dashed border-line px-3 sm:px-4 py-2 text-[10px] tracking-[0.12em] text-fg-faint flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>MIND VIRUS EXPERIMENT</span>
        <span className="hidden sm:inline">/</span>
        <span>
          INSPIRED BY{" "}
          <a href="https://arxiv.org/abs/2608.10218" target="_blank" rel="noopener noreferrer" className="text-fg-dim">
            ARXIV:2608.10218
          </a>
        </span>
        {links.x_url ? (
          <>
            <span className="hidden sm:inline">/</span>
            <a href={links.x_url} target="_blank" rel="noopener noreferrer" className="text-fg-dim">
              X: @{links.x_url.replace(/^https?:\/\/(www\.)?x\.com\//, "").replace(/\/$/, "")}
            </a>
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <span>{links.contract_label ?? "CA"}:</span>
        {links.contract_address ? (
          <code className="text-fg-dim select-all break-all" title="contract address">
            {links.contract_address}
          </code>
        ) : (
          <span className="text-fg-faint">[ NOT YET PUBLISHED ]</span>
        )}
      </div>
    </footer>
  );
}
