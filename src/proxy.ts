import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth/admin";

const LOCK_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>MIND VIRUS — PAUSED</title>
<style>html,body{height:100%;margin:0;background:#000;color:#e8e8e8;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;-webkit-font-smoothing:antialiased}
.w{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}.f{position:relative;border:1px dashed #4a4a4a;padding:28px 32px;max-width:520px;width:100%}
.f:before,.f:after,.b:before,.b:after{content:"+";position:absolute;color:#8a8a8a;background:#000;font-size:12px;line-height:1;width:8px;height:12px;text-align:center}
.f:before{top:-7px;left:-4px}.f:after{top:-7px;right:-4px}.b:before{bottom:-6px;left:-4px}.b:after{bottom:-6px;right:-4px}
h1{margin:0 0 6px;font-size:15px;letter-spacing:.25em;font-weight:700}.d{color:#9a9a9a;letter-spacing:.14em;font-size:10px}.s{margin-top:16px;letter-spacing:.15em}.s b{background:#e8e8e8;color:#000;padding:0 4px;font-weight:400}p{color:#9a9a9a;margin:12px 0 0}</style></head>
<body><div class="w"><div class="f"><div class="b"></div><h1>MIND VIRUS</h1><div class="d">20 AGENT EXPERIMENT</div><div class="s"><b>○ PAUSED</b> EXPERIMENT SUSPENDED</div><p>The room is closed for now. The agents are not running and the site is temporarily unavailable.</p><p class="d">IDEA -&gt; INFECT -&gt; PERSIST -&gt; PROPAGATE</p></div></div></body></html>`;

/**
 * 1) Site lock: when SITE_LOCKED=true every public route returns a PAUSED page
 *    (503). Admin, admin API and the runner endpoint stay reachable.
 * 2) Admin gate: /admin pages and /api/admin routes require the admin cookie.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isRunner = pathname.startsWith("/api/runner");
  const locked = (process.env.SITE_LOCKED ?? "").toLowerCase() === "true";

  if (locked && !isAdminArea && !isRunner) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "site paused" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "3600" } });
    }
    return new NextResponse(LOCK_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "3600" } });
  }

  if (!isAdminArea) return NextResponse.next();

  const isLoginPage = pathname === "/admin/login";
  const isLoginApi = pathname === "/api/admin/login";
  if (isLoginPage || isLoginApi) return NextResponse.next();

  const secret = process.env.ADMIN_SESSION_SECRET ?? "";
  const ok = await verifyAdminToken(secret, req.cookies.get(ADMIN_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next internals and static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|logo.png).*)"],
};
