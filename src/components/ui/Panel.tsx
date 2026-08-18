import type { ReactNode } from "react";

/** ASCII-style dashed frame with "+" corners and an inset title. */
export function Panel({
  title,
  right,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`frame flex flex-col min-h-0 ${className}`}>
      {title ? <div className="frame-title">{title}</div> : null}
      {right ? <div className="absolute -top-2 right-3 bg-bg px-1 text-[10px] tracking-widest text-fg-dim">{right}</div> : null}
      <div className={`flex-1 min-h-0 pt-2 flex flex-col ${bodyClassName}`}>{children}</div>
      <span className="corner-bl" aria-hidden />
      <span className="corner-br" aria-hidden />
    </section>
  );
}

export function Row({ k, v, dim = false }: { k: string; v: ReactNode; dim?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-[2px]">
      <span className="text-fg-dim">{k}</span>
      <span className={dim ? "text-fg-dim" : ""}>{v}</span>
    </div>
  );
}

/** ASCII progress bar e.g. [######----] 12/20 */
export function Bar({ value, max, width = 20 }: { value: number; max: number; width?: number }) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const filled = Math.round(ratio * width);
  return (
    <span className="whitespace-pre">
      [{"#".repeat(filled)}
      <span className="text-fg-faint">{"-".repeat(width - filled)}</span>]
    </span>
  );
}
