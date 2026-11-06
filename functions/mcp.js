// POST /mcp  ->  a minimal MCP server (Streamable HTTP, JSON responses) so Claude Code can call the design tools.
import { generateDesign, saveDesign, authorized, KINDS } from "../lib/design.js";

const TOOLS = [
  {
    name: "create_design",
    description:
      "Create a polished visual design (web page, component, app screen, slide deck, poster or logo set) as one self-contained HTML file. Returns the HTML and, if storage is set up, a link to view it.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The design brief: what it is, who it's for, key content." },
        kind: { type: "string", enum: Object.keys(KINDS), default: "page" },
        brand: { type: "string", description: "Optional brand colors, fonts, tone." },
        effort: { type: "string", enum: ["low", "medium", "high", "xhigh", "max"], default: "high" },
        model: { type: "string", enum: ["auto", "easy", "medium", "hard"], default: "auto", description: "auto lets a small router model choose; easy = Haiku, medium = Sonnet, hard = Opus." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "revise_design",
    description: "Revise an existing HTML design with feedback. Pass the full previous HTML; returns the full updated HTML.",
    inputSchema: {
      type: "object",
      properties: {
        previous_html: { type: "string", description: "The current design's full HTML." },
        feedback: { type: "string", description: "What to change." },
        brand: { type: "string" },
        effort: { type: "string", enum: ["low", "medium", "high", "xhigh", "max"], default: "high" },
        model: { type: "string", enum: ["auto", "easy", "medium", "hard"], default: "auto", description: "auto lets a small router model choose; easy = Haiku, medium = Sonnet, hard = Opus." },
      },
      required: ["previous_html", "feedback"],
    },
  },
];

const reply = (id, result) => Response.json({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => Response.json({ jsonrpc: "2.0", id, error: { code, message } });

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return new Response("Unauthorized", { status: 401 });
  let msg;
  try {
    msg = await request.json();
  } catch {
    return fail(null, -32700, "Parse error");
  }
  const { id, method, params } = msg;

  // Notifications (no id) just get acknowledged.
  if (id === undefined) return new Response(null, { status: 202 });

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "claude-design-api", version: "1.0.0" },
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      const { name, arguments: args = {} } = params || {};
      if (!TOOLS.some((t) => t.name === name)) return fail(id, -32602, `Unknown tool: ${name}`);
      try {
        const result = await generateDesign(env, args);
        const url = await saveDesign(env, request, result.html);
        const summary = url ? `Design ready: ${url}` : "Design ready (no storage configured, so no view link). Save the HTML below to a .html file to view it.";
        return reply(id, {
          content: [
            { type: "text", text: summary + (result.note ? `\n${result.note}` : "") + (result.truncated ? "\nWarning: output hit the length limit and may be cut off." : "") },
            { type: "text", text: result.html },
          ],
        });
      } catch (err) {
        return reply(id, { isError: true, content: [{ type: "text", text: err.message }] });
      }
    }
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

export function onRequestGet() {
  return new Response("This MCP server only supports POST.", { status: 405, headers: { Allow: "POST" } });
}
