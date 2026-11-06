// Picks a model for each request. A tiny model on Cloudflare (Llama 3.2 1B, free tier) rates the job
// easy / medium / hard; easy goes to Haiku, medium to Sonnet, hard to Opus. Fable is never used.

export const TIERS = {
  easy: { model: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
  medium: { model: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
  hard: { model: "claude-opus-5-5", name: "Claude Opus 5.5" },
};

const ROUTER_MODEL = "@cf/meta/llama-3.2-1b-instruct";

const ROUTER_PROMPT = `You rate how hard a design request is. Reply with exactly one word: easy, medium, or hard.

easy: small or simple. One component, a logo set, a poster, a small text or color change to an existing design.
medium: a normal single web page, a short slide deck, a simple animation, a moderate revision.
hard: many sections or screens, an interactive app or dashboard with working features, a long or complex animation, lots of specific requirements, or a big redesign.`;

/**
 * @param {object} env  needs the AI binding for the tiny model (falls back to simple rules without it)
 * @param {object} job  { kind, prompt, feedback, isRevision, choice }  choice: "auto" | "easy" | "medium" | "hard"
 * @returns {Promise<{tier: string, model: string, name: string, how: string}>}
 */
export async function pickModel(env, job) {
  if (job.choice && TIERS[job.choice]) return { tier: job.choice, ...TIERS[job.choice], how: "you" };

  let tier = null, how = "simple rules";
  if (env.AI) {
    try {
      const request = `${job.isRevision ? "Revision of an existing" : "New"} ${job.kind} design.\n${job.isRevision ? "Feedback" : "Brief"}: ${(job.feedback || job.prompt || "").slice(0, 1500)}`;
      const out = await env.AI.run(ROUTER_MODEL, {
        messages: [
          { role: "system", content: ROUTER_PROMPT },
          { role: "user", content: request },
        ],
        max_tokens: 5,
      });
      tier = String(out?.response || "").toLowerCase().match(/easy|medium|hard/)?.[0] || null;
      if (tier) how = "the router model";
    } catch {
      // Router unavailable or out of free quota; use the rules below.
    }
  }
  tier ||= ruleTier(job);
  // A short tweak to an existing design is always a small job.
  const words = (job.feedback || "").split(/\s+/).filter(Boolean).length;
  if (job.isRevision && words > 0 && words < 12) tier = "easy";
  // Animations and apps need careful code, so they never go below Sonnet.
  if (tier === "easy" && (job.kind === "motion" || job.kind === "app")) tier = "medium";
  return { tier, ...TIERS[tier], how };
}

function ruleTier({ kind, prompt = "", feedback = "", isRevision }) {
  const words = (isRevision ? feedback : prompt).split(/\s+/).filter(Boolean).length;
  if (isRevision) return words < 25 ? "easy" : words < 80 ? "medium" : "hard";
  if (["component", "logo", "poster"].includes(kind)) return words < 60 ? "easy" : "medium";
  if (["app", "motion"].includes(kind)) return words < 40 ? "medium" : "hard";
  return words < 50 ? "medium" : "hard";
}
