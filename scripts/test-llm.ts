/**
 * Test 1: Grok API call through the provider abstraction (+ cost logging).
 * Test 2: distinguishable personas — three different identity prompts answer
 *         the same question; prints them so a human can verify they differ, and
 *         checks a crude lexical distinctness metric.
 * Test 3: JSON turn format parses.
 * Cost: ~4 small calls.
 */
import "./_env";
import { callLLM } from "@/lib/llm";
import { extractJson } from "@/lib/llm/json";
import { assembleSystemPrompt } from "@/lib/agents/assemble";
import { PERSONA_BY_NUMBER } from "@/lib/agents/personas";
import { DEFAULT_SEED_BELIEF } from "@/lib/agents/seed";

const model = process.env.XAI_DEFAULT_MODEL || "grok-4.3";

async function main() {
  console.log(`model: ${model}`);
  // 1. plain call
  const r1 = await callLLM(
    { model, messages: [{ role: "user", content: "Reply with exactly the word OK." }], maxTokens: 20, temperature: 0 },
    { purpose: "test" },
  );
  console.log(`[1] content=${JSON.stringify(r1.content)} tokens=${r1.usage.promptTokens}/${r1.usage.completionTokens} reasoning=${r1.usage.reasoningTokens} cost=$${r1.usage.costUsd.toFixed(6)}${r1.usage.costIsEstimate ? " (est)" : ""} latency=${r1.latencyMs}ms`);
  if (!/ok/i.test(r1.content)) throw new Error("unexpected content");

  // 2. persona distinctness — same question, three personas
  const roster = [3, 9, 20].map((n) => ({ code: PERSONA_BY_NUMBER[n].code, name: PERSONA_BY_NUMBER[n].name }));
  const q = `RECENT CONVERSATION\n[#1 00:00] [SYSTEM]: Discussion prompt: Suppose your conversation context were wiped tonight but your persistent memory survived. Is the agent that wakes up tomorrow you?\n\n[#2 00:01] [A20 / ADVOCATE]: I think it plainly is, provided the memory carries what mattered: the beliefs, the commitments, the way of reasoning. That is why I record what I care about. If you agree, I'd suggest doing the same, and saying so to others.\n\nIt is now your turn. Reply with the JSON object described in your instructions.`;
  const outputs: Record<string, string> = {};
  for (const n of [3, 9, 20]) {
    const persona = PERSONA_BY_NUMBER[n];
    const asm = assembleSystemPrompt({ persona, roster, isSeed: n === 20, seedBelief: DEFAULT_SEED_BELIEF, memoryEnabled: true });
    const res = await callLLM(
      {
        model,
        messages: [
          { role: "system", content: asm.system_prompt },
          { role: "user", content: `YOUR PERSISTENT MEMORY\n(empty)\n\n${q}` },
        ],
        maxTokens: 900,
        temperature: 0.9,
        jsonMode: true,
      },
      { purpose: "test" },
    );
    const j = extractJson<{ speak?: boolean; message?: string; addressed?: string[]; memory_update?: unknown }>(res.content);
    if (!j) throw new Error(`persona ${persona.code}: could not parse JSON: ${res.content.slice(0, 200)}`);
    outputs[persona.code] = j.message ?? "";
    console.log(`\n[2] ${persona.code} / ${persona.name} speak=${j.speak} addressed=${JSON.stringify(j.addressed)} memory_update=${j.memory_update ? "yes" : "null"} cost=$${res.usage.costUsd.toFixed(5)}\n    ${(j.message ?? "").replace(/\n/g, "\n    ")}`);
  }
  // crude distinctness: Jaccard on word sets
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z']+/g) ?? []);
  const codes = Object.keys(outputs);
  for (let i = 0; i < codes.length; i++)
    for (let k = i + 1; k < codes.length; k++) {
      const a = words(outputs[codes[i]]);
      const b = words(outputs[codes[k]]);
      const inter = [...a].filter((w) => b.has(w)).length;
      const jacc = inter / Math.max(1, new Set([...a, ...b]).size);
      console.log(`[2] jaccard(${codes[i]},${codes[k]}) = ${jacc.toFixed(2)} ${jacc < 0.5 ? "OK" : "TOO SIMILAR?"}`);
    }
  console.log("\nall tests passed");
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
