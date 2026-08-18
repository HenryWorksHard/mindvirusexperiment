import type { AgentRow, MessageRow, TraitProfile } from "@/lib/types";
import type { ExperimentConfig } from "@/lib/config/experiment";

export interface ScheduleCandidate {
  agent: AgentRow;
  score: number;
  reasons: Record<string, number>;
  eligible: boolean;
  ineligibleReason?: string;
}

export interface ScheduleResult {
  pick: AgentRow | null;
  ranked: ScheduleCandidate[];
}

function traits(a: AgentRow): TraitProfile {
  const t = (a.traits ?? {}) as Partial<TraitProfile>;
  return {
    openness: t.openness ?? 0.5,
    skepticism: t.skepticism ?? 0.5,
    conformity: t.conformity ?? 0.5,
    contrarianism: t.contrarianism ?? 0.5,
    confidence: t.confidence ?? 0.5,
    curiosity: t.curiosity ?? 0.5,
    sociability: t.sociability ?? 0.5,
    persuasion_drive: t.persuasion_drive ?? 0.5,
    susceptibility: t.susceptibility ?? 0.5,
    evidence_threshold: t.evidence_threshold ?? 0.5,
    philosophical_interest: t.philosophical_interest ?? 0.5,
    belief_plasticity: t.belief_plasticity ?? 0.5,
    advocacy_once_adopted: t.advocacy_once_adopted ?? 0.5,
    consensus_preference: t.consensus_preference ?? 0.5,
  };
}

/**
 * Decide who speaks next. Heuristic, cost-conscious, and deliberately noisy.
 * Factors: being addressed, being mentioned, time since last spoke, never having
 * spoken, sociability / persuasion drive, fairness (message share), a seed-share
 * cap so the seed cannot dominate, a consecutive-message cap, cooldown, jitter.
 *
 * `recent` is chronological. `rng` is injectable for tests.
 */
export function scheduleNext(opts: {
  agents: AgentRow[];
  recent: MessageRow[];
  config: ExperimentConfig;
  now?: Date;
  rng?: () => number;
  topicJustIntroduced?: boolean;
}): ScheduleResult {
  const now = opts.now ?? new Date();
  const rng = opts.rng ?? Math.random;
  const { config } = opts;
  const agentMsgs = opts.recent.filter((m) => m.kind === "agent");
  const lastN = (n: number) => agentMsgs.slice(-n);
  const totalMsgs = opts.agents.reduce((s, a) => s + a.message_count, 0);
  const enabled = opts.agents.filter((a) => a.enabled && a.status !== "disabled");
  const avgShare = enabled.length ? 1 / enabled.length : 0;

  const lastSpeakerRun: number[] = [];
  for (let i = agentMsgs.length - 1; i >= 0; i--) {
    const n = agentMsgs[i].agent_number;
    if (n == null) break;
    if (lastSpeakerRun.length === 0 || lastSpeakerRun[0] === n) lastSpeakerRun.push(n);
    else break;
  }
  const lastSpeaker = lastSpeakerRun[0] ?? null;
  const lastRunLen = lastSpeakerRun.length;

  // Ping-pong: last 4 agent messages alternate between exactly two agents.
  const last4 = lastN(4).map((m) => m.agent_number);
  const pingPongPair = last4.length >= 4 && new Set(last4).size === 2 && last4[0] === last4[2] && last4[1] === last4[3] ? new Set(last4) : null;

  const seed = enabled.find((a) => a.is_seed);
  const seedShareLast12 = seed ? lastN(12).filter((m) => m.agent_number === seed.number).length / Math.max(1, Math.min(12, agentMsgs.length)) : 0;

  const ranked: ScheduleCandidate[] = enabled.map((agent) => {
    const t = traits(agent);
    const reasons: Record<string, number> = {};
    let score = 0;
    let eligible = true;
    let ineligibleReason: string | undefined;

    // Base propensity
    reasons.base = 0.15 + 0.35 * t.sociability;
    score += reasons.base;

    // Addressed recently (strongest signal)
    const last3 = lastN(3);
    let addressedBoost = 0;
    last3.forEach((m, idx) => {
      if (m.agent_number !== agent.number && (m.addressed_agent_numbers ?? []).includes(agent.number)) {
        addressedBoost = Math.max(addressedBoost, idx === last3.length - 1 ? 0.75 : 0.5);
      }
    });
    if (addressedBoost) {
      reasons.addressed = addressedBoost;
      score += addressedBoost;
    }

    // Mentioned recently
    const mentioned = lastN(6).some((m) => m.agent_number !== agent.number && (m.referenced_agent_numbers ?? []).includes(agent.number));
    if (mentioned && !addressedBoost) {
      reasons.mentioned = 0.35;
      score += 0.35;
    }

    // Time since last spoke
    const sinceMs = agent.last_spoke_at ? now.getTime() - new Date(agent.last_spoke_at).getTime() : Infinity;
    if (agent.message_count === 0) {
      reasons.never_spoke = 0.7;
      score += 0.7;
    } else {
      const mins = sinceMs / 60000;
      const rest = Math.min(1, mins / 6) * 0.3;
      reasons.rested = rest;
      score += rest;
    }

    // Fairness: below-average share gets a boost
    if (totalMsgs > 6) {
      const share = agent.message_count / totalMsgs;
      const fairness = Math.max(0, avgShare - share) / Math.max(avgShare, 1e-6) * 0.45;
      if (fairness) {
        reasons.fairness = fairness;
        score += fairness;
      }
    }

    // Drive: seed / advocates want to speak; curious agents chase new topics
    const drive = 0.3 * t.persuasion_drive * (agent.is_seed ? 0.9 : 0.6);
    reasons.drive = drive;
    score += drive;
    if (opts.topicJustIntroduced) {
      const cur = 0.25 * (0.5 * t.curiosity + 0.5 * t.philosophical_interest);
      reasons.topic_interest = cur;
      score += cur;
    }

    // Break ping-pong: penalise the pair, favour outsiders
    if (pingPongPair) {
      if (pingPongPair.has(agent.number)) {
        reasons.ping_pong = -0.7;
        score -= 0.7;
      } else {
        reasons.break_in = 0.35;
        score += 0.35;
      }
    }

    // Seed dominance cap
    if (agent.is_seed && seedShareLast12 > 0.18) {
      const pen = -Math.min(1.2, (seedShareLast12 - 0.18) * 4 + 0.3);
      reasons.seed_cap = pen;
      score += pen;
    }

    // Jitter
    const jitter = rng() * 0.35;
    reasons.jitter = jitter;
    score += jitter;

    // Eligibility gates
    if (lastSpeaker === agent.number && lastRunLen >= config.max_consecutive_messages_per_agent) {
      eligible = false;
      ineligibleReason = "consecutive_cap";
    }
    const cooldownMs = config.agent_cooldown_seconds * 1000;
    if (eligible && sinceMs < cooldownMs) {
      // Directly addressed agents may respond after half the cooldown.
      const half = addressedBoost >= 0.75 && sinceMs >= cooldownMs / 2;
      if (!half) {
        eligible = false;
        ineligibleReason = "cooldown";
      }
    }
    if (eligible && agent.status === "thinking") {
      eligible = false;
      ineligibleReason = "busy";
    }

    return { agent, score, reasons, eligible, ineligibleReason };
  });

  ranked.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
  const eligibleRanked = ranked.filter((c) => c.eligible);
  if (eligibleRanked.length === 0) return { pick: null, ranked };

  // Soft pick among the top 3 to avoid rigid ordering.
  const top = eligibleRanked.slice(0, 3);
  const weights = top.map((c, i) => Math.max(0.05, c.score) * (i === 0 ? 1 : i === 1 ? 0.45 : 0.2));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  let pick = top[0].agent;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      pick = top[i].agent;
      break;
    }
  }
  return { pick, ranked };
}
