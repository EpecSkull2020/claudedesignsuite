// GET /d/<id>  ->  renders a saved design (needs the DESIGNS KV binding)
export async function onRequestGet({ params, env }) {
  const html = env.DESIGNS && (await env.DESIGNS.get(params.id));
  if (!html) return new Response("Design not found (or expired).", { status: 404 });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
