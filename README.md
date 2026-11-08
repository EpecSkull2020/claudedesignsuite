# Design Studio API

A design generator you can use from a web page, any script (REST API), or Claude Code (MCP). It runs Claude through kie.ai (set `KIE_API_KEY`) or directly through Anthropic (set `ANTHROPIC_API_KEY`).

## Where it lives

- Cloudflare (pages + design engine): https://claudedesignsuite.pages.dev
- GitHub Pages (pages only; designs are made by the Cloudflare engine): https://epecskull2020.github.io/claudedesignsuite/

To update GitHub Pages after changing files in `public/`: `git subtree push --prefix public origin gh-pages`

## Put it on Cloudflare

1. `npm install`
2. `npx wrangler login`
3. `npx wrangler pages deploy public` (the first run creates the project)
4. In the Cloudflare dashboard → your Pages project → Settings → Variables and Secrets, add:
   - `KIE_API_KEY`: your key from kie.ai/api-key (or `ANTHROPIC_API_KEY` from platform.claude.com)
   - `KIE_MODEL` (optional): defaults to `claude-opus-5-5`
   - `DESIGN_API_TOKEN`: any password you make up (this stops strangers from using your API credit)
5. Deploy again so the secrets take effect.

Optional view links: `npx wrangler kv namespace create DESIGNS`, paste the id into `wrangler.toml`, then deploy again. Each design then gets a `/d/<id>` link that lasts 30 days.

## Use it from Claude Code

```
claude mcp add --transport http design https://YOUR-PROJECT.pages.dev/mcp --header "Authorization: Bearer YOUR_DESIGN_API_TOKEN"
```

Then just ask Claude Code something like "use create_design to make a landing page for my bakery".

## Use it as a plain API

```
curl -X POST https://YOUR-PROJECT.pages.dev/api/design \
  -H "Authorization: Bearer YOUR_DESIGN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Pricing page for a dog-walking app","kind":"page"}'
```

Fields: `prompt`, `kind` (page, app, component, slides, poster, motion, logo), `brand`, `effort`, `model` (`auto` lets a tiny Cloudflare model pick: easy → Haiku, medium → Sonnet, hard → Opus; or force `easy`/`medium`/`hard`), `dry_run` (true = just show which model would be used). To revise, send `previous_html` + `feedback`.

## Camera Move (photo → video)

Open `/orbit` on your site. **Full 360° (AI)** mode uploads the photo to kie.ai and has the Kling 2.6 video model film a full turn around the object (uses kie credits, takes 1–5 minutes, needs the access code). **3D move (free)** mode works like this: Drop in any photo and it makes a video of a camera swinging, circling, pushing in or rising around the subject. It's free and needs no API key: a small depth AI runs in your browser. One photo has no back side, so the camera swings up to about 40°, not a full 360°. Keep the tab in front while it records.

## Run it on your Mac

Put `ANTHROPIC_API_KEY=...` and `DESIGN_API_TOKEN=...` in `.dev.vars`, then run `npm run dev` and open http://localhost:8788.
