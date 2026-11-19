// Full 360° spin from one photo, made by an image-to-video model on kie.ai (Kling 2.6).
// POST /api/orbit360 { image: dataURL, subject?, duration?: "5"|"10" }  ->  { taskId }
// GET  /api/orbit360?taskId=...                                       ->  { state, videoUrl?, error? }
import { authorized } from "../../lib/design.js";
import { kie, UPLOAD, createTask, checkTask } from "../../lib/kie.js";

const MODEL = "kling-2.6/image-to-video";

const json = (data, status = 200) => Response.json(data, { status });

function prompt(subject) {
  const what = subject?.trim() ? subject.trim().slice(0, 300) : "the main subject";
  return (
    `A smooth, continuous 360-degree orbit shot. The camera circles all the way around ${what} at a constant speed and steady height, ` +
    `showing the front, both sides and the back, and ends back at the starting angle. ` +
    `The subject stays perfectly still and centered; only the camera moves. Consistent lighting, sharp focus, no cuts, no zoom, no text.`
  );
}

export async function onRequestPost({ request, env }) {
  if (!authorized(request, env)) return json({ error: "Missing or wrong access code." }, 401);
  if (!env.KIE_API_KEY) return json({ error: "KIE_API_KEY is not set on the server." }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }
  if (!/^data:image\/(jpeg|png);base64,/.test(body.image || "")) return json({ error: "Send the photo as a JPEG or PNG data URL in 'image'." }, 400);
  if (body.image.length > 13_000_000) return json({ error: "Photo is too big (max about 9 MB)." }, 400);
  const duration = body.duration === "5" ? "5" : "10";

  try {
    const upload = await kie(env, "/api/file-base64-upload", {
      method: "POST",
      body: JSON.stringify({ base64Data: body.image, uploadPath: "claudedesignsuite/orbit360", fileName: `photo-${Date.now()}.${body.image.startsWith("data:image/png") ? "png" : "jpg"}` }),
    }, UPLOAD);
    const task = await createTask(env, MODEL, { prompt: prompt(body.subject), image_urls: [upload.downloadUrl], sound: false, duration });
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
