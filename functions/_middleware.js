// Lets the GitHub Pages copy of the site (a different address) call this API.
const ALLOWED_ORIGINS = ["https://epecskull2020.github.io"];

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function onRequest({ request, next }) {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const response = await next();
  if (!Object.keys(cors).length) return response;
  const withCors = new Response(response.body, response);
  for (const [k, v] of Object.entries(cors)) withCors.headers.set(k, v);
  return withCors;
}
