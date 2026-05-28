#!/usr/bin/env python3
"""
Reelmation — Automated Reel Generator
=======================================
Takes a topic and produces a finished 30-45 second Instagram reel (MP4).

Pipeline:
  1. Gemini LLM  → Structured JSON script (sentences + image prompts)
  2. Edge-TTS    → Voiceover MP3 + word-level timestamps
  3. ComfyUI     → Generate scene images from prompts
  4. Assembly    → Build Remotion-compatible manifest
  5. Remotion    → Render final MP4

Usage:
    ./venv/bin/python generate_reel.py "A miracle baby story"
    ./venv/bin/python generate_reel.py "Ancient underwater city" --voice en-US-ChristopherNeural
    ./venv/bin/python generate_reel.py "Time traveler" --skip-images --sentences 15
"""

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Project Imports ────────────────────────────────────────────────────────
# Add project root to path
PROJECT_ROOT = Path(__file__).parent.resolve()
sys.path.insert(0, str(PROJECT_ROOT))

from gemini_agent import GeminiAgent, EMOTION_WORDS, EMOTION_LEXICON, EMOTION_BIGRAMS
from T2Speech import TextToSpeech
from T2I import T2Igen, check_comfyui_alive


# ── Constants ──────────────────────────────────────────────────────────────
FPS = 30
WIDTH = 1080
HEIGHT = 1920
REMOTION_DIR = PROJECT_ROOT / "remotion"
REMOTION_PUBLIC = REMOTION_DIR / "public"
END_BUFFER_MS = 1000  # 1 second of visual padding after audio ends
# If gap between words exceeds this, treat as a true pause (no forced continuity)
PAUSE_THRESHOLD_MS = 500
SCRIPT_CACHE_DIR = PROJECT_ROOT / ".cache" / "scripts"


# ── Step 1: Generate Script ───────────────────────────────────────────────

def _get_cache_key(topic: str, style: str, num_sentences: int) -> str:
    """Generate a filesystem-safe cache key from script params."""
    slug = re.sub(r"[^\w\s-]", "", topic.lower())
    slug = re.sub(r"[\s]+", "_", slug)[:50]
    return f"{slug}__{style}__{num_sentences}"


def _load_cached_script(topic: str, style: str, num_sentences: int) -> Optional[dict]:
    """Try to load a cached script. Returns None if not found."""
    key = _get_cache_key(topic, style, num_sentences)
    cache_file = SCRIPT_CACHE_DIR / f"{key}.json"
    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text())
            if "sentences" in data and len(data["sentences"]) >= 8:
                return data
        except Exception:
            pass
    return None


def _load_cached_bible(topic: str, style: str, num_sentences: int) -> Optional[dict]:
    """Try to load a cached bible (characters + environments). Returns None if not found."""
    key = _get_cache_key(topic, style, num_sentences)
    bible_file = SCRIPT_CACHE_DIR / f"{key}_bible.json"
    if bible_file.exists():
        try:
            data = json.loads(bible_file.read_text())
            if "characters" in data and "environments" in data:
                return data
        except Exception:
            pass
    return None


def _save_cached_script(topic: str, style: str, num_sentences: int, script: dict):
    """Save a script to the cache. Also saves the bible separately for independent reuse."""
    SCRIPT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = _get_cache_key(topic, style, num_sentences)

    # Save full script
    cache_file = SCRIPT_CACHE_DIR / f"{key}.json"
    cache_file.write_text(json.dumps(script, indent=2))

    # Save bible separately for per-phase reuse
    if "characters" in script and "environments" in script:
        bible = {
            "characters": script["characters"],
            "environments": script["environments"],
            "sentence_environments": [
                s.get("environment", "") for s in script.get("sentences", [])
            ],
        }
        bible_file = SCRIPT_CACHE_DIR / f"{key}_bible.json"
        bible_file.write_text(json.dumps(bible, indent=2))


def step_generate_script(
    topic: str,
    style: str = "dramatic",
    num_sentences: int = 18,
    persona_file: Optional[str] = None,
    use_cache: bool = False,
    from_script: Optional[str] = None,
    optimize_hook: bool = True,
) -> dict:
    """
    Use Gemini LLM to generate a structured reel script.

    Returns:
        Validated dict: {title, characters[], environments[],
        sentences[{text, environment, image_prompt}]}
    """
    print("\n" + "═" * 60)
    print("  🤖 STEP 1: Generating Script via Gemini")
    print("═" * 60)

    # Helper function to dynamically add hook_analysis if missing
    def ensure_hook_analysis(s_dict: dict) -> dict:
        if "hook_analysis" not in s_dict:
            first_sent = ""
            if "sentences" in s_dict and len(s_dict["sentences"]) > 0:
                first_item = s_dict["sentences"][0]
                first_sent = first_item["text"] if isinstance(first_item, dict) else str(first_item)
            if first_sent:
                original_score = GeminiAgent.score_hook(first_sent)
                s_dict["hook_analysis"] = {
                    "original": {"text": first_sent, "score": original_score},
                    "variations": [],
                    "best": {"text": first_sent, "score": original_score, "source": "original"}
                }
        return s_dict

    # ── Load from existing script file ──
    if from_script:
        script_path = Path(from_script)
        if not script_path.exists():
            raise FileNotFoundError(f"Script file not found: {from_script}")
        script = json.loads(script_path.read_text())
        script = ensure_hook_analysis(script)
        print(f"  📂 Loaded script from: {from_script}")
        _print_script_summary(script)
        return script

    # ── Try cache ──
    if use_cache:
        cached = _load_cached_script(topic, style, num_sentences)
        if cached:
            cached = ensure_hook_analysis(cached)
            print(f"  💾 Using cached script (use --no-cache to regenerate)")
            _print_script_summary(cached)
            return cached

    # ── Generate fresh via LLM ──
    persona = (
        "You are a viral social media reel scriptwriter for Reelmation. "
        "You write dramatic, cinematic short stories that captivate audiences "
        "in 30-45 second narrated video reels. Your stories are vivid, "
        "emotionally powerful, and always end with maximum impact. "
        "You are a master of hooks — every first sentence grabs attention."
    )
    if persona_file:
        try:
            persona = Path(persona_file).read_text().strip()
            print(f"  📜 Using custom persona from: {persona_file}")
        except FileNotFoundError:
            print(f"  ⚠️  Persona file not found: {persona_file}, using default")

    agent = GeminiAgent(persona=persona)
    print(f"  📡 Agent ready (project: {agent.project})")
    print(f"  🎯 Topic: {topic}")
    print(f"  🎭 Style: {style}")
    print(f"  📝 Target sentences: {num_sentences}")

    script = agent.generate_reel_script(
        topic=topic,
        style=style,
        num_sentences=num_sentences,
        optimize_hook=optimize_hook,
    )

    # Save to cache
    _save_cached_script(topic, style, num_sentences, script)
    print(f"  💾 Script cached for reuse")

    _print_script_summary(script)
    return script


def _print_script_summary(script: dict):
    """Print a summary of a script to stdout."""
    print(f"\n  ✅ Script: '{script.get('title', 'Untitled')}'")
    print(f"     {len(script['sentences'])} sentences")

    # New bible format
    characters = script.get("characters", [])
    environments = script.get("environments", [])
    if characters:
        print(f"\n  {'─' * 56}")
        print(f"  📖 Characters ({len(characters)}):")
        for c in characters:
            print(f"     👤 {c['name']} ({c.get('role', '?')})")
            print(f"        {c['appearance'][:90]}{'...' if len(c['appearance']) > 90 else ''}")
    if environments:
        print(f"\n  🏛️  Environments ({len(environments)}):")
        for e in environments:
            print(f"     📍 {e.get('name', e['id'])} [{e['id']}]")
            print(f"        {e['description'][:90]}{'...' if len(e['description']) > 90 else ''}")

    # Backward compat: old scripts with character_description
    if not characters:
        char_desc = script.get("character_description", "")
        if char_desc:
            print(f"     Character: {char_desc[:80]}...")

    print(f"\n  {'─' * 56}")
    for i, s in enumerate(script["sentences"], 1):
        env_tag = f" [{s['environment']}]" if s.get("environment") else ""
        text = s['text'][:65] if s.get("environment") else s['text'][:70]
        ellipsis = '...' if len(s['text']) > len(text) else ''
        print(f"  {i:2d}.{env_tag} {text}{ellipsis}")
    print(f"  {'─' * 56}")


# ── Step 2: Generate Voiceover + Word Timestamps ──────────────────────────

def step_generate_voiceover(
    script: dict,
    output_dir: Path,
    voice: str = "en-US-GuyNeural",
    rate: str = "+0%",
    pitch: str = "+0Hz",
) -> tuple[list[dict], str, float]:
    """
    Generate voiceover audio with word-level timestamps.

    Joins sentences with double newline for natural TTS pausing.
    Captures WordBoundary events for exact word timing.

    Returns:
        (word_boundaries, audio_path, audio_duration_ms)
    """
    print("\n" + "═" * 60)
    print("  🎤 STEP 2: Generating Voiceover + Word Timestamps")
    print("═" * 60)

    # Join sentences with double newline for natural pauses
    sentences = script["sentences"]
    full_text = "\n\n".join(s["text"] for s in sentences)

    print(f"  🔊 Voice: {voice}")
    print(f"  ⏩ Rate: {rate}")
    print(f"  🎵 Pitch: {pitch}")
    print(f"  📝 Total text: {len(full_text)} chars, {len(sentences)} sentences")

    audio_path = str(output_dir / "voiceover.mp3")
    tts = TextToSpeech(default_voice=voice)

    start = time.time()
    word_boundaries = tts.generate_with_timestamps(
        text=full_text,
        output_path=audio_path,
        voice=voice,
        rate=rate,
        pitch=pitch,
    )
    elapsed = time.time() - start

    if not word_boundaries:
        raise RuntimeError("Edge-TTS returned no word boundaries — aborting")

    # Get audio duration via ffprobe
    audio_duration_ms = _get_audio_duration_ms(audio_path)
    print(f"  ⏱️  Audio duration: {audio_duration_ms / 1000:.1f}s")
    print(f"  📊 Word boundaries: {len(word_boundaries)}")
    print(f"  ⚡ Generation time: {elapsed:.1f}s")

    # Validate: word boundaries should be monotonically increasing
    for i in range(1, len(word_boundaries)):
        if word_boundaries[i]["offset_ms"] < word_boundaries[i - 1]["offset_ms"]:
            print(
                f"  ⚠️  Non-monotonic word boundary at index {i}: "
                f"{word_boundaries[i-1]['offset_ms']}ms → {word_boundaries[i]['offset_ms']}ms"
            )

    return word_boundaries, audio_path, audio_duration_ms


def _get_audio_duration_ms(audio_path: str) -> float:
    """Get audio file duration in milliseconds using ffprobe."""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "quiet",
                "-show_entries", "format=duration",
                "-of", "csv=p=0",
                audio_path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return float(result.stdout.strip()) * 1000
    except Exception as e:
        print(f"  ⚠️  ffprobe failed: {e}, estimating from word boundaries")
        return 0


# ── Step 3: Generate Images ───────────────────────────────────────────────

def step_generate_images(
    script: dict,
    output_dir: Path,
    skip_images: bool = False,
) -> list[Optional[str]]:
    """
    Generate one image per sentence using ComfyUI.

    Returns:
        List of image file paths (or None for failed generations).
    """
    print("\n" + "═" * 60)
    print("  🖼️  STEP 3: Generating Scene Images")
    print("═" * 60)

    images_dir = output_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    sentences = script["sentences"]
    image_paths = []

    if skip_images:
        print("  ⏭️  Skipping image generation (--skip-images)")
        # Create placeholder paths
        for i in range(len(sentences)):
            path = str(images_dir / f"scene_{i + 1:03d}.png")
            image_paths.append(path)
            # Create a tiny placeholder if file doesn't exist
            if not os.path.exists(path):
                _create_placeholder_image(path, i)
        return image_paths

    # Check ComfyUI is alive
    if not check_comfyui_alive():
        print("  ❌ ComfyUI server not reachable at 127.0.0.1:8188")
        print("  ⚠️  Falling back to placeholder images")
        for i in range(len(sentences)):
            path = str(images_dir / f"scene_{i + 1:03d}.png")
            _create_placeholder_image(path, i)
            image_paths.append(path)
        return image_paths

    print(f"  🎨 Generating {len(sentences)} images via ComfyUI...")

    for i, sentence in enumerate(sentences):
        scene_num = i + 1
        path = str(images_dir / f"scene_{scene_num:03d}.png")

        # Skip if image already exists (resume support)
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            size_kb = os.path.getsize(path) / 1024
            print(f"  ⏭️  [{scene_num}/{len(sentences)}] Cached: scene_{scene_num:03d}.png ({size_kb:.0f} KB)")
            image_paths.append(path)
            continue

        print(f"\n  🖼️  [{scene_num}/{len(sentences)}] Generating scene {scene_num}...")
        print(f"     Prompt: {sentence['image_prompt'][:100]}...")

        start = time.time()
        result = T2Igen(
            prompt=sentence["image_prompt"],
            output_path=path,
        )
        elapsed = time.time() - start

        if result is not None:
            print(f"     ✅ Done in {elapsed:.1f}s")
            image_paths.append(result)
        else:
            print(f"     ❌ Failed — using placeholder")
            _create_placeholder_image(path, i)
            image_paths.append(path)

    success_count = sum(
        1 for p in image_paths
        if p and os.path.exists(p) and os.path.getsize(p) > 5000
    )
    print(f"\n  ✅ Images: {success_count}/{len(sentences)} generated successfully")

    return image_paths


def _create_placeholder_image(path: str, index: int):
    """Create a minimal placeholder PNG image using ImageMagick."""
    try:
        # Use ImageMagick convert if available
        colors = [
            "#1a1a2e", "#16213e", "#0f3460", "#1b1b2f",
            "#162447", "#1f4068", "#1b262c", "#0a1931",
        ]
        color = colors[index % len(colors)]
        subprocess.run(
            [
                "convert",
                "-size", "1024x1024",
                f"xc:{color}",
                "-gravity", "center",
                "-fill", "#333333",
                "-pointsize", "48",
                "-annotate", "0",
                f"Scene {index + 1}",
                path,
            ],
            capture_output=True,
            timeout=10,
        )
    except Exception:
        # Ultra-minimal: write a 1x1 pixel PNG
        import struct
        import zlib
        # Minimal valid PNG
        def create_minimal_png(width=1, height=1, rgb=(26, 26, 46)):
            sig = b'\x89PNG\r\n\x1a\n'
            ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
            ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
            ihdr = struct.pack('>I', 13) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc & 0xffffffff)
            raw = b'\x00' + bytes(rgb) * width
            raw_data = raw * height
            compressed = zlib.compress(raw_data)
            idat_crc = zlib.crc32(b'IDAT' + compressed)
            idat = struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc & 0xffffffff)
            iend_crc = zlib.crc32(b'IEND')
            iend = struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc & 0xffffffff)
            return sig + ihdr + idat + iend

        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(create_minimal_png())


# ── Step 4: Build Manifest ────────────────────────────────────────────────

def step_build_manifest(
    script: dict,
    word_boundaries: list[dict],
    image_paths: list[str],
    audio_path: str,
    audio_duration_ms: float,
    output_dir: Path,
) -> dict:
    """
    Build the Remotion-compatible manifest.

    Maps word boundaries to sentences, computes per-sentence and per-word
    frame numbers, and enforces continuous subtitle rendering.

    Returns:
        The complete manifest dict.
    """
    print("\n" + "═" * 60)
    print("  🔗 STEP 4: Building Reel Manifest")
    print("═" * 60)

    sentences = script["sentences"]

    # ── Map words to sentences ──
    # Strategy: walk through word_boundaries sequentially, assigning each
    # word to the current sentence based on text matching.
    sentence_word_groups = _map_words_to_sentences(sentences, word_boundaries)

    # ── Build enriched sentences with frame timing ──
    total_duration_ms = audio_duration_ms + END_BUFFER_MS
    total_frames = math.ceil(total_duration_ms / 1000 * FPS)

    enriched_sentences = []

    for i, (sentence, words) in enumerate(zip(sentences, sentence_word_groups)):
        if not words:
            # Sentence got no words mapped — shouldn't happen, but handle it
            print(f"  ⚠️  Sentence {i+1} has no mapped words: '{sentence['text'][:50]}...'")
            # Estimate timing from neighboring sentences
            if enriched_sentences:
                prev = enriched_sentences[-1]
                start_ms = prev["audio_end_ms"]
            else:
                start_ms = 0
            end_ms = start_ms + 2000  # Assume 2 seconds
            word_entries = [{
                "text": w,
                "start_frame": int(start_ms / 1000 * FPS),
                "end_frame": int(end_ms / 1000 * FPS),
            } for w in sentence["text"].split()]
        else:
            start_ms = words[0]["offset_ms"]
            last_word = words[-1]
            end_ms = last_word["offset_ms"] + last_word["duration_ms"]

            # Build word entries with continuous frame mapping
            word_entries = []
            for j, wb in enumerate(words):
                w_start_ms = wb["offset_ms"]
                w_end_ms = wb["offset_ms"] + wb["duration_ms"]

                w_start_frame = int(w_start_ms / 1000 * FPS)
                w_end_frame = int(w_end_ms / 1000 * FPS)

                # ── Continuous frame enforcement ──
                # If the gap to the next word is < PAUSE_THRESHOLD_MS,
                # extend this word's end_frame to the next word's start_frame.
                if j < len(words) - 1:
                    next_start_ms = words[j + 1]["offset_ms"]
                    gap_ms = next_start_ms - w_end_ms
                    if gap_ms < PAUSE_THRESHOLD_MS:
                        w_end_frame = int(next_start_ms / 1000 * FPS)

                # Ensure at least 1 frame per word
                if w_end_frame <= w_start_frame:
                    w_end_frame = w_start_frame + 1

                word_entries.append({
                    "text": wb["text"],
                    "start_frame": w_start_frame,
                    "end_frame": w_end_frame,
                })

        # Sentence-level frame boundaries
        s_start_frame = word_entries[0]["start_frame"] if word_entries else 0
        s_end_frame = word_entries[-1]["end_frame"] if word_entries else 0

        # For image duration: extend to next sentence's start or end of video
        if i < len(sentences) - 1:
            # Will be recalculated after all sentences are processed
            img_end_frame = s_end_frame
        else:
            img_end_frame = total_frames

        # Relative image path for Remotion (relative to public/)
        img_path = image_paths[i] if i < len(image_paths) else ""
        # Convert absolute path to relative path for Remotion's staticFile
        if img_path:
            img_path = os.path.basename(os.path.dirname(img_path)) + "/" + os.path.basename(img_path)

        enriched_sentences.append({
            "text": sentence["text"],
            "image_prompt": sentence.get("image_prompt", ""),
            "image_file": f"images/{os.path.basename(image_paths[i])}" if i < len(image_paths) else "",
            "audio_offset_ms": start_ms if words else 0,
            "audio_end_ms": end_ms if words else 0,
            "start_frame": s_start_frame,
            "end_frame": s_end_frame,
            "words": word_entries,
        })

    # ── Recalculate image durations ──
    # Each image should span from its sentence start to the NEXT sentence start
    # (no gaps between images)
    for i in range(len(enriched_sentences)):
        if i < len(enriched_sentences) - 1:
            enriched_sentences[i]["image_end_frame"] = enriched_sentences[i + 1]["start_frame"]
        else:
            enriched_sentences[i]["image_end_frame"] = total_frames

        # Ensure image has at least 1 frame
        if enriched_sentences[i]["image_end_frame"] <= enriched_sentences[i]["start_frame"]:
            enriched_sentences[i]["image_end_frame"] = enriched_sentences[i]["start_frame"] + FPS

    # Build final manifest
    manifest = {
        "title": script.get("title", "Untitled Reel"),
        "audio_file": "voiceover.mp3",
        "audio_duration_ms": audio_duration_ms,
        "total_frames": total_frames,
        "fps": FPS,
        "width": WIDTH,
        "height": HEIGHT,
        "generated_at": datetime.now().isoformat(),
        "sentences": enriched_sentences,
    }

    # Save manifest
    manifest_path = output_dir / "reel_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"  📄 Manifest saved: {manifest_path}")
    print(f"  🎞️  Total frames: {total_frames} ({total_frames / FPS:.1f}s)")
    print(f"  🎵 Audio: {audio_duration_ms / 1000:.1f}s + {END_BUFFER_MS / 1000:.1f}s buffer")
    print(f"  📊 Sentences: {len(enriched_sentences)}")
    total_words = sum(len(s["words"]) for s in enriched_sentences)
    print(f"  📊 Words with timing: {total_words}")

    return manifest


def _map_words_to_sentences(
    sentences: list[dict],
    word_boundaries: list[dict],
) -> list[list[dict]]:
    """
    Map word boundaries to their corresponding sentences.

    Strategy: normalize both the sentence text and word boundary text,
    then walk through words sequentially, matching them to sentences.
    """
    import unicodedata

    def normalize(text: str) -> list[str]:
        """Normalize text to a list of lowercase words, stripped of punctuation."""
        text = unicodedata.normalize("NFKD", text)
        text = re.sub(r"[^\w\s'-]", "", text).lower()
        return text.split()

    # Build a flat list of expected words per sentence
    sentence_expected = []
    for s in sentences:
        words = normalize(s["text"])
        sentence_expected.append(words)

    # Walk through word_boundaries, matching to sentences
    sentence_groups: list[list[dict]] = [[] for _ in sentences]
    wb_idx = 0
    total_wb = len(word_boundaries)

    for s_idx, expected_words in enumerate(sentence_expected):
        matched_count = 0
        expected_len = len(expected_words)

        while wb_idx < total_wb and matched_count < expected_len:
            wb = word_boundaries[wb_idx]
            wb_text = wb["text"].lower().strip()

            # Check if this word matches the expected word
            if matched_count < expected_len:
                exp = expected_words[matched_count]
                # Fuzzy match: the word boundary text should match or be
                # contained in the expected word (or vice versa)
                if wb_text == exp or wb_text.startswith(exp) or exp.startswith(wb_text):
                    sentence_groups[s_idx].append(wb)
                    matched_count += 1
                    wb_idx += 1
                else:
                    # Words might not match perfectly due to TTS pronunciation
                    # differences. Still assign to current sentence.
                    sentence_groups[s_idx].append(wb)
                    matched_count += 1
                    wb_idx += 1
            else:
                break

    # Assign any remaining words to the last sentence
    while wb_idx < total_wb:
        sentence_groups[-1].append(word_boundaries[wb_idx])
        wb_idx += 1

    # Validation
    mapped_total = sum(len(g) for g in sentence_groups)
    empty_sentences = sum(1 for g in sentence_groups if not g)
    print(f"  📊 Word mapping: {mapped_total}/{total_wb} words mapped to {len(sentences)} sentences")
    if empty_sentences > 0:
        print(f"  ⚠️  {empty_sentences} sentence(s) have no mapped words")

    return sentence_groups


def step_prescore_script(
    script: dict,
    num_sentences: int,
) -> dict:
    """
    Dry-run score a generated script using only its text before audio and video generation.
    Returns:
        {"total": float, "grade": str, "estimated": bool}
    """
    print("\n" + "═" * 60)
    print("  📊 STEP 1.5: Pre-Score (Text-Only Dry Run)")
    print("═" * 60)

    # 1. Hook Strength (0-25)
    hook_analysis = script.get("hook_analysis", {})
    best_hook_data = hook_analysis.get("best", {})
    hook_score_12 = best_hook_data.get("score", {}).get("total", 6.0)
    hook_strength_score = (hook_score_12 / 12.0) * 25.0
    hook_source = best_hook_data.get("source", "original")

    # Extract plain sentence texts
    raw_sentences = script.get("sentences", [])
    sentences = []
    for s in raw_sentences:
        if isinstance(s, dict):
            text = s.get("text", "")
        else:
            text = str(s)
        if text.strip():
            sentences.append(text.strip())

    total_words = sum(len(s.split()) for s in sentences)
    
    # Estimate audio duration: assume ~2.8 words per second at +10% rate
    estimated_duration_sec = total_words / 2.8 if total_words > 0 else 1.0
    
    # 2. Pacing (0-25)
    wps = total_words / estimated_duration_sec if estimated_duration_sec > 0 else 0.0
    if 2.5 <= wps <= 3.2:
        pacing_score = 25.0
        pacing_detail = f"{wps:.1f} words/sec (estimated ideal)"
    elif wps < 2.5:
        pacing_score = max(0.0, 25.0 * (wps - 1.5) / (2.5 - 1.5))
        pacing_detail = f"{wps:.1f} words/sec (estimated slow)"
    else:
        pacing_score = max(0.0, 25.0 * (4.5 - wps) / (4.5 - 3.2))
        pacing_detail = f"{wps:.1f} words/sec (estimated fast)"

    # 3. Scene Density (0-25)
    # Assume 1 sentence = 1 unique scene/image cut (standard for Reelmation)
    scene_count = len(sentences)
    sps = scene_count / estimated_duration_sec if estimated_duration_sec > 0 else 0.0
    if 0.25 <= sps <= 0.5:
        scene_density_score = 25.0
        scene_detail = f"{sps:.2f} scenes/sec (estimated ideal)"
    elif sps < 0.25:
        scene_density_score = max(0.0, 25.0 * (sps - 0.1) / (0.25 - 0.1))
        scene_detail = f"{sps:.2f} scenes/sec (estimated slow cuts)"
    else:
        scene_density_score = max(0.0, 25.0 * (0.8 - sps) / (0.8 - 0.5))
        scene_detail = f"{sps:.2f} scenes/sec (estimated rapid cuts)"

    # 4. Emotional Arc (0-25)
    def _emotion_density(text: str) -> float:
        text_lower = text.lower()
        words = [w.strip(".,?!\"';:") for w in text_lower.split()]
        score = sum(EMOTION_LEXICON.get(w, 0.0) for w in words)
        for bigram, weight in EMOTION_BIGRAMS.items():
            if bigram in text_lower:
                score += weight
        return score / max(len(words), 1)

    sentence_emotion_densities = [_emotion_density(s) for s in sentences]
    n_sents = len(sentences)
    
    if n_sents >= 3:
        act_size = n_sents // 3
        act1 = sentence_emotion_densities[:act_size]
        act2 = sentence_emotion_densities[act_size:2*act_size]
        act3 = sentence_emotion_densities[2*act_size:]
        
        mean1 = sum(act1) / len(act1) if act1 else 0.0
        mean2 = sum(act2) / len(act2) if act2 else 0.0
        mean3 = sum(act3) / len(act3) if act3 else 0.0
        
        act_means = [mean1, mean2, mean3]
        overall_mean = sum(act_means) / 3.0
        variance = sum((m - overall_mean) ** 2 for m in act_means) / 3.0
        std_dev = variance ** 0.5
        
        emotional_arc_score = min(25.0, 25.0 * (std_dev / 0.10))
        emotion_detail = f"StDev={std_dev:.3f} (estimated)"
    else:
        emotional_arc_score = 12.5
        emotion_detail = f"Too few sentences ({n_sents})"

    total_score = hook_strength_score + pacing_score + scene_density_score + emotional_arc_score
    total_int = round(total_score)

    if total_int >= 90:
        grade = "A+"
    elif total_int >= 80:
        grade = "A"
    elif total_int >= 65:
        grade = "B"
    elif total_int >= 50:
        grade = "C"
    elif total_int >= 35:
        grade = "D"
    else:
        grade = "F"

    print(f"  🪝  Hook Strength: {hook_strength_score:.1f}/25.0 ({hook_source}, score: {hook_score_12:.1f}/12.0)")
    print(f"  ⏱️  Pacing:        {pacing_score:.1f}/25.0 ({pacing_detail})")
    print(f"  🖼️  Scene Density: {scene_density_score:.1f}/25.0 ({scene_detail})")
    print(f"  🎭 Emotional Arc:  {emotional_arc_score:.1f}/25.0 ({emotion_detail})")
    print(f"  🏆 Estimated Total Score: {total_int}/100 (Grade: {grade})")
    print("═" * 60 + "\n")

    return {
        "total": total_int,
        "grade": grade,
        "estimated": True
    }


def step_score_metadata(
    script: dict,
    manifest: dict,
    audio_duration_ms: float,
) -> dict:
    """
    Score the script and manifest for estimated retention metrics:
    hook strength, pacing, scene density, and emotional arc.
    """
    print("\n" + "═" * 60)
    print("  📊 STEP 4.5: Reel Metadata Scoring & Analysis")
    print("═" * 60)

    # 1. Hook Strength (0-25)
    hook_analysis = script.get("hook_analysis", {})
    best_hook_data = hook_analysis.get("best", {})
    hook_score_12 = best_hook_data.get("score", {}).get("total", 6.0)
    hook_strength_score = (hook_score_12 / 12.0) * 25.0
    hook_source = best_hook_data.get("source", "original")
    
    # 2. Pacing (0-25)
    total_words = 0
    for s in manifest.get("sentences", []):
        total_words += len(s.get("words", []))
    
    duration_sec = audio_duration_ms / 1000.0
    wps = total_words / duration_sec if duration_sec > 0 else 0.0
    
    if 2.5 <= wps <= 3.2:
        pacing_score = 25.0
        pacing_detail = f"{wps:.1f} words/sec (ideal)"
    elif wps < 2.5:
        pacing_score = max(0.0, 25.0 * (wps - 1.5) / (2.5 - 1.5))
        pacing_detail = f"{wps:.1f} words/sec (slow)"
    else:
        pacing_score = max(0.0, 25.0 * (4.5 - wps) / (4.5 - 3.2))
        pacing_detail = f"{wps:.1f} words/sec (fast)"

    # 3. Scene Density (0-25)
    # Count actual unique scene images, not sentences
    scene_images = set()
    for s in manifest.get("sentences", []):
        img = s.get("image", "")
        if img:
            scene_images.add(img)
    scene_count = len(scene_images) if scene_images else len(manifest.get("sentences", []))
    sps = scene_count / duration_sec if duration_sec > 0 else 0.0
    
    if 0.25 <= sps <= 0.5:
        scene_density_score = 25.0
        scene_detail = f"{sps:.2f} scenes/sec (ideal)"
    elif sps < 0.25:
        scene_density_score = max(0.0, 25.0 * (sps - 0.1) / (0.25 - 0.1))
        scene_detail = f"{sps:.2f} scenes/sec (slow cuts)"
    else:
        scene_density_score = max(0.0, 25.0 * (0.8 - sps) / (0.8 - 0.5))
        scene_detail = f"{sps:.2f} scenes/sec (rapid cuts)"

    # 4. Emotional Arc (0-25)
    def _emotion_density(text: str) -> float:
        """Compute weighted emotion density for a sentence."""
        text_lower = text.lower()
        words = [w.strip(".,?!\"';:") for w in text_lower.split()]
        
        # Weighted single-word score
        score = sum(EMOTION_LEXICON.get(w, 0.0) for w in words)
        
        # Bigram bonus
        for bigram, weight in EMOTION_BIGRAMS.items():
            if bigram in text_lower:
                score += weight
        
        return score / max(len(words), 1)

    sentences = manifest.get("sentences", [])
    sentence_emotion_densities = []
    for s in sentences:
        density = _emotion_density(s.get("text", ""))
        sentence_emotion_densities.append(density)
        
    n_sents = len(sentences)
    if n_sents >= 3:
        act_size = n_sents // 3
        act1 = sentence_emotion_densities[:act_size]
        act2 = sentence_emotion_densities[act_size:2*act_size]
        act3 = sentence_emotion_densities[2*act_size:]
        
        mean1 = sum(act1) / len(act1) if act1 else 0.0
        mean2 = sum(act2) / len(act2) if act2 else 0.0
        mean3 = sum(act3) / len(act3) if act3 else 0.0
        
        act_means = [mean1, mean2, mean3]
        overall_mean = sum(act_means) / 3.0
        variance = sum((m - overall_mean) ** 2 for m in act_means) / 3.0
        std_dev = variance ** 0.5
        
        emotional_arc_score = min(25.0, 25.0 * (std_dev / 0.10))
        
        if std_dev > 0.06:
            emotion_detail = f"StDev={std_dev:.3f} (strong contrast)"
        elif std_dev > 0.02:
            emotion_detail = f"StDev={std_dev:.3f} (moderate contrast)"
        else:
            emotion_detail = f"StDev={std_dev:.3f} (flat arc)"
    else:
        emotional_arc_score = 12.5
        emotion_detail = f"Too few sentences ({n_sents})"
        
    total_score = hook_strength_score + pacing_score + scene_density_score + emotional_arc_score
    total_int = round(total_score)
    
    if total_int >= 90:
        grade = "A+"
    elif total_int >= 80:
        grade = "A"
    elif total_int >= 65:
        grade = "B"
    elif total_int >= 50:
        grade = "C"
    elif total_int >= 35:
        grade = "D"
    else:
        grade = "F"
        
    # Prescriptive Suggestions
    suggestions = []
    if hook_strength_score < 15.0:
        suggestions.append("🪝 Hook: Try a question or bold claim opening — run without --no-hook-optimize to auto-generate variations")
    if pacing_score < 15.0:
        if wps < 2.5:
            suggestions.append(f"⏱️ Pacing: Too slow ({wps:.1f} wps) — reduce sentence count or shorten sentences to hit 2.5-3.2 wps")
        else:
            suggestions.append(f"⏱️ Pacing: Too fast ({wps:.1f} wps) — add pauses or reduce word density to hit 2.5-3.2 wps")
    if scene_density_score < 15.0:
        if sps < 0.25:
            suggestions.append(f"🖼️ Scenes: Too few scene changes ({sps:.2f}/sec) — increase --sentences or add more varied environments")
        else:
            suggestions.append(f"🖼️ Scenes: Too many rapid cuts ({sps:.2f}/sec) — reduce sentence count or reuse environments for visual continuity")
    if emotional_arc_score < 15.0:
        suggestions.append("🎭 Arc: Emotional tone is too flat — vary intensity across beginning/middle/end (e.g., calm opening → tense middle → impactful ending)")

    result = {
        "hook_strength": {
            "score": round(hook_strength_score, 1),
            "max": 25,
            "detail": f"{hook_source.capitalize()} Hook ({hook_score_12:.1f}/12)"
        },
        "pacing": {
            "score": round(pacing_score, 1),
            "max": 25,
            "wps": round(wps, 2),
            "detail": pacing_detail
        },
        "scene_density": {
            "score": round(scene_density_score, 1),
            "max": 25,
            "sps": round(sps, 2),
            "detail": scene_detail
        },
        "emotional_arc": {
            "score": round(emotional_arc_score, 1),
            "max": 25,
            "detail": emotion_detail
        },
        "total": total_int,
        "grade": grade,
        "suggestions": suggestions
    }
    
    # Render scorecard table
    print(f"  ┌────────────────────┬───────┬────────────────────────┐")
    print(f"  │ Metric             │ Score │ Detail                 │")
    print(f"  ├────────────────────┼───────┼────────────────────────┤")
    print(f"  │ 🪝 Hook Strength   │ {result['hook_strength']['score']:>4.1f}/25 │ {result['hook_strength']['detail']:<22} │")
    print(f"  │ ⏱️  Pacing          │ {result['pacing']['score']:>4.1f}/25 │ {result['pacing']['detail']:<22} │")
    print(f"  │ 🖼️  Scene Density   │ {result['scene_density']['score']:>4.1f}/25 │ {result['scene_density']['detail']:<22} │")
    print(f"  │ 🎭 Emotional Arc   │ {result['emotional_arc']['score']:>4.1f}/25 │ {result['emotional_arc']['detail']:<22} │")
    print(f"  ├────────────────────┼───────┼────────────────────────┤")
    print(f"  │ 🏆 TOTAL           │ {result['total']:>3d}/100 │ Grade: {result['grade']:<15} │")
    print(f"  └────────────────────┴───────┴────────────────────────┘")
    
    if suggestions:
        print("\n  💡 Suggestions to improve score:")
        for s in suggestions:
            print(f"     {s}")
    print("═" * 60)
    
    return result



# ── Step 5: Render Video ──────────────────────────────────────────────────

def step_render_video(
    manifest: dict,
    output_dir: Path,
    image_paths: list[str],
    audio_path: str,
) -> str:
    """
    Copy assets into Remotion's public/ directory and render the final MP4.

    Returns:
        Path to the rendered MP4 file.
    """
    print("\n" + "═" * 60)
    print("  🎬 STEP 5: Rendering Final Video via Remotion")
    print("═" * 60)

    # ── Prepare public/ directory ──
    render_public = REMOTION_PUBLIC
    render_public.mkdir(parents=True, exist_ok=True)
    render_images_dir = render_public / "images"
    render_images_dir.mkdir(parents=True, exist_ok=True)

    # Copy audio file
    audio_dest = render_public / "voiceover.mp3"
    shutil.copy2(audio_path, audio_dest)
    print(f"  📁 Copied audio → {audio_dest.name}")

    # Copy images
    for i, img_path in enumerate(image_paths):
        if img_path and os.path.exists(img_path):
            dest = render_images_dir / f"scene_{i + 1:03d}.png"
            shutil.copy2(img_path, dest)
    print(f"  📁 Copied {len(image_paths)} images → public/images/")

    # ── Build props.json ──
    # Transform manifest into Remotion-compatible props
    props = _build_remotion_props(manifest)
    props_path = render_public / "props.json"
    with open(props_path, "w") as f:
        json.dump(props, f, indent=2)
    print(f"  📄 Props saved → {props_path.name}")

    # ── Render ──
    output_mp4 = str(output_dir.resolve() / "reel.mp4")
    props_path_abs = str(props_path.resolve())
    print(f"\n  🎬 Rendering {manifest['total_frames']} frames at {FPS}fps...")
    print(f"     Output: {output_mp4}")

    start = time.time()
    cmd = [
        "npx", "remotion", "render",
        "ReelComposition",
        output_mp4,
        f"--props={props_path_abs}",
    ]

    result = subprocess.run(
        cmd,
        cwd=str(REMOTION_DIR),
        capture_output=True,
        text=True,
        timeout=600,  # 10 minute timeout
    )

    elapsed = time.time() - start

    if result.returncode != 0:
        print(f"  ❌ Remotion render failed (exit code {result.returncode})")
        print(f"     stderr: {result.stderr[:500]}")
        print(f"     stdout: {result.stdout[:500]}")
        raise RuntimeError(f"Remotion render failed: {result.stderr[:200]}")

    if os.path.exists(output_mp4):
        size_mb = os.path.getsize(output_mp4) / (1024 * 1024)
        duration_s = manifest["total_frames"] / FPS
        print(f"\n  ✅ Render complete!")
        print(f"     📹 {output_mp4}")
        print(f"     📐 {WIDTH}×{HEIGHT} ({WIDTH}:{HEIGHT})")
        print(f"     ⏱️  {duration_s:.1f}s duration")
        print(f"     💾 {size_mb:.1f} MB")
        print(f"     ⚡ Rendered in {elapsed:.1f}s")
    else:
        raise RuntimeError(f"Render output not found: {output_mp4}")

    return output_mp4


def _build_remotion_props(manifest: dict) -> dict:
    """
    Transform the reel manifest into Remotion ReelComposition props format.

    Remotion expects:
      - audioUrl: staticFile path
      - brollImages: [{url, durationInFrames, act}]
      - subtitles: [{text, startFrame, endFrame, act, words: [{text, startFrame, endFrame}]}]
    """
    sentences = manifest["sentences"]
    n = len(sentences)

    # Build brollImages array
    broll_images = []
    for i, s in enumerate(sentences):
        # Determine act (1, 2, or 3) deterministically from sentence position
        if n <= 1:
            act = 1
        elif n == 2:
            act = 1 if i == 0 else 3
        else:
            ratio = i / n
            if ratio < 1.0 / 3.0:
                act = 1
            elif ratio < 2.0 / 3.0:
                act = 2
            else:
                act = 3

        start = s["start_frame"]
        end = s.get("image_end_frame", s["end_frame"])
        duration = max(end - start, 1)
        broll_images.append({
            "url": s["image_file"],
            "durationInFrames": duration,
            "act": act,
        })

    # Build subtitles array with word-level timing
    subtitles = []
    for i, s in enumerate(sentences):
        # Determine act (1, 2, or 3) deterministically from sentence position
        if n <= 1:
            act = 1
        elif n == 2:
            act = 1 if i == 0 else 3
        else:
            ratio = i / n
            if ratio < 1.0 / 3.0:
                act = 1
            elif ratio < 2.0 / 3.0:
                act = 2
            else:
                act = 3

        words = []
        for w in s.get("words", []):
            words.append({
                "text": w["text"],
                "startFrame": w["start_frame"],
                "endFrame": w["end_frame"],
            })
        subtitles.append({
            "text": s["text"],
            "startFrame": s["start_frame"],
            "endFrame": s["end_frame"],
            "act": act,
            "words": words,
        })

    return {
        "audioUrl": manifest["audio_file"],
        "brollImages": broll_images,
        "subtitles": subtitles,
        "totalFrames": manifest["total_frames"],
    }


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Reelmation — Automated Reel Generator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate a full reel:
  ./venv/bin/python generate_reel.py "A miracle baby story"

  # With custom voice and speed:
  ./venv/bin/python generate_reel.py "Ancient underwater city" \\
      --voice en-US-ChristopherNeural --rate "+5%"

  # Skip image generation (for testing):
  ./venv/bin/python generate_reel.py "Time traveler" --skip-images

  # Shorter reel (fewer sentences):
  ./venv/bin/python generate_reel.py "A haunted mirror" --sentences 12
        """,
    )

    parser.add_argument(
        "topic",
        help="The reel topic / story idea",
    )
    parser.add_argument(
        "--voice", "-v",
        default="en-US-GuyNeural",
        help="Edge-TTS voice (default: en-US-GuyNeural)",
    )
    parser.add_argument(
        "--rate", "-r",
        default="+10%",
        help="Speech rate (e.g. '+5%%', '-10%%'). Default: +10%%",
    )
    parser.add_argument(
        "--pitch",
        default="+0Hz",
        help="Speech pitch (e.g. '+2Hz', '-3Hz'). Default: +0Hz",
    )
    parser.add_argument(
        "--style", "-s",
        default="dramatic",
        help="Story style/tone (dramatic, mysterious, scary, etc.)",
    )
    parser.add_argument(
        "--output-dir", "-o",
        default="./output",
        help="Base output directory. Default: ./output",
    )
    parser.add_argument(
        "--sentences", "-n",
        type=int,
        default=12,
        help="Target sentence count (controls reel length). Default: 12 (~30-45s)",
    )
    parser.add_argument(
        "--skip-images",
        action="store_true",
        help="Skip image generation (use placeholder images)",
    )
    parser.add_argument(
        "--persona-file",
        help="Path to a custom persona/system prompt text file",
    )
    parser.add_argument(
        "--cache",
        action="store_true",
        default=True,
        help="Reuse cached LLM script if available (default: on)",
    )
    parser.add_argument(
        "--no-cache",
        action="store_true",
        help="Force regeneration of script (ignore cache)",
    )
    parser.add_argument(
        "--from-script",
        help="Skip LLM entirely — load script from a previous reel_script.json",
    )
    parser.add_argument(
        "--no-hook-optimize",
        action="store_true",
        help="Skip hook optimization (keep original first sentence)",
    )
    parser.add_argument(
        "--reuse",
        help="Reuse an existing run directory (reuses script and images, skipping expensive generation)",
    )

    args = parser.parse_args()

    # Create output directory with timestamp or reuse existing
    if args.reuse:
        output_dir = Path(args.reuse)
        if not output_dir.exists():
            raise FileNotFoundError(f"Reuse directory does not exist: {args.reuse}")
        # Automatically load script from the reuse directory
        args.from_script = str(output_dir / "reel_script.json")
        print(f"  ♻️  Reusing run directory: {output_dir}")
    else:
        topic_slug = re.sub(r"[^\w\s-]", "", args.topic.lower())
        topic_slug = re.sub(r"[\s]+", "_", topic_slug)[:40]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = Path(args.output_dir) / f"{topic_slug}_{timestamp}"
        output_dir.mkdir(parents=True, exist_ok=True)

    print("╔" + "═" * 58 + "╗")
    print("║  🎬 REELMATION — Automated Reel Generator" + " " * 15 + "║")
    print("╠" + "═" * 58 + "╣")
    print(f"║  Topic: {args.topic[:48]:<48}  ║")
    print(f"║  Output: {str(output_dir)[:47]:<47}  ║")
    print("╚" + "═" * 58 + "╝")

    overall_start = time.time()

    try:
        # ── Step 1: Generate Script ──
        script = step_generate_script(
            topic=args.topic,
            style=args.style,
            num_sentences=args.sentences,
            persona_file=args.persona_file,
            use_cache=not args.no_cache,
            from_script=args.from_script,
            optimize_hook=not args.no_hook_optimize,
        )

        # ── Step 1.5: Pre-Score (text-only dry run) ──
        prescore = step_prescore_script(
            script=script,
            num_sentences=args.sentences,
        )
        if prescore["total"] < 70 and not args.from_script:
            print(f"  ⚠️  Pre-score {prescore['total']}/100 is below 70 — regenerating script...")
            script = step_generate_script(
                topic=args.topic,
                style=args.style,
                num_sentences=args.sentences,
                persona_file=args.persona_file,
                use_cache=False,  # Force fresh generation
                from_script=args.from_script,
                optimize_hook=not args.no_hook_optimize,
            )
            prescore = step_prescore_script(script=script, num_sentences=args.sentences)
            print(f"  📊 Re-scored: {prescore['total']}/100")

        # Save raw script
        script_path = output_dir / "reel_script.json"
        with open(script_path, "w") as f:
            json.dump(script, f, indent=2)
        print(f"  💾 Script saved: {script_path}")

        # ── Step 2: Generate Voiceover ──
        word_boundaries, audio_path, audio_duration_ms = step_generate_voiceover(
            script=script,
            output_dir=output_dir,
            voice=args.voice,
            rate=args.rate,
            pitch=args.pitch,
        )

        # Validate: audio duration should be 20-60 seconds
        if audio_duration_ms < 15000:
            print(f"  ⚠️  Audio is very short ({audio_duration_ms/1000:.1f}s) — reel may feel rushed")
        elif audio_duration_ms > 65000:
            print(f"  ⚠️  Audio is very long ({audio_duration_ms/1000:.1f}s) — may exceed reel limits")

        # ── Step 3: Generate Images ──
        image_paths = step_generate_images(
            script=script,
            output_dir=output_dir,
            skip_images=args.skip_images,
        )

        # ── Step 4: Build Manifest ──
        manifest = step_build_manifest(
            script=script,
            word_boundaries=word_boundaries,
            image_paths=image_paths,
            audio_path=audio_path,
            audio_duration_ms=audio_duration_ms,
            output_dir=output_dir,
        )

        # ── Step 4.5: Score Metadata ──
        metadata_score = step_score_metadata(
            script=script,
            manifest=manifest,
            audio_duration_ms=audio_duration_ms,
        )
        manifest["metadata_score"] = metadata_score
        
        # Save updated manifest with score
        manifest_path = output_dir / "reel_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

        # ── Step 5: Render Video ──
        output_mp4 = step_render_video(
            manifest=manifest,
            output_dir=output_dir,
            image_paths=image_paths,
            audio_path=audio_path,
        )

        # ── Done ──
        total_time = time.time() - overall_start
        print("\n" + "╔" + "═" * 58 + "╗")
        print("║  ✅ REEL GENERATION COMPLETE!" + " " * 29 + "║")
        print("╠" + "═" * 58 + "╣")
        print(f"║  📹 Video:  {output_mp4[-46:]:<46}  ║")
        print(f"║  ⏱️  Total:  {total_time:.0f}s" + " " * (46 - len(f"{total_time:.0f}s")) + "  ║")
        print("╚" + "═" * 58 + "╝")

    except KeyboardInterrupt:
        print("\n\n  ⛔ Interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n  ❌ PIPELINE FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
