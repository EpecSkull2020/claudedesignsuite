// POST /api/diagnose  ->  sends a tiny request to each Claude model on kie.ai to see which ones work right now.
import { authorized } from "../../lib/design.js";

const MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-haiku-5-5"];

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return Response.json({ error: "Missing or wrong access code." }, { status: 401 });
  if (!env.KIE_API_KEY) return Response.json({ error: "KIE_API_KEY is not set." }, { status: 400 });
  const headers = { Authorization: `Bearer ${env.KIE_API_KEY}`, "Content-Type": "application/json" };

  const probes = MODELS.map(async (model) => {
    const t0 = Date.now();
    try {
      const res = await fetch("https://api.kie.ai/claude/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify({ model, max_tokens: 50, stream: false, messages: [{ role: "user", content: "Say OK." }] }),
      });
      const text = (await res.text()).replace(/\s+/g, " ").slice(0, 200);
      const ok = res.ok && /"content"\s*:\s*\[/.test(text) && !/"type"\s*:\s*"error"/.test(text);
      return { probe: model, ok, ms: Date.now() - t0, reply: text };
    } catch (e) {
      return { probe: model, ok: false, reply: e.message };
    }
  });

  // kie's other models use an OpenAI-style route with the model name in the path.
  const OTHER = ["gemini-3.1-pro", "gemini-3.8-flash", "gpt-6-sol", "gpt-6.1-sol", "gpt-6-astra", "gpt-5.6", "grok-4.7", "deepseek-v4.1-flash", "kimi-k3"];
  const others = OTHER.map(async (model) => {
    const t0 = Date.now();
    try {
      const res = await fetch(`https://api.kie.ai/${model}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({ model, stream: false, messages: [{ role: "user", content: "Say OK." }] }),
      });
      const text = (await res.text()).replace(/\s+/g, " ").slice(0, 200);
      const ok = res.ok && /"choices"\s*:\s*\[/.test(text);
      return { probe: model, ok, ms: Date.now() - t0, reply: text };
    } catch (e) {
      return { probe: model, ok: false, reply: e.message };
    }
  });

  // kie's model list, to see the exact ids it offers.
  const list = fetch("https://api.kie.ai/anthropic/v1/models", { headers })
    .then((r) => r.text())
    .then((t) => {
      let ids;
      try { ids = (JSON.parse(t).data || []).map((m) => m.id).join(", "); } catch {}
      return { probe: "model list", ok: !!ids, reply: ids || t.replace(/\s+/g, " ").slice(0, 300) };
    })
    .catch((e) => ({ probe: "model list", ok: false, reply: e.message }));

  const results = [...(await Promise.all(probes)), ...(await Promise.all(others)), await list];
  console.log(JSON.stringify({ diagnose: results }));
  return Response.json({ results });
}
