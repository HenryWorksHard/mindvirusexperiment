/**
 * Dev runner: repeatedly calls the tick endpoint of a running dev server.
 * Usage:  npm run runner            (uses APP_URL from .env.local)
 *         npm run runner -- --interval 8000
 * It only produces model calls when an experiment is in `running` state.
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: false });

const base = process.env.APP_URL ?? "http://localhost:3000";
const secret = process.env.RUNNER_SECRET;
if (!secret) {
  console.error("RUNNER_SECRET missing");
  process.exit(1);
}
const args = process.argv.slice(2);
const intervalArg = args.indexOf("--interval");
const interval = intervalArg >= 0 ? Number(args[intervalArg + 1]) : 8000;
const once = args.includes("--once");

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/runner/tick?source=dev-runner`, {
      method: "POST",
      headers: { "x-runner-secret": secret! },
    });
    const body = (await res.json()) as {
      skipped?: string;
      turns?: { agent: string; spoke: boolean; error?: string; passReason?: string }[];
      tagged?: number;
      judged?: number;
      finalMemoryWrites?: number;
      completed?: string;
      notes?: string[];
      ms?: number;
    };
    const t = new Date().toISOString().slice(11, 19);
    if (body.skipped) console.log(`[${t}] skip: ${body.skipped}`);
    else {
      const turns = (body.turns ?? []).map((x) => `${x.agent}${x.spoke ? "+" : "-"}${x.error ? "!" : ""}`).join(" ");
      console.log(
        `[${t}] turns=[${turns}] tagged=${body.tagged} judged=${body.judged} final=${body.finalMemoryWrites}${body.completed ? ` COMPLETED(${body.completed})` : ""} ${body.notes?.length ? "| " + body.notes.join("; ") : ""} (${body.ms}ms)`,
      );
      for (const x of body.turns ?? []) if (x.error) console.log(`   ${x.agent} error: ${x.error}`);
    }
  } catch (e) {
    console.log(`tick failed: ${(e as Error).message}`);
  }
  return Date.now() - started;
}

(async () => {
  console.log(`dev runner -> ${base} every ${interval}ms`);
  for (;;) {
    const took = await tick();
    if (once) break;
    await new Promise((r) => setTimeout(r, Math.max(1000, interval - took)));
  }
})();
