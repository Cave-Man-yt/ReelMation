# Reelmation — Development Log

> This file documents the full development history and architecture decisions.
> Future AI sessions: READ THIS FIRST to understand the project state.

---

## Project Overview

**Reelmation** is an automated educational reel/short-form video generator built for a hackathon.

It takes a topic (e.g. "Explain Photosynthesis"), generates a narrated script via Gemini AI,
creates scene images via ComfyUI (local Stable Diffusion), synthesizes voiceover with Edge-TTS,
and renders the final 1080×1920 30fps MP4 video via Remotion — all fully automated and accessible
via a CLI or an interactive **Dark Neomorphic** web workspace.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    WEB FRONTEND (React)                  │
│  frontend/  — Vite + React + TypeScript + motion/react  │
│  Dark Neomorphism UI System (CSS Variables + Tokens)     │
│  Runs on http://localhost:3000                           │
│  Calls POST /api/generate-short-stream (SSE)            │
│  Receives real-time stdout log lines from Python         │
│  On completion: receives manifest data + video URL       │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP (SSE stream)
┌──────────────────────▼──────────────────────────────────┐
│                NODE.JS SERVER (server.ts)                │
│  Express server with Vite middleware                     │
│  Spawns Python process with PYTHONUNBUFFERED=1           │
│  Streams stdout/stderr to browser via SSE                │
│  Parses reel_manifest.json on completion                 │
│  Serves /reels/ static files from ../output/             │
└──────────────────────┬──────────────────────────────────┘
                       │ child_process.spawn()
┌──────────────────────▼──────────────────────────────────┐
│             PYTHON PIPELINE (main.py)                    │
│  ./venv/bin/python main.py "topic" --no-cache            │
│                                                          │
│  Step 1: Script Generation (Gemini AI)                   │
│    - ScriptAgent generates narration sentences           │
│    - Hook optimization (3 variations scored)             │
│    - Character & environment bible creation              │
│    - Image prompt generation per scene                   │
│                                                          │
│  Step 2: Voiceover (Edge-TTS)                            │
│    - Synthesizes speech → voiceover.mp3                  │
│    - Captures word-level timestamps (ms precision)       │
│                                                          │
│  Step 3: Scene Images (ComfyUI @ 127.0.0.1:8188)        │
│    - Sends T2I prompts to local Stable Diffusion         │
│    - Generates scene_001.png through scene_NNN.png       │
│                                                          │
│  Step 4: Manifest Building + Metadata Scoring            │
│    - Aligns word timings to frames (30fps)               │
│    - Scores: Hook/Pacing/Density/EmotionalArc → Grade    │
│    - Outputs reel_manifest.json                          │
│                                                          │
│  Step 5: Video Rendering (Remotion)                      │
│    - Copies assets to remotion/public/                   │
│    - npx remotion render → output/.../reel.mp4           │
│    - Final: 1080x1920, 30fps, animated captions          │
└─────────────────────────────────────────────────────────┘
```

---

## Key File Locations

### Python Backend
| File | Purpose |
|------|---------|
| `main.py` | CLI entry point. Works standalone: `./venv/bin/python main.py "topic"` |
| `reelmation/core/pipeline.py` | `ReelPipeline` class orchestrating all 5 steps |
| `reelmation/agents/script_agent.py` | `ScriptAgent` — Gemini-powered script + hook generation |
| `reelmation/agents/gemini_client.py` | `GeminiClient` — auth via antigravity OAuth token |
| `reelmation/media/tts_engine.py` | `TextToSpeech` — Edge-TTS with word boundaries |
| `reelmation/media/image_engine.py` | `ImageEngine` — ComfyUI WebSocket T2I client |
| `reelmation/core/remotion_builder.py` | `RemotionBuilder` — converts manifest to Remotion props |

### React Frontend & UI Design System
| File | Purpose |
|------|---------|
| `frontend/src/index.css` | **Dark Neomorphism Design Tokens**: Surface colors (`#12151e`), dual soft-UI box shadows, primary gradient buttons, utility classes |
| `frontend/server.ts` | Express + Vite server. SSE endpoint `/api/generate-short-stream` |
| `frontend/src/App.tsx` | Root component. Manages view state + SSE log streaming |
| `frontend/src/services/aiService.ts` | `generateVideoShortStream()` — SSE client reader |
| `frontend/src/components/LandingPage.tsx` | Landing page with hero, pipeline breakdown, preset cards |
| `frontend/src/components/VideoStudio.tsx` | Studio form with topic input, format switches, primary gradient CTA |
| `frontend/src/components/ProcessingExperience.tsx` | Live terminal HUD displaying real Python stdout |
| `frontend/src/components/ResultExportPage.tsx` | Video player, scene breakdown, retention score cards, MP4 download |
| `frontend/src/components/Header.tsx` | Nav header (v1.0 badge, PIPELINE READY indicator, NEW VIDEO CTA) |
| `frontend/src/components/Footer.tsx` | Dark soft-UI footer with tech stack credentials |
| `frontend/src/components/AmbientLivingBackground.tsx` | Parallax background with dark glowing violet & blue flares |
| `frontend/src/components/3d/HeroParticleField.tsx` | Three.js particle canvas with dark line material tint |
| `frontend/src/components/3d/NeuralNetworkLoading.tsx` | Three.js 7-layer neural network with `#12151e` dark scene background |
| `frontend/src/components/3d/NeuralReasoningEngine.tsx` | Three.js reasoning engine with dark fog (`0x12151e`) |

---

## Git Commit History (chronological)

| Hash | Description |
|------|-------------|
| `439c28e` | `chore: save state before major OOP refactoring` |
| `c5781d4` | `feat: complete rewrite to OOP architecture in reelmation/` |
| `21715da` | `fix: deep code review — rewrite story prompt, restore pipeline features, clean dead code` |
| `befca96` | `feat: support educational/informative reel generation and fix token limit truncation` |
| `519bece` | `fix: add self-healing loopback check for ComfyUI server address` |
| `2c72012` | `feat: integrate full React frontend with Python backend pipeline and remove all boilerplate fallback code` |
| `b47195f` | `feat: implement real-time Python stdout terminal output & SSE log streaming to web app` |
| `49d5867` | `feat: complete neomorphism UI overhaul` — initial light soft-UI design system migration |
| `1b7b645` | `fix(ui): upgrade neomorphism shadow contrast & button hierarchy` — true black alpha shadows + gradient CTAs |
| `28d6499` | `feat: dark theme neomorphism overhaul (white to dark obsidian black)` — switch to `#12151e` dark canvas, high-contrast slate text, dark 3D backgrounds |
| `e9ff560` | `chore: commit remotion assets and props updates` — synced latest rendered reel assets and props |

---

## 🎨 Dark Neomorphism UI Architecture

The frontend uses a custom, Tailwind-compatible **Dark Neomorphism** design system implemented in `frontend/src/index.css`:

1. **Surface Palette**:
   - Primary surface: `#12151e` (Dark Obsidian Slate)
   - Elevated panel: `#1a1e2b`
   - Sunken region: `#0a0c13`

2. **Soft-UI Dual Box-Shadows**:
   - **Top-Left Specular Glow**: `rgba(255, 255, 255, 0.05)`
   - **Bottom-Right Drop Shadow**: `rgba(0, 0, 0, 0.75)`
   - Extruded (`.nm-raised`, `.nm-raised-sm`, `.nm-raised-lg`) & Indented (`.nm-pressed`, `.nm-pressed-sm`, `.nm-pressed-lg`) utility classes.

3. **CTA Button Hierarchy**:
   - **Primary CTAs** (`.nm-btn-primary`): Filled gradient `linear-gradient(135deg, #7c3aed, #2563eb)`, bold white text, elevated purple drop shadow with tactile press state.
   - **Secondary CTAs** (`.nm-btn-secondary`): Tinted surface `var(--nm-bg-alt)` with accent hover background (`rgba(167, 139, 250, 0.12)`).

4. **Typography**:
   - Font family: Inter (via Google Fonts).
   - Headings: `#f8fafc` (Slate 50).
   - Body text: `#cbd5e1` (Slate 300).
   - Secondary text: `#64748b` (Slate 500).

---

## Important Technical Notes

### ComfyUI Connection
- ComfyUI must be running at `127.0.0.1:8188` (or `127.0.0.0:8188` as fallback)
- The `ImageEngine` auto-detects which address works via self-healing check
- Start ComfyUI with: `python main.py --listen 127.0.0 --lowvram`

### Gemini Authentication
- Uses antigravity CLI OAuth token at `~/.gemini/antigravity-cli/antigravity-oauth-token`
- API endpoint: `https://cloudcode-pa.googleapis.com/v1internal:generateChat`
- Project auto-discovered via `loadCodeAssist` endpoint

### Frontend → Backend Communication
- The frontend uses **Server-Sent Events (SSE)** via `POST /api/generate-short-stream`
- Server spawns Python with `PYTHONUNBUFFERED=1` for real-time output
- Each stdout line is streamed as `data: {"type":"log","payload":"..."}\n\n`
- On completion: `data: {"type":"complete","payload":{...manifest data...}}\n\n`
- On error: `data: {"type":"error","payload":"error message"}\n\n`

### Standalone CLI Mode
- `main.py` works 100% independently: `./venv/bin/python main.py "topic" [options]`
- Key options: `--sentences N`, `--voice VOICE`, `--skip-images`, `--no-cache`, `--reuse DIR`
- This is the primary demo mode for hackathon judge presentations

---

*Last updated: 2026-07-31T12:08:51+05:30*
