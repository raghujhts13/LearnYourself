# OpenMAIC

**AI-assisted, curated e-learning authoring and classroom playback.** Describe what you want to teach (optionally attach a PDF), and the app helps generate structured **scenes**—slides, quizzes, and project-based flows—with narration (**speech** actions), visuals, and an interactive **stage** for presenting or exporting.

This document is the **canonical project README** for GitHub and collaborators. The short pointer at the root is [`README.md`](./README.md).

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.9.0-brightgreen)](https://nodejs.org/)

---

## Idea & goals

| | |
|--|--|
| **Problem** | Building consistent, narrated lesson sequences (slides + assessments + pacing) is slow and hard to keep aligned across languages and materials. |
| **Approach** | Use LLMs to propose **scene outlines**, then **scene content** and **timed actions** (speech, slide effects, whiteboard ops, etc.), with optional **web search**, **PDF context**, **image generation**, and **TTS**. |
| **Goals** | Give educators a **local-first / self-hostable** tool to iterate on AI-generated classrooms, refine in the **stage UI**, **publish or share** links, and **export** (e.g. PPTX and transcripts). |

**Package name** in `package.json` is `lys-curated-elearning`; the product direction is documented here as **OpenMAIC**.

---

## What’s in the project (current)

- **Home / authoring flow** — Requirements, language, optional PDF upload and image handling, web search toggles, generation session driving outlines and per-scene build steps.
- **Generation pipeline** — Server and client paths: outlines → per-scene **content** → **actions**; integration with `/api/generate/*` routes and streaming where implemented.
- **Stage & scenes** — Multi-scene **stage**: slide canvas (PPTist-style elements), **quiz** scenes, **PBL** project config; **playback** mode with action engine (speech, spotlight, laser, whiteboard draw/clear, video element playback, etc.).
- **Speaker notes / “transcript”** — Derived from **`speech` actions** by default; optional **user-edited `speakerNotes`** per scene; used in export and UI.
- **Whiteboard** — Drawing, text, shapes, charts, LaTeX, tables, lines; history and stage API integration.
- **Audio** — **TTS** (multiple providers via settings + `/api/generate/tts`) and **ASR** (browser / server transcription paths); configurable in **Settings**.
- **Media** — Optional **AI image generation** (provider-configured); IndexedDB storage for generated assets in the client flow; **server-side classroom jobs** can orchestrate media/TTS for published bundles.
- **PDF** — Parsing and vision-style use of PDF text/images in generation (`unpdf`, optional providers).
- **Web search** — Tavily-backed research context when enabled.
- **Classroom lifecycle** — Create/load classrooms, **learn** (student) view, **publish** / share flows, optional **tunnel** and **`PUBLIC_URL`** for links, optional **Vercel deploy** hook for sharing.
- **Internationalization** — `i18next` with locale JSON resources.
- **Tests** — Vitest unit tests; Playwright e2e scaffold.

---

## Tech stack

| Layer | Choices |
|--------|---------|
| **App** | [Next.js](https://nextjs.org/) 16 (App Router), [React](https://react.dev/) 19 |
| **Language** | TypeScript 5 |
| **UI** | Tailwind CSS 4, Radix / Base UI, [Motion](https://motion.dev/), [Lucide](https://lucide.dev/) icons |
| **State** | [Zustand](https://zustand-demo.pmnd.rs/) (persisted settings, stores) |
| **Client DB** | [Dexie](https://dexie.org/) (IndexedDB) for audio/media blobs |
| **LLM** | [Vercel AI SDK](https://sdk.vercel.ai/) / `ai`, provider modules for OpenAI, Anthropic, etc. |
| **Docs & export** | Custom PPTX pipeline (`pptxgenjs` workspace package), KaTeX / math, charts (ECharts) |
| **Tooling** | pnpm workspaces, ESLint, Prettier, Vitest, Playwright |

---

## Requirements

- **Node.js** ≥ **20.9.0** (see `engines` in `package.json`)
- **pnpm** (version pinned via `packageManager` in `package.json`; use `corepack enable` if needed)
- **API keys** only for providers you enable (LLM is required for generation; others optional—see `.env.example`)

---

## Quick start

```bash
git clone https://github.com/<your-org>/openMAIC.git
cd openMAIC/OpenMAIC
pnpm install
cp .env.example .env.local
# Edit .env.local — at minimum set keys for your chosen LLM provider
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

```bash
pnpm build
pnpm start
```

---

## Environment variables

All variables are **optional** except what your chosen providers require. Copy [`.env.example`](./.env.example) to `.env.local` and fill in values.

| Area | Examples (see `.env.example` for full list) |
|------|---------------------------------------------|
| **LLM** | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`, … |
| **TTS / ASR** | `TTS_OPENAI_API_KEY`, `ASR_OPENAI_API_KEY`, `ASR_QWEN_API_KEY`, … |
| **PDF** | `PDF_UNPDF_API_KEY`, `PDF_MINERU_API_KEY`, … |
| **Image** | `IMAGE_SEEDREAM_API_KEY`, `IMAGE_NANO_BANANA_API_KEY`, … |
| **Web search** | `TAVILY_API_KEY` |
| **Server defaults** | `DEFAULT_MODEL` (e.g. `openai:gpt-4o`) |
| **Public URL / share** | `PUBLIC_URL`, `TUNNEL_PROVIDER`, `VERCEL_TOKEN` (optional) |

Never commit `.env.local` or real secrets.

---

## NPM scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Next.js in development |
| `pnpm build` | Production build |
| `pnpm start` | Run production server |
| `pnpm lint` | ESLint |
| `pnpm check` | Prettier check |
| `pnpm format` | Prettier write |
| `pnpm test` | Vitest |
| `pnpm test:e2e` | Playwright |

`postinstall` builds workspace packages `mathml2omml` and `pptxgenjs`.

---

## Project layout (high level)

| Path | Role |
|------|------|
| `app/` | Next.js routes (UI + `app/api/*` route handlers) |
| `components/` | React components (stage, settings, generation, slide renderer, …) |
| `lib/` | Core logic: generation, AI providers, stores, server classroom pipeline, export, audio, PDF, web search |
| `packages/` | Workspace libs (mathml2omml, pptxgenjs) |
| `public/` | Static assets |
| `tests/` | Vitest tests |

---

## Roadmap / future scope (indicative)

- Deeper **access control** and multi-tenant classroom management
- Stronger **content safety** and moderation hooks for classroom generation
- **Richer templates** and pedagogy presets (grade level, duration, assessment mix)
- **Collaborative editing** and version history for stages
- **Additional export formats** and LMS integrations (SCORM, LTI, etc.)
- Expanded **provider** coverage and **local-only** presets for air-gapped installs
- Performance and **caching** for large PDFs and long classrooms

*(Priorities depend on maintainer and community input.)*

---

## Contributing

1. Open an issue to describe bugs or feature ideas.
2. Fork the repo and create a branch for your change.
3. Run `pnpm lint` and `pnpm test` before submitting a PR.
4. Keep commits focused and document any user-facing behavior in this file if needed.

---

## License

This project is **open source** under the [**GNU Affero General Public License v3.0**](https://www.gnu.org/licenses/agpl-3.0.html) (**AGPL-3.0**), as stated in `package.json`.

- If you **modify** the software and **run it as a network service**, AGPL obligations apply—review the license text (place a full copy in a root `LICENSE` file in the repository for GitHub’s license badge and clarity).
- This is **not** legal advice; consult counsel for compliance in your environment.

---

## Acknowledgments

Built with open-source libraries and APIs from the Next.js, React, and AI provider ecosystems. Thanks to all contributors and upstream projects.
