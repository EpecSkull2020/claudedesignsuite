// Motion: Claude writes a deterministic canvas animation; this player adds playback controls and MP4 export.

export const MOTION_BRIEF = `a motion-graphics animation (like a short explainer, title sequence, animated chart or product promo).

Build it to this exact contract, because a player script is added afterwards:
- The page contains <canvas id="stage" width="1920" height="1080"> (or 1080x1920 / 1080x1080 if the brief asks for tall or square) and nothing else visible. Do not add any buttons or controls.
- Define window.MOTION = { duration: <seconds, 4-20>, render(t) { ... } }.
- render(t) draws the complete frame for time t (seconds) onto the canvas with the Canvas 2D API, clearing first. It must be a pure function of t: no Date, no performance.now(), no Math.random() (use a seeded random), no requestAnimationFrame, no state that depends on previous frames. Calling render(3.2) must always draw the same picture.
- Use easing functions (easeOutCubic, easeInOutQuart, springs) and staggered timing so motion feels designed, not linear. Plan scenes on a timeline.
- Images: load them before first render with crossOrigin="anonymous" from images.unsplash.com, and set window.MOTION.ready to a Promise that resolves when they are loaded. Fonts: load Google Fonts and include document.fonts.ready in that promise.
- Scale the canvas to fit the window with CSS (object-fit: contain on a black background); keep its pixel size fixed.`;

const PLAYER = String.raw`<script data-motion-player>
(() => {
  const M = window.MOTION, canvas = document.getElementById("stage");
  if (!M || !canvas || typeof M.render !== "function") return;
  const css = document.createElement("style");
  css.textContent = "#mp{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;align-items:center;background:rgba(20,20,20,.82);color:#fff;padding:8px 12px;border-radius:999px;font:13px system-ui,sans-serif;z-index:9;backdrop-filter:blur(6px)}#mp button{all:unset;cursor:pointer;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.14)}#mp button:focus-visible{outline:2px solid #fff}#mp input{width:min(40vw,320px)}";
  document.head.append(css);
  const bar = document.createElement("div");
  bar.id = "mp";
  bar.innerHTML = '<button id="mpPlay">Pause</button><input id="mpSeek" type="range" min="0" max="1000" value="0" aria-label="Scrub"><span id="mpTime">0.0s</span><button id="mpExport">Export MP4</button>';
  document.body.append(bar);
  const $ = (id) => document.getElementById(id);
  let playing = true, start = performance.now(), at = 0, exporting = false;

  function draw(t) {
    M.render(t);
    $("mpSeek").value = Math.round((t / M.duration) * 1000);
    $("mpTime").textContent = t.toFixed(1) + "s";
  }
  function loop(now) {
    requestAnimationFrame(loop);
    if (!playing || exporting) return;
    at = ((now - start) / 1000) % M.duration;
    draw(at);
  }
  $("mpPlay").onclick = () => {
    playing = !playing;
    if (playing) start = performance.now() - at * 1000;
    $("mpPlay").textContent = playing ? "Pause" : "Play";
  };
  $("mpSeek").oninput = () => {
    at = ($("mpSeek").value / 1000) * M.duration;
    start = performance.now() - at * 1000;
    draw(at);
  };

  async function exportVideo() {
    const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) throw new Error("This browser can't record video. Try Chrome or Safari.");
    exporting = true;
    const fps = 30, frames = Math.round(M.duration * fps);
    const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16000000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start(500);
    for (let i = 0; i <= frames; i++) {
      const due = performance.now() + 1000 / fps;
      draw((i / frames) * M.duration);
      track.requestFrame();
      $("mpExport").textContent = "Exporting " + Math.round((i / frames) * 100) + "%";
      await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
    }
    rec.stop();
    await done;
    exporting = false;
    start = performance.now() - at * 1000;
    $("mpExport").textContent = "Export MP4";
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) throw new Error("The export came out empty. Keep this tab in front while it exports.");
    return { blob, ext: mimeType.startsWith("video/mp4") ? "mp4" : "webm" };
  }
  function save({ blob, ext }) {
    // Inside the studio preview the parent page saves it; opened on its own, save directly.
    if (window.parent !== window) return window.parent.postMessage({ type: "motion-video", blob, ext }, "*");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "motion." + ext; a.click();
  }
  $("mpExport").onclick = () => !exporting && exportVideo().then(save, (e) => alert(e.message));
  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "motion-export" && !exporting) exportVideo().then(save, (err) => window.parent.postMessage({ type: "motion-error", message: err.message }, "*"));
  });

  Promise.resolve(M.ready).then(() => { start = performance.now(); requestAnimationFrame(loop); });
})();
</script>`;

/** Adds the player (controls + MP4 export) to a Motion design. */
export function addPlayer(html) {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, PLAYER + "\n</body>") : html + PLAYER;
}

/** Removes the player again, so a revision sends Claude only its own code. */
export function stripPlayer(html) {
  return html.replace(/<script data-motion-player>[\s\S]*?<\/script>\s*/i, "");
}
