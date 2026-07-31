# 🎬 Reelmation

**AI-Powered Educational Reel Generator** — Fully automated pipeline that transforms any topic into a professional short-form video ready for YouTube Shorts, Instagram Reels, and TikTok, wrapped in a sleek **Dark Neomorphism (Dark Soft-UI)** web interface.

> Built for hackathon by [Cave-Man-yt](https://github.com/Cave-Man-yt)

---

## 🚀 What It Does

Give it a topic like _"Explain Photosynthesis"_ and Reelmation will:

1. **Write a script** — Gemini AI generates narration with hook optimization and 3-act structure
2. **Generate voiceover** — Edge-TTS synthesizes speech with word-level timestamps
3. **Create scene images** — ComfyUI (Stable Diffusion) generates visuals for every sentence
4. **Build a manifest** — Aligns audio, images, and animated captions frame-by-frame
5. **Render the video** — Remotion outputs a final 1080×1920 MP4 at 30fps

All in one command or via an interactive Dark Neomorphic web workspace. No manual editing. No templates.

---

## 🎥 Demo

```bash
./venv/bin/python main.py "How black holes bend light"
```

```
+==========================================================+
|  🎬 REELMATION -- Automated Reel Generator               |
+==========================================================+
|  Topic: How black holes bend light                       |
+==========================================================+

  🤖 STEP 1: Generating Script via Gemini
  🎤 STEP 2: Generating Voiceover + Word Timestamps
  🖼️  STEP 3: Generating Scene Images
  🧩 STEP 4: Building Reel Manifest
  📊 STEP 4.5: Reel Metadata Scoring & Analysis
  🎬 STEP 5: Rendering Final Video via Remotion

  ✅ REEL GENERATION COMPLETE!
     📹 output/how_black_holes_bend_light_.../reel.mp4
     ⏱️  127s
```

---

## 🏗️ Architecture

```
┌───────────────────────────────────────────────┐
│        Dark Neomorphic Web UI (localhost:3000)│
│  Topic input → Live terminal logs → Video     │
└─────────────────┬─────────────────────────────┘
                  │ SSE stream (real-time stdout)
┌─────────────────▼─────────────────────────────┐
│         Node.js Server (server.ts)            │
│  Spawns Python pipeline, streams logs to UI   │
└─────────────────┬─────────────────────────────┘
                  │ child_process.spawn()
┌─────────────────▼─────────────────────────────┐
│          Python Pipeline (main.py)            │
│                                               │
│  Gemini AI ──→ Script + Hook Optimization     │
│  Edge-TTS ──→ Voiceover + Word Timestamps     │
│  ComfyUI  ──→ Scene Images (Stable Diffusion) │
│  Remotion ──→ Final MP4 Video                 │
└───────────────────────────────────────────────┘
```

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| **AI Scripting** | Gemini AI (Cloud Code Platform API) |
| **Text-to-Speech** | Edge-TTS with word boundary timestamps |
| **Image Generation** | ComfyUI + Stable Diffusion (local GPU) |
| **Video Rendering** | Remotion (React-based video renderer) |
| **Web Frontend** | React + TypeScript + Vite + Motion |
| **Web Server** | Express + Server-Sent Events (SSE) |
| **UI Aesthetics** | **Dark Neomorphism (Dark Soft-UI)** — Custom CSS design system, dark obsidian canvas (`#12151e`), specular highlight & pitch black dual shadows, electric purple/indigo gradient CTAs, Google Fonts (Inter) |
| **3D Renderers** | Three.js particle fields & neural network visualization synced to dark theme |

---

## ⚡ Quick Start

### Prerequisites

- Python 3.12+ with virtualenv
- Node.js 18+
- ComfyUI running locally on port 8188
- Gemini API access (antigravity CLI auth)

### 1. Clone & Setup Python

```bash
git clone https://github.com/Cave-Man-yt/ReelMation.git
cd ReelMation
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt  # edge-tts, etc.
```

### 2. Setup Frontend

```bash
cd frontend
npm install
```

### 3. Start ComfyUI

```bash
# In a separate terminal, start your ComfyUI instance
python main.py --listen 127.0.0 --lowvram
```

### 4. Run

**Option A — CLI (standalone, for demos):**
```bash
./venv/bin/python main.py "Explain Photosynthesis"
```

**Option B — Web UI:**
```bash
cd frontend
npm run dev
# Open http://localhost:3000
```

---

## 🎛️ CLI Options

```
./venv/bin/python main.py "topic" [options]

Options:
  --voice, -v      Edge-TTS voice (default: en-US-GuyNeural)
  --rate, -r       Speech rate (default: +10%)
  --pitch          Speech pitch (default: +0Hz)
  --style, -s      Story style/tone (default: dramatic)
  --sentences, -n  Target sentence count (default: 12, min: 8)
  --skip-images    Skip ComfyUI image generation
  --no-cache       Force fresh script generation
  --from-script    Load existing reel_script.json
  --reuse          Reuse a previous output directory
```

---

## 📁 Output Structure

Each run creates a timestamped folder:

```
output/explain_photosynthesis_20260730_194252/
├── reel_script.json      # AI-generated script with scenes
├── voiceover.mp3         # Synthesized narration audio
├── scene_001.png         # Generated scene images
├── scene_002.png
├── ...
├── reel_manifest.json    # Frame-level manifest with scores
├── reel.mp4              # ✅ Final rendered video
└── llm_debug.log         # LLM debug trace
```

---

## 🌐 Web UI Features

- **Dark Neomorphic Design System** — Deep obsidian surfaces (`#12151e`), soft-UI dual box shadows (top-left specular highlight + bottom-right drop shadow), tactile extruded/indented states, vibrant electric violet/blue gradient CTAs.
- **Topic Studio** — Enter any educational topic, customize parameters, select quick presets, and initiate generation.
- **Live Terminal** — Watch actual Python pipeline stdout in real-time via Server-Sent Events.
- **3D Neural Engine Visualizer** — Three.js particle fields and network layers recolored to match the dark soft-UI aesthetic.
- **Video Player** — Play, inspect, and download the final MP4 reel directly from the browser.
- **Scene Breakdown** — Inspect narration text, AI visual prompts, and frame timing.

---

## 📊 Reel Scoring

Every generated reel is automatically scored (0–100, grade A+ to F):

| Metric | Weight | What It Measures |
|--------|--------|-----------------|
| **Hook Strength** | 25 pts | First-sentence virality (curiosity, specificity, power opening) |
| **Pacing** | 25 pts | Words-per-second (ideal: 2.5–3.2 wps) |
| **Scene Density** | 25 pts | Visual changes per second |
| **Emotional Arc** | 25 pts | Variation across 3-act structure |

---

## 📄 License

MIT

---

<p align="center">
  <b>Reelmation</b> — From topic to reel in one command 🎬
</p>
