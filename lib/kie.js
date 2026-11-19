// Shared helpers for kie.ai media jobs (uploads, tasks, polling).
export const KIE = "https://api.kie.ai";
export const UPLOAD = "https://kieai.redpandaai.co"; // kie's file uploads live on a separate host

function reasonFor(body, status) {
  return body.code === 401 ? "kie.ai rejected the API key." :
    body.code === 402 ? "Your kie.ai credits ran out. Top up at kie.ai." :
    body.code === 429 ? "Too many requests to kie.ai. Wait a few seconds and try again." :
    body.msg ? `kie.ai: ${body.msg}` : `kie.ai error (HTTP ${status})`;
}

/** JSON request to kie. kie answers HTTP 200 even for errors; the real status is in body.code. */
export async function kie(env, path, init = {}, host = KIE) {
  const res = await fetch(host + path, {
    ...init,
    headers: { Authorization: `Bearer ${env.KIE_API_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (body.code !== 200) throw new Error(reasonFor(body, res.status));
  return body.data;
}

/** Forwards a multipart upload (built by the browser) to kie's stream-upload endpoint untouched. */
export async function streamUpload(env, request) {
  const res = await fetch(UPLOAD + "/api/file-stream-upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.KIE_API_KEY}`, "Content-Type": request.headers.get("Content-Type") },
    body: request.body,
  });
  const body = await res.json().catch(() => ({}));
  if (body.code !== 200) throw new Error(reasonFor(body, res.status));
  const url = body.data?.downloadUrl || body.data?.fileUrl || body.data?.url;
  if (!url) throw new Error("kie.ai accepted the upload but sent no file link.");
  return url;
}

export function createTask(env, model, input) {
  return kie(env, "/api/v1/jobs/createTask", { method: "POST", body: JSON.stringify({ model, input }) });
}

/** One status check for any kie task: { state, videoUrl?, error? } */
export async function checkTask(env, taskId) {
  const d = await kie(env, `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
  if (d.state === "success") {
    let urls = d.response?.resultUrls;
    if (!urls) try { urls = JSON.parse(d.resultJson || "{}").resultUrls; } catch {}
    return { state: "success", videoUrl: urls?.[0] || null };
  }
  if (d.state === "fail") return { state: "fail", error: d.failMsg ? `kie.ai: ${d.failMsg}` : "kie.ai couldn't finish this job." };
  return { state: d.state || "waiting", progress: d.progress ?? null };
}
