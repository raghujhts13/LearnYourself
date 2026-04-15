# LYS

**AI-assisted, local-first e-learning authoring and classroom delivery platform.**

LYS helps educators generate, edit, present, and share interactive classes from topic prompts or uploaded documents (`PDF`, `DOCX`, `TXT`, `PPT`, `PPTX`).

The app combines AI scene generation, media narration, live presentation controls, class note-taking, and publish/share flows in a single Next.js project.

---

## What the project currently does

### Core product flows
- **Classroom dashboard (`/`)**: create/rename/delete classrooms, add classes, manage unclassified classes.
- **Generation preview (`/generation-preview`)**: guided pipeline view for parsing, web research, outline creation, and first-scene generation.
- **Professor stage (`/classroom/[id]`)**: playback controls, scene navigation, whiteboard, speaker notes, Q&A sidebar, slide editing, and export options.
- **Student view (`/learn/[id]`)**: read-only classroom playback for published classes.
- **Journal (`/journal`, `/journal/[classroomId]`)**: cross-classroom notes explorer with search and inline editing.

### Generation and content
- **Two generation modes**:
  - `ai`: generate from requirements + optional source document
  - `from-slides`: parse PPT/PPTX and derive outlines/content from uploaded slides
- **Document parsing**: unified parser route for `PDF`, `DOCX`, `TXT`, `PPT`, `PPTX`.
- **Web search augmentation**: Tavily or Claude web-search-backed context before outline generation.
- **Scene types supported**: slides + interactive flows (quiz and PBL flows).

### Stage and teaching UX
- **Interactive presentation canvas** with spotlight and laser overlays.
- **Whiteboard overlay** with draw/pan/shape/text/erase tools + history snapshots.
- **Auto-resume generation** for pending outlines when a class is reopened.
- **Playback persistence** (scene/action position restored from IndexedDB).
- **Export menu**: PPTX export, resource pack export, transcript download.

### Notes and journaling
- **Per-class Notes panel** in stage (rich-text ProseMirror editor, autosave).
- **Global Journal FAB + right drawer** available throughout the app.
- **Journal pages** organized by classroom (chapter) and class session (section).

### Publishing, sharing, and deployment
- **Publish API**: stores classroom payload (stage/scenes/media/audio) server-side and returns share URL.
- **Unpublish API**: removes published classroom artifacts.
- **Public URL resolution**: detects explicit/public/tunneled base URL.
- **Optional “Deploy to Vercel” route**: stages project and returns student `learn` URL (requires `VERCEL_TOKEN`).

### Local-first storage model
- Uses Dexie/IndexedDB for classrooms, stages, scenes, audio/media blobs, playback state, and class notes.
- Server filesystem storage is used for published classroom artifacts and student-facing links.

---

## Technology stack

| Layer | Tools |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript 5 |
| Styling/UI | Tailwind CSS 4, Base UI, Radix UI, Motion, Lucide, Sonner |
| State | Zustand |
| Local persistence | Dexie (IndexedDB) |
| AI runtime | Vercel AI SDK (`ai`) + provider adapters |
| LLM providers | OpenAI, Anthropic, Ollama (configured via settings/env) |
| Document parsing | `unpdf` / `mineru` (PDF), `mammoth` (DOCX), `officeparser` (PPT/PPTX) |
| Rich text notes | ProseMirror modules |
| Rendering/math/charts | KaTeX, ECharts |
| Export pipeline | Workspace `pptxgenjs` + `mathml2omml` |
| Testing | Vitest, Playwright |
| Tooling | pnpm workspaces, ESLint, Prettier |

---

## API surface (high level)

Key route groups under `app/api`:
- `generate/*`: scene outlines/content/actions, TTS, image/video generation
- `generate-classroom/*`: class-generation pipeline endpoints
- `parse-document`, `parse-pdf`: source file parsing
- `web-search`: Tavily/Claude search integration
- `transcription`, `azure-voices`: ASR + Azure voice listing
- `classroom`, `classroom/publish`, `classroom/deploy-vercel`: storage/share/deploy
- `public-url`: externally reachable URL resolution
- `verify-*`: provider/model/media verification routes

---

## Local setup

### Requirements
- Node.js `>=20.9.0`
- `pnpm` (recommended via `corepack enable`)

### Install and run
```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open `http://localhost:3000`.

### Build and test
```bash
pnpm build
pnpm start
pnpm lint
pnpm test
pnpm test:e2e
```

---

## Provider configuration notes

Most integrations are optional; configure only what you use in `.env.local` or UI Settings.

Common variables:
- LLM: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, optional `OLLAMA_BASE_URL`
- PDF parsing: `PDF_UNPDF_API_KEY`, `PDF_MINERU_API_KEY`
- TTS/ASR: `TTS_*`, `ASR_*`
- Web search: `TAVILY_API_KEY` (Claude search can use Anthropic key)
- Sharing/deploy: `PUBLIC_URL`, tunnel vars, optional `VERCEL_TOKEN`

For full variable list and comments, see `.env.example`.

---

## Future Scope / pending actions (in order of priority [WIP])

*(Placeholder for future scope)*
- [x] Integrate notes within classes that can be edited inside and outside the classes
- [x] test claude web search functionality
- [x] Allow multifile upload and parsing
- [x] check if uploaded files during class generation is getting saved under materials/ assets inside classroom folders
- [ ] Connect with Wikipedia llama loader for wiki information without internet search when enabled
- [ ] Unarchive and integrate video generation into classroom flow
- [ ] Find a way to render and edit user PPT (instead of AI generation)
- [ ] Deploy classrooms and classes with all AI features enabled
- [ ] Classrooms and classes are web cached (should add cloud sync or some persist mechanism)
- [ ] Test the custom domain deployment
- [ ] update this readme file to include all the functionalities and step-by-step explanation of whats happening under the hood (or add a medium article and link it here)
---

## Project lineage

This project extends [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) and adds classroom and delivery workflows specific to LYS. It also integrates the project [Puter](https://github.com/HeyPuter) since it is interesting.

---


