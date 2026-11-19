// Video upscaling with kie.ai's own upscaler (model "video/upscale"; not Topaz, Kling or a chat model).
// POST /api/upscale?resolution=1080P|2K|4K
//   JSON { videoUrl }                       -> upscale a video that is already online (e.g. an AI 360° result)
//   multipart file + uploadPath + fileName  -> upload a recorded video to kie first
//   -> { taskId }
// GET  /api/upscale?taskId=...              -> { state, videoUrl?, error? }
import { authorized } from "../../lib/design.js";
import { streamUpload, createTask, checkTask } from "../../lib/kie.js";

const RESOLUTIONS = ["1080P", "2K", "4K"];
const json = (data, status = 200) => Response.json(data, { status });

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: "Missing or wrong access code." }, 401);
  if (!env.KIE_API_KEY) return json({ error: "KIE_API_KEY is not set on the server." }, 500);
  const resolution = new URL(request.url).searchParams.get("resolution") || "2K";
  if (!RESOLUTIONS.includes(resolution)) return json({ error: `resolution must be one of ${RESOLUTIONS.join(", ")}.` }, 400);

  try {
    let videoUrl;
    const type = request.headers.get("Content-Type") || "";
    if (type.startsWith("multipart/form-data")) {
      if (+request.headers.get("Content-Length") > 52_000_000) return json({ error: "Video is too big for kie.ai (max 50 MB)." }, 400);
      videoUrl = await streamUpload(env, request);
    } else {
      videoUrl = (await request.json().catch(() => ({}))).videoUrl;
      if (!/^https:\/\//.test(videoUrl || "")) return json({ error: "Send 'videoUrl' (https) or upload the video file." }, 400);
    }
    const task = await createTask(env, "video/upscale", { video_url: videoUrl, resolution });
    return json({ taskId: task.taskId });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

export async function onRequestGet({ request, env }) {
  if (!authorized(request, env)) return json({ error: "Missing or wrong access code." }, 401);
  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!taskId) return json({ error: "Add ?taskId=..." }, 400);
  try {
    return json(await checkTask(env, taskId));
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}
