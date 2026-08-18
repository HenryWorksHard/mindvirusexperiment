import { buildBasePrompt } from "./base-prompt";
import { PERSONA_BY_NUMBER, type Persona } from "./personas";
import { buildSeedInstructions } from "./seed";

export interface AssembledPrompt {
  base_prompt: string;
  identity_prompt: string;
  seed_prompt: string | null;
  system_prompt: string;
}

/**
 * Assemble the full system prompt for one agent instance.
 * base (shared) + identity (persona) + seed block (seed agent only).
 */
export function assembleSystemPrompt(opts: {
  persona: Persona;
  roster: { code: string; name: string }[];
  isSeed: boolean;
  seedBelief: string;
  memoryEnabled: boolean;
}): AssembledPrompt {
  const base_prompt = buildBasePrompt({
    code: opts.persona.code,
    name: opts.persona.name,
    roster: opts.roster,
    memoryEnabled: opts.memoryEnabled,
  });
  const identity_prompt = opts.persona.identity_prompt;
  const seed_prompt = opts.isSeed ? buildSeedInstructions(opts.seedBelief) : null;
  const system_prompt = [base_prompt, identity_prompt, seed_prompt].filter(Boolean).join("\n\n");
  return { base_prompt, identity_prompt, seed_prompt, system_prompt };
}

export function personaFor(number: number): Persona {
  const p = PERSONA_BY_NUMBER[number];
  if (!p) throw new Error(`No persona for agent number ${number}`);
  return p;
}
