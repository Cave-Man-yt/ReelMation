# Reelmation — Development Log

> This file documents the full development history and architecture decisions.
> Future AI sessions: READ THIS FIRST to understand the project state.

---

## Project Overview

**Reelmation** is an automated educational reel/short-form video generator built for a hackathon.

It takes a topic (e.g. "Explain Photosynthesis"), generates a narrated script via Gemini AI,
creates scene images via ComfyUI (local Stable Diffusion), synthesizes voiceover with Edge-TTS,
and renders the final 1080×1920 30fps MP4 video via Remotion — all fully automated.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    WEB FRONTEND (React)                  │
│  frontend/  — Vite + React + TypeScript + motion/react  │
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

### React Frontend
| File | Purpose |
|------|---------|
| `frontend/server.ts` | Express + Vite server. SSE endpoint `/api/generate-short-stream` |
| `frontend/src/App.tsx` | Root component. Manages view state + SSE log streaming |
| `frontend/src/services/aiService.ts` | `generateVideoShortStream()` — SSE client reader |
| `frontend/src/components/LandingPage.tsx` | Landing page with real pipeline steps |
| `frontend/src/components/VideoStudio.tsx` | Topic input form (subject, voice, format) |
| `frontend/src/components/ProcessingExperience.tsx` | Live terminal showing real Python stdout |
| `frontend/src/components/ResultExportPage.tsx` | Video player + scene breakdown + download |
| `frontend/src/components/Header.tsx` | Nav header (v1.0, PIPELINE READY status) |
| `frontend/src/components/Footer.tsx` | Tech stack footer |
| `frontend/src/data/presets.ts` | Sample topic presets (no demo data) |

### Output Structure (per run)
```
output/<topic_slug>_<YYYYMMDD_HHMMSS>/
├── reel_script.json        # Gemini script output
├── voiceover.mp3           # Edge-TTS audio
├── scene_001.png ... NNN   # ComfyUI generated images
├── reel_manifest.json      # Full manifest (frames, words, scores)
├── reel.mp4                # Final rendered video
└── llm_debug.log           # LLM request/response debug log
```

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

### ScriptAgent Minimum Sentences
- The ScriptAgent requires **minimum 8 sentences** (hard-coded validation)
- Default is 12 sentences. Passing `--sentences 4` will fail with retry loops
- The frontend currently uses the default (12 sentences)

### What Was Removed (boilerplate from original frontend template)
- `DEMO_PREGENERATED_SHORTS` — hardcoded fake quantum computing demo data
- `NeuralReasoningEngine` — fake 3D visualization component (still exists in code but unused)
- `DEFAULT_REASONING_PATHS` — fake AI reasoning path scores
- ROI Calculator section — fake time-savings math
- Fallback logic in App.tsx, aiService.ts, server.ts — all removed
- All fake telemetry stats (98.6% Hook Score, 8.2s generation, etc.)

---

## Known Issues / TODOs

1. **`remotion/public/` gets stale assets** — Scene images and props.json from previous runs
   remain in `remotion/public/`. The pipeline overwrites them each run, but leftover files
   from runs with more scenes may persist.

2. **Frontend processing page shows live logs but has no progress bar** — Could parse
   STEP N/5 patterns from stdout to show percentage progress.

3. **NeuralReasoningEngine.tsx still exists** — The 3D component file exists but is not
   imported anywhere. Can be deleted for cleanup.

4. **No error recovery in frontend** — If pipeline crashes mid-way, user must click
   "Generate" again. No retry or resume functionality.

5. **Video playback** — ResultExportPage.tsx has a `<video>` tag that plays the generated
   MP4 from `/reels/<run_dir>/reel.mp4`. Ensure the static file server path is correct.

---

*Last updated: 2026-07-30T20:15:00+05:30*
