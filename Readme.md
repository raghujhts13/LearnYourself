# LYS

**AI-assisted, curated e-learning authoring and classroom playback.**

LYS is a learning management platform designed to help educators automatically generate structured lessons from source documents or presentation slides. By leveraging large language models (LLMs), it allows users to convert topic descriptions, PDFs, DOCX files, TXTs, or PPT/PPTX files into cohesive **scenes**—including interactive slides, quizzes, and project-based learning (PBL) flows—with integrated narration (Text-to-Speech), visuals, and an interactive presentation stage.

## Project Goal
Give educators a local-first, self-hostable tool to iterate on AI-generated lessons, refine content in an interactive stage UI, organize learning into Classrooms, and effortlessly share or export their materials.

*For a clear, non-technical overview of all features and functionalities within the application, please refer to the [Alpha Tester Guide](alpha_tester.md).*

---

## Key Features

- **Multi-Format Document Parsing:** Upload `PDF`, `DOCX`, `TXT`, `PPT`, or `PPTX` files to serve as the foundation for your lessons.
- **Classroom-Based Data Model:** Organize your generated classes inside logical "Classrooms."
- **Generation Modes:** Choose between **"AI Generate"** (creating from scratch using a document/topic) or **"Use My Slides"** (parsing an existing PowerPoint).
- **Quiz Integration:** Easily toggle on/off the automated generation of assessment quizzes throughout the class.
- **Interactive Stage:** A dynamic slide canvas featuring a whiteboard (draw, shapes, LaTeX, charts), video playback, and tools like a spotlight and laser pointer.
- **Automated Narration (TTS/ASR):** Generate voiceovers for scenes using various TTS providers.
- **Web Search Integration:** Enhances generation with context pulled from the web using Tavily.

---

## Technology Stack

| Layer | Tools & Frameworks |
| --- | --- |
| **Framework** | Next.js 16 (App Router), React 19 |
| **Language** | TypeScript 5 |
| **Styling & UI** | Tailwind CSS 4, Radix / Base UI, Motion, Lucide Icons |
| **State Management** | Zustand (with persistence) |
| **Local Database** | Dexie.js (IndexedDB) for storing Classrooms, Stages, and Media Blobs |
| **AI Integration** | Vercel AI SDK (`ai`), Provider modules for OpenAI, Anthropic, Ollama, etc. |
| **Document Parsers** | `unpdf` & `mineru` (PDF), `mammoth` (DOCX), `officeparser` (PPTX) |
| **Export/Docs** | Custom PPTX pipeline (`pptxgenjs`), KaTeX (math), ECharts (charts) |
| **Tooling** | pnpm workspaces, ESLint, Prettier, Vitest, Playwright |

---

## Setup and Run Locally

### Requirements
- **Node.js** version 20.9.0 or higher.
- **pnpm** package manager (enable via `corepack enable`).
- **API Keys**: At minimum, an API key for your chosen LLM provider.

### Installation Steps

1. **Clone the repository** (and use this directory as your git root):
   ```bash
   git clone https://github.com/<your-org>/LYS.git
   cd LYS/LYS
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables**:
   Copy the example `.env` file and enter your API keys.
   ```bash
   cp .env.example .env.local
   ```
   *Note: Only add keys for the services you intend to use. At minimum, set an LLM provider key (e.g., `OPENAI_API_KEY`).*

4. **Start the Development Server**:
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to view the app.

### Production Build
```bash
pnpm build
pnpm start
```

---

## Modifying Models & AI Providers

LYS is designed to be provider-agnostic through the Vercel AI SDK. You can change your default models and providers via your `.env.local` file or through the UI settings.

- **Primary LLM**: Define your primary model via `DEFAULT_MODEL` in `.env.local` (e.g., `openai:gpt-4o`).
- **Available Providers**: Supply keys like `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY`.
- **Local/Air-Gapped Usage**: For self-hosted, air-gapped instances, you can point to local models by setting `OLLAMA_BASE_URL`.
- **Text-to-Speech (TTS) & ASR**: Setup provider keys for audio handling (e.g., `TTS_OPENAI_API_KEY`, `ASR_QWEN_API_KEY`).
- **Image Generation & Search**: You can add keys for specific service providers such as Tavily for search (`TAVILY_API_KEY`). 

You can also dynamically shift TTS, ASR, and Image generation settings through the application's **Settings UI** without necessarily rebooting the server.

---

## Future Scope

*(Placeholder for future scope)*
- Find a way to render and edit user PPT (instead of AI generation)
- Classrooms and classes are web cached (should add cloud sync or some persist mechanism)
  - [x] Integrate notes within classes that can be edited inside and outside the classes
  - [x] deploy classes (non-editable slides but can interact)
  - [ ] Deploy classrooms (non-editable metadata but can view all assets and interact within classes)
  - [ ] Test the custom URL deployment
  - [ ] Allow multifile upload and parsing
  - [ ] Integrate claude web search also as an option, and include all connector configurations for video and image generation
  - [ ] Unarchive and integrate video generation into classroom flow
  - [ ] Integrate a centralized journal that collates all notes inside classes belonging to a classroom
  - [ ] check if uploaded files during class generation is getting saved under materials/ assets inside classroom folders
  - [ ] add claude web search tool and find any open-source integratable web search tools
  - [ ] update this readme file to include all the functionalities and step-by-step explanation of whats happening under the hood (or add a medium article and link it here)
---

### Project Integrations

This project was built by modifying **[OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)** (an open-source platform for interactive AI courses) to fit our specific needs. 
It also uses **[Puter](https://github.com/HeyPuter)** (a cloud operating system) to allow anyone to use advanced AI models for free, though with rate limits.

## Project Documentation Archive

If you are looking for historical context, implementation guides, test suites, or older version readmes, all past markdown trackers have been safely archived in the directory below:  
📂 **[Archive: All Readmes](./all%20readmes/)**
