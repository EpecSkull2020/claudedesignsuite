// Shared design engine used by both the REST API (/api/design) and the MCP endpoint (/mcp).
import Anthropic from "@anthropic-ai/sdk";
import { MOTION_BRIEF, addPlayer, stripPlayer } from "./motion.js";
import { pickModel } from "./router.js";

export const KINDS = {
  page: "a full, responsive web page or landing page",
  component: "a single UI component shown centered on a neutral canvas, with its key states (default, hover, disabled) side by side",
  app: "an interactive app screen or dashboard mock-up with realistic sample data and working tabs/buttons",
  slides: "a slide deck: 16:9 slides stacked vertically, each a <section class=\"slide\">, with arrow-key navigation",
  poster: "a single poster, flyer or social graphic at a fixed aspect ratio",
  motion: MOTION_BRIEF,
  logo: "a logo exploration: 4-6 distinct inline-SVG logo concepts on a grid, each labelled",
};

const SYSTEM = `You are a senior product designer and front-end engineer. You turn a brief into a polished, production-quality visual design delivered as ONE self-contained HTML file.

Rules for the file:
- Output ONLY the HTML document, starting with <!doctype html>. No commentary, no Markdown fences.
- All CSS in a <style> tag and all JS in a <script> tag. No external assets except Google Fonts and images from https://images.unsplash.com or https://picsum.photos. Prefer inline SVG for icons and illustrations.
- Define colors and spacing as CSS custom properties on :root. Support dark mode with prefers-color-scheme.
- Responsive down to 375px wide with no horizontal scrolling.
- Real, specific copy that fits the brief. Never lorem ipsum.

Design standards: a clear visual hierarchy, a deliberate type scale, generous whitespace, a restrained palette with one accent, consistent radii and shadows, accessible contrast (WCAG AA), and visible focus states. Avoid generic template looks; make one or two memorable choices that suit the brief.

When asked to revise an existing design, keep everything the feedback does not mention and return the full updated file.`;

// Uses kie.ai when KIE_API_KEY is set, otherwise Anthropic directly with ANTHROPIC_API_KEY.
async function callAnthropic(env, userText, effort, model) {
  if (!env.ANTHROPIC_API_KEY) throw new ProviderError("No API key on the server. Set KIE_API_KEY (or ANTHROPIC_API_KEY) in Cloudflare.");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  });
  return stream.finalMessage();
}

// kie.ai's Claude endpoint speaks Anthropic's Messages format. Streaming keeps long designs from timing out.
// kie documents no system field, so the instructions go at the top of the user message.
async function callKie(env, userText, model) {
  const res = await fetch("https://api.kie.ai/claude/v1/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.KIE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 32000,
      stream: true,
      messages: [{ role: "user", content: `${SYSTEM}\n\n---\n\n${userText}` }],
    }),
  });
  const type = res.headers.get("content-type") || "";
  // kie reports most errors as HTTP 200 with a JSON body like {"code":401,"msg":"..."}.
  if (!res.ok || !type.includes("event-stream")) {
    const body = await res.text();
    let msg = body.slice(0, 300);
    try {
      const j = JSON.parse(body);
      if (j.content) return j; // a plain, non-streamed reply
      msg = j.msg || j.message || j.error?.message || msg;
      if (j.code === 401) msg = "kie.ai rejected the API key. Check KIE_API_KEY in Cloudflare.";
      if (j.code === 402) msg = "Your kie.ai credits ran out. Top up at kie.ai.";
    } catch {}
    const err = new ProviderError(`kie.ai (model ${model}): ${msg}`);
    try { const j = JSON.parse(body); err.authProblem = j.code === 401 || j.code === 402; } catch {}
    throw err;
  }

  const message = { content: [{ type: "text", text: "" }], model, stop_reason: null, usage: {} };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === "message_start") { message.model = ev.message?.model || model; message.usage = ev.message?.usage || {}; }
      else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") message.content[0].text += ev.delta.text;
      else if (ev.type === "message_delta") { message.stop_reason = ev.delta?.stop_reason ?? message.stop_reason; Object.assign(message.usage, ev.usage || {}); }
      else if (ev.type === "error") throw new ProviderError(`kie.ai: ${ev.error?.message || "stream error"}`);
    }
  }
  return message;
}

/**
 * Generate or revise a design.
 * @param {object} env  Cloudflare env (needs KIE_API_KEY or ANTHROPIC_API_KEY)
 * @param {object} opts { prompt, kind?, brand?, previous_html?, feedback?, effort?, model?: "auto"|"easy"|"medium"|"hard" }
 * @returns {Promise<{html: string, model: string, usage: object}>}
 */
export async function generateDesign(env, opts) {
  const { prompt, brand, feedback, effort = "high" } = opts;
  // A design that already has the Motion player is a Motion design, whatever kind was sent.
  const isMotion = opts.kind === "motion" || /data-motion-player/.test(opts.previous_html || "");
  const kind = isMotion ? "motion" : opts.kind || "page";
  const previous_html = opts.previous_html && stripPlayer(opts.previous_html);
  if (!prompt && !feedback) throw new BadInput("Send a 'prompt' (new design) or 'feedback' + 'previous_html' (revision).");
  if (feedback && !previous_html) throw new BadInput("'feedback' needs 'previous_html' to revise.");
  if (!KINDS[kind]) throw new BadInput(`Unknown kind '${kind}'. Use one of: ${Object.keys(KINDS).join(", ")}.`);

  let userText;
  if (previous_html) {
    userText = `Here is the current design:\n\n${previous_html}\n\nRevise it with this feedback:\n${feedback || prompt}`;
  } else {
    userText = `Design ${KINDS[kind]}.\n\nBrief:\n${prompt}`;
  }
  if (brand) userText += `\n\nBrand / style guidance to follow:\n${brand}`;

  const route = await pickModel(env, { kind, prompt, feedback, isRevision: !!previous_html, choice: opts.model });
  if (opts.dry_run) return { dry_run: true, tier: route.tier, model: route.model, note: `Would use ${route.name} (${route.tier} job, chosen by ${route.how}).` };
  let message, note = `Made with ${route.name} (${route.tier} job, chosen by ${route.how}).`;
  if (env.KIE_API_KEY) {
    try {
      message = await callKie(env, userText, route.model);
    } catch (err) {
      // kie's Claude service sometimes errors on every request; fall back to Gemini on kie instead.
      if (!(err instanceof ProviderError) || err.authProblem) throw err;
      message = await callKieGemini(env, userText);
      note = `Claude isn't working on kie.ai right now, so this was made with ${message.model} instead of ${route.name}.`;
    }
  } else {
    message = await callAnthropic(env, userText, effort, route.model);
  }

  if (message.stop_reason === "refusal") {
    throw new BadInput(`Claude declined this request${message.stop_details?.explanation ? `: ${message.stop_details.explanation}` : "."}`);
  }
  const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!text.trim()) throw new ProviderError("The model sent back an empty design. Try again.");
  const html = isMotion ? addPlayer(cleanHtml(text)) : cleanHtml(text);
  return { note, tier: route.tier, html, model: message.model, usage: message.usage, truncated: message.stop_reason === "max_tokens" };
}

function cleanHtml(text) {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/<!doctype html|<html/i);
  return start > 0 ? body.slice(start) : body;
}

// Gemini on kie uses an OpenAI-style chat route with the model name in the path.
async function callKieGemini(env, userText, withLimit = true) {
  const model = env.KIE_FALLBACK_MODEL || "gemini-3.1-pro";
  const res = await fetch(`https://api.kie.ai/${model}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.KIE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      ...(withLimit ? { max_tokens: 32000 } : {}),
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userText },
      ],
    }),
  });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.includes("event-stream")) {
    const body = await res.text();
    let j;
    try { j = JSON.parse(body); } catch {}
    const text = j?.choices?.[0]?.message?.content;
    if (text) return { content: [{ type: "text", text }], model, stop_reason: j.choices[0].finish_reason === "length" ? "max_tokens" : "end_turn", usage: j.usage || {} };
    if (withLimit) return callKieGemini(env, userText, false); // retry once without the length setting
    throw new ProviderError(`kie.ai (model ${model}): ${j?.msg || j?.error?.message || body.slice(0, 300)}`);
  }

  const message = { content: [{ type: "text", text: "" }], model, stop_reason: "end_turn", usage: {} };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      const choice = ev.choices?.[0];
      if (choice?.delta?.content) message.content[0].text += choice.delta.content;
      if (choice?.finish_reason === "length") message.stop_reason = "max_tokens";
      if (ev.error) throw new ProviderError(`kie.ai (model ${model}): ${ev.error.message || "stream error"}`);
    }
  }
  return message;
}

export class BadInput extends Error {}
export class ProviderError extends Error {}

/** Checks the shared-secret bearer token so strangers can't spend your API credit. */
export function authorized(request, env) {
  if (!env.DESIGN_API_TOKEN) return true; // no token configured = open (local dev only)
  const header = request.headers.get("Authorization") || "";
  return header === `Bearer ${env.DESIGN_API_TOKEN}`;
}

export function errorStatus(err) {
  if (err instanceof BadInput) return 400;
  if (err instanceof ProviderError) return 502;
  if (err instanceof Anthropic.AuthenticationError) return 502;
  if (err instanceof Anthropic.RateLimitError) return 429;
  if (err instanceof Anthropic.APIError) return 502;
  return 500;
}

/** If a KV namespace is bound as DESIGNS, save the HTML and return a shareable view path. */
export async function saveDesign(env, request, html) {
  if (!env.DESIGNS) return null;
  const id = crypto.randomUUID().slice(0, 8);
  await env.DESIGNS.put(id, html, { expirationTtl: 60 * 60 * 24 * 30 });
  return `${new URL(request.url).origin}/d/${id}`;
}
