"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    setBusy(false);
    if (res.ok) {
      router.replace("/admin");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setErr(j.error ?? `error ${res.status}`);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <form onSubmit={submit} className="frame p-6 w-full max-w-sm space-y-4">
        <div className="frame-title">ADMIN ACCESS</div>
        <div className="text-[11px] tracking-[0.2em] text-fg-dim">MIND VIRUS / CONTROL PANEL</div>
        <label className="block">
          <span className="label">PASSWORD</span>
          <input className="input mt-1" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {err ? <div className="text-[11px] text-fg">! {err}</div> : null}
        <button className="btn w-full" disabled={busy || !pw}>
          {busy ? "CHECKING…" : "ENTER"}
        </button>
        <span className="corner-bl" />
        <span className="corner-br" />
      </form>
    </div>
  );
}
