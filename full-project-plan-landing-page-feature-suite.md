# Full Project Plan — Landing Page Rebuild & Feature Suite

## Current Architecture Summary

| Concept | Current Code | Maps To User's Concept |
| --- | --- | --- |
| `Stage` | one AI-generated course | "Class" (a single session) |
| `Scene` | slide/quiz within a stage | slide/quiz within a class |
| `FolderRecord` | loose grouping UI only | precursor to "Classroom" |
| File support | PDF only | needs DOCX, TXT, PPT, PPTX |
| Quiz | scene type exists | no on/off toggle at creation |
| Notes | `speakerNotes` per scene | no unified journal |

---

## Target Hierarchy

```
Classroom (new container entity)
  └── Class Session  (= current Stage, gains classroomId)
        ├── Scene (slide)
        ├── Scene (quiz)   ← professor-controlled toggle
        └── speakerNotes   → feeds into Journal
```

---

## Phase 1 — Data Model Extensions

**Files:** `lib/types/stage.ts`, `lib/utils/database.ts`, `lib/utils/stage-storage.ts`

- Add `ClassroomRecord` type: `{ id, name, description, createdAt, updatedAt }`
- Extend `Stage` with `classroomId?: string`, `sessionDate?: number`
- Add `classrooms` table to IndexedDB schema in `lib/utils/database.ts`
- Add CRUD: `createClassroom`, `listClassrooms`, `renameClassroom`, `deleteClassroom`, `moveStageToClassroom`
- Migration: on first load, convert existing `FolderRecord`s → `ClassroomRecord`s and assign `classroomId` to their stages

---

## Phase 2 — Multi-Format File Support (DOCX, TXT, PPT/PPTX)

**Files:** `app/api/parse-document/route.ts` (new, replaces `parse-pdf`), `lib/document/` (new folder)

- Keep `/api/parse-pdf` as a **backward-compat alias**
- Add `/api/parse-document` that routes by MIME type:
  - **`.txt`** → trivial read
  - **`.docx`** → `mammoth` npm package for text extraction
  - **`.ppt/.pptx`** → `pptx2json` for text + notes; headless LibreOffice or `pptx-to-images` for slide images (returns `slides[{ index, text, imageBase64, notes }]`)
- Update `GenerationToolbar` (`components/generation/generation-toolbar.tsx`):
  - `accept=".pdf,.docx,.txt,.ppt,.pptx"`
  - Max size validation per type
  - Rename "PDF" copy → "Document"
- Store file in IndexedDB the same way as `storePdfBlob` (rename to `storeDocumentBlob`)

---

## Phase 3 — Generation Mode Selection (AI vs. Uploaded Slides)

**Files:** `components/generation/generation-toolbar.tsx`, `app/page.tsx`, `app/generation-preview/types.ts`, `app/generation-preview/page.tsx`

- Add `generationMode: 'ai' | 'from-slides'` to `FormState` and `GenerationSessionState`
- Add a **segmented control** in the toolbar: `[🤖 AI Generate]` / `[📊 Use My Slides]`
- **Guard in `handleGenerate`**: if `generationMode === 'from-slides'` and uploaded file is not `.ppt`/`.pptx` → show error: *"No presentation file detected. Please upload a PPT or PPTX file to use this mode."*
- **"Use My Slides" pipeline** (in `generation-preview/page.tsx`):
  - Parse PPT → get `slides[]` with images
  - Skip AI outline generation
  - Each slide image becomes a `SlideContent` scene (embed as full-bleed image canvas)
  - Still generate `actions` (speech) per slide using the slide's extracted text/notes
- **"AI Generate"** → current behavior unchanged

---

## Phase 4 — Quiz Inclusion Toggle

**Files:** `lib/types/generation.ts`, `components/generation/generation-toolbar.tsx`, `lib/generation/outline-generator.ts`, `app/api/generate/scene-outlines-stream/route.ts`

- Add `includeQuizzes?: boolean` to `UserRequirements` (default `false`)
- Add **quiz toggle pill** to `GenerationToolbar` (off by default — reduce cognitive load)
- Thread `includeQuizzes` through session state → outline generator
- In outline generator system prompt: if `includeQuizzes === false`, append instruction: *"Do NOT include any quiz scenes in the outline. All scenes must be of type 'slide'."*

---

## Phase 5 — Rebuilt Landing Page

**File:** `app/page.tsx` (major rewrite), new `components/home/` components

New layout:
- **Top bar**: Logo, settings, theme (unchanged)
- **Hero area**: "Create Classroom" primary CTA + a compact requirement text box for quick-access class creation
- **Classroom grid**: Cards showing:
  - Classroom name + description
  - Count of classes inside
  - Thumbnail of the latest class
  - Last active date
  - Actions: Open, Add Class, Journal, Delete

**`CreateClassroomDialog`** (`components/home/CreateClassroomDialog.tsx`):
- Step 1: Name + optional description → creates `ClassroomRecord`

**`CreateClassDialog`** (`components/home/CreateClassDialog.tsx`):
- Class name / topic text area
- File upload zone: drag & drop, accepts PDF / DOCX / TXT / PPT / PPTX
- **Generation Mode** segmented toggle: `AI Generate` / `Use My Slides`
  - If `Use My Slides` selected + no PPT → inline warning chip
- **Include Quizzes** toggle (off by default)
- Submit → runs existing generation pipeline with new parameters

---

## Phase 6 — Classroom Detail Page

**New file:** `app/classroom-group/[classroomId]/page.tsx`, `components/classroom-group/`

- Lists all classes (stages) within a classroom as a timeline or grid
- Each class card: title, session date, slide count, thumbnail, Open / Delete actions
- **"Add Class"** → opens `CreateClassDialog` with `classroomId` pre-set
- **"Open Journal"** → navigates to `/journal/[classroomId]`
- Breadcrumb: `Home → Classroom Name`

---

## Phase 7 — Journal Data Model & Storage

**New files:** `lib/types/journal.ts`, `lib/utils/journal-storage.ts`

```typescript
interface JournalNote {
  id: string;          // = stageId
  classroomId: string;
  stageId: string;
  className: string;   // Stage.name
  sessionDate: number; // Stage.createdAt
  content: string;     // ProseMirror JSON or HTML
  updatedAt: number;
}

interface JournalImage {
  id: string;
  noteId: string;
  blob: Blob;          // in IndexedDB imageFiles table
  mimeType: string;
}
```

- Add `journalNotes` table to IndexedDB
- On first open: seed `content` by aggregating `speakerNotes` from all scenes of the stage
- CRUD: `getJournalNote`, `saveJournalNote`, `listJournalNotesByClassroom`
- Image storage: reuse existing `imageFiles` IndexedDB table with `journal_` prefix IDs

---

## Phase 8 — Journal Page

**New files:** `app/journal/[classroomId]/page.tsx`, `components/journal/JournalEditor.tsx`, `components/journal/JournalPageBreak.tsx`, `components/journal/JournalSidebar.tsx`

Layout:
```
┌──────────────┬──────────────────────────────────────────┐
│  Sidebar     │  Journal Content (scrollable)            │
│  ─────────── │  ┌─────────────────────────────────┐    │
│  Classroom A │  │ ─── Class 1: Intro · Jan 10 ─── │    │
│  > Class 1   │  │  [editable notes area]           │    │
│  > Class 2   │  │ ─── Class 2: Ch.2 · Jan 17 ────  │    │
│              │  │  [editable notes area]           │    │
│              │  └─────────────────────────────────┘    │
└──────────────┴──────────────────────────────────────────┘
```

- **Page breaks** (`JournalPageBreak`): styled horizontal divider with class name + date
- **Editor** (`JournalEditor`): ProseMirror or `@tiptap/react` rich-text editor per class
  - Bold, italic, headings, bullet lists
  - **Image paste**: `onPaste` handler captures `image/*` items → stores in IndexedDB → renders inline `<img>`
  - Drag-and-drop image support
  - Auto-save (debounced 1s) to IndexedDB
- Sidebar: collapsible, highlights current section on scroll
- Export: "Export as PDF" button (print-ready layout)

---

## Phase 9 — Notes Image Paste (Speaker Notes in Classroom)

**Files:** wherever the speaker notes editor lives (search `speakerNotes` in `components/`)

- Add `onPaste` handler to the notes `<textarea>` or rich-text component
- If paste contains `image/*`: extract blob → store in IndexedDB → insert markdown `![](objectURL)` or ProseMirror image node
- Render pasted images inline within notes

---

## Phase 10 — Navigation & Routing Updates

**Files:** `app/page.tsx`, `app/layout.tsx`, `components/` nav/breadcrumbs

- Home page classroom cards link to `/classroom-group/[classroomId]`
- `/classroom/[stageId]` remains functional (direct class access, as now)
- Add breadcrumb component: `Home → Classroom Name → Class Name`
- Update share dialog: no change needed (still shares at stage/class level)
- "Back" button in classroom view → goes to `/classroom-group/[classroomId]` if `classroomId` exists

---

## Phase 11 — i18n Keys

**Files:** `lib/i18n/` locale files

New keys: `classroom.createClassroom`, `classroom.addClass`, `classroom.noPresentation`, `classroom.generationMode.ai`, `classroom.generationMode.fromSlides`, `classroom.includeQuizzes`, `journal.title`, `journal.pageBreakLabel`, `journal.saveSuccess`, `journal.exportPdf`, `upload.unsupportedFileType`

---

## Phase 12 — Backward Compatibility

**Files:** `lib/utils/stage-storage.ts`, `lib/utils/database.ts`

- `listStages()` still returns all stages (unchanged)
- Stages without a `classroomId` shown in an **"Uncategorized"** section on the home page
- Existing `/classroom/[id]` links continue to work
- Old `FolderRecord`s remain but UI can offer one-click migration: "Convert Folder to Classroom"

---

## Phase 13 — Testing

**Files:** `tests/`, `e2e/`

| Test | Type |
| --- | --- |
| DOCX/TXT/PPT parsers return expected structure | Unit |
| Quiz toggle suppresses quiz outlines | Unit (outline generator) |
| PPT guard blocks "Use My Slides" without PPT | Integration |
| Create classroom → add class → generate flow | E2E |
| Journal: notes aggregate, edit, image paste persists | E2E |
| Backward compat: existing stage URLs still load | E2E |

---

## Dependency Map

```
Phase 1 (data model)
  ├── Phase 5 (landing page)
  │     └── Phase 6 (classroom detail)
  │           └── Phase 10 (routing)
  ├── Phase 2 (file parsers)
  │     ├── Phase 3 (generation mode)
  │     └── Phase 4 (quiz toggle)
  └── Phase 7 (journal storage)
        └── Phase 8 (journal page)
              └── Phase 9 (notes image paste)
```

**Suggested build order:** 1 → 2 → 4 → 3 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13

---

## Key Packages to Add

| Package | Purpose |
| --- | --- |
| `mammoth` | DOCX → text extraction |
| `@tiptap/react` + `@tiptap/starter-kit` | Rich-text journal editor |
| `@tiptap/extension-image` | Image support in Tiptap |
| `pptx2json` or `officeparser` | PPTX text/notes extraction |
| `libreoffice-convert` (optional) | PPTX → image conversion |
