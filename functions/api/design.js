// POST /api/design  ->  { html, url?, model, usage }
import { generateDesign, saveDesign, authorized, errorStatus, KINDS } from "../../lib/design.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: "Missing or wrong Authorization: Bearer token." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }
  try {
    const result = await generateDesign(env, body);
    const url = result.html ? await saveDesign(env, request, result.html) : null;
    return json({ ...result, url });
  } catch (err) {
    return json({ error: err.message }, errorStatus(err));
  }
}

// GET /api/design  ->  quick self-documentation
export function onRequestGet() {
  return json({
    usage: "POST JSON to this URL with header 'Authorization: Bearer <DESIGN_API_TOKEN>'.",
    fields: {
      prompt: "What to design (required for a new design)",
      kind: Object.keys(KINDS),
      brand: "Optional colors, fonts, tone",
      previous_html: "For revisions: the HTML you got back last time",
      feedback: "For revisions: what to change",
      effort: ["low", "medium", "high", "xhigh", "max"],
      dry_run: "true = only report which model would be used (free)",
      model: ["auto (default: a small router model picks)", "easy (Haiku)", "medium (Sonnet)", "hard (Opus)"],
    },
  });
}
