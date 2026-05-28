#!/usr/bin/env python3
"""
Persona Extractor for Reelmation
=================================
Downloads reels from Instagram links, transcribes the audio,
and sends all transcriptions to the Gemini Agent to extract
a detailed content creator persona.

Module: reelmation.agents.persona_agent

Usage:
    # 1. Paste links into a file (one per line):
    python -m reelmation.agents.persona_agent --links reels.txt --name creator_name

    # 2. Pass links directly as args:
    python -m reelmation.agents.persona_agent --name creator_name \\
        https://www.instagram.com/reel/ABC123/ \\
        https://www.instagram.com/p/DEF456/

    # 3. Interactive mode — paste links into terminal:
    python -m reelmation.agents.persona_agent --name creator_name

Dependencies:
    pip install yt-dlp faster-whisper
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional


# ── Constants ──────────────────────────────────────────────────────────────
DOWNLOAD_DIR = Path("downloads")
AUDIO_DIR = Path("downloads/audio")
TRANSCRIPTS_DIR = Path("downloads/transcripts")

# Instagram URL patterns
IG_URL_PATTERN = re.compile(
    r"https?://(?:www\.)?instagram\.com/(?:reel|p|reels)/([A-Za-z0-9_-]+)"
)


# ── Step 0: Collect Links ──────────────────────────────────────────────────


def collect_links(
    links_file: Optional[str] = None,
    cli_urls: Optional[list[str]] = None,
) -> list[str]:
    """
    Collect Instagram reel URLs from various sources.

    Priority:
    1. Links file (--links reels.txt)
    2. CLI arguments (urls passed directly)
    3. Interactive mode (paste into terminal)

    Returns:
        List of valid Instagram URLs.
    """
    urls = []

    # Source 1: Links file
    if links_file:
        links_path = Path(links_file)
        if not links_path.exists():
            print(f"  ❌ Links file not found: {links_file}")
            sys.exit(1)

        raw_lines = links_path.read_text().strip().splitlines()
        for line in raw_lines:
            line = line.strip()
            if line and not line.startswith("#"):
                urls.append(line)

        print(f"  📄 Loaded {len(urls)} link(s) from {links_file}")

    # Source 2: CLI arguments
    elif cli_urls:
        urls = [u.strip() for u in cli_urls if u.strip()]
        print(f"  🔗 Got {len(urls)} link(s) from arguments")

    # Source 3: Interactive paste
    else:
        print("  📋 Paste Instagram reel links below (one per line).")
        print("     Press Enter on an empty line when done.\n")

        while True:
            try:
                line = input("  > ").strip()
            except (EOFError, KeyboardInterrupt):
                print()
                break
            if not line:
                break
            urls.append(line)

        print(f"\n  🔗 Got {len(urls)} link(s) from input")

    # Validate URLs
    valid_urls = []
    for url in urls:
        if IG_URL_PATTERN.search(url):
            valid_urls.append(url)
        elif "instagram.com" in url:
            # Might still work, yt-dlp is flexible
            valid_urls.append(url)
        else:
            print(f"  ⚠️  Skipping non-Instagram URL: {url[:60]}...")

    if not valid_urls:
        print("  ❌ No valid Instagram URLs found.")
        sys.exit(1)

    return valid_urls


# ── Step 1: Download Reels ─────────────────────────────────────────────────


def download_reels(
    urls: list[str],
    name: str,
    output_dir: Path = DOWNLOAD_DIR,
    cookies_browser: str = "firefox",
) -> list[Path]:
    """
    Download reels from a list of Instagram URLs using yt-dlp.

    Args:
        urls: List of Instagram reel URLs.
        name: Creator name (used for file naming).
        output_dir: Directory to save downloaded videos.
        cookies_browser: Browser to grab cookies from.

    Returns:
        List of paths to downloaded video files.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'─' * 60}")
    print(f"  📥 Downloading {len(urls)} reel(s)")
    print(f"{'─' * 60}")

    downloaded = []

    for i, url in enumerate(urls, 1):
        # Extract reel ID from URL
        match = IG_URL_PATTERN.search(url)
        reel_id = match.group(1) if match else f"reel_{i}"

        output_path = output_dir / f"{name}_{reel_id}.mp4"

        # Skip if already downloaded
        if output_path.exists() and output_path.stat().st_size > 0:
            size_mb = output_path.stat().st_size / (1024 * 1024)
            print(f"  ⏭️  [{i}/{len(urls)}] Already have: {output_path.name} ({size_mb:.1f} MB)")
            downloaded.append(output_path)
            continue

        print(f"  📥 [{i}/{len(urls)}] {url[:60]}...")

        output_template = str(output_dir / f"{name}_{reel_id}.%(ext)s")

        cmd = [
            sys.executable, "-m", "yt_dlp",
            url,
            "--output", output_template,
            "-f", "best[ext=mp4]/best",
            "--no-overwrites",
            "--cookies-from-browser", cookies_browser,
            "--ignore-errors",
            "--no-warnings",
            "--quiet",
            "--progress",
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,
            )

            # Check for downloaded file (might have different extension)
            for ext in ["mp4", "webm", "mkv"]:
                candidate = output_dir / f"{name}_{reel_id}.{ext}"
                if candidate.exists() and candidate.stat().st_size > 0:
                    size_mb = candidate.stat().st_size / (1024 * 1024)
                    print(f"     ✅ {candidate.name} ({size_mb:.1f} MB)")
                    downloaded.append(candidate)
                    break
            else:
                stderr = result.stderr.strip()
                if "login" in stderr.lower() or "cookie" in stderr.lower():
                    print(f"     ❌ Login required. Log into Instagram in {cookies_browser} first.")
                elif stderr:
                    print(f"     ❌ Failed: {stderr[:120]}")
                else:
                    print(f"     ❌ Failed (no output)")

        except subprocess.TimeoutExpired:
            print(f"     ❌ Timeout after 120s")
        except FileNotFoundError:
            print("  ❌ yt-dlp not found. Install with: pip install yt-dlp")
            sys.exit(1)

        # Be polite — small delay between downloads
        if i < len(urls):
            time.sleep(2)

    print(f"\n  ✅ Downloaded {len(downloaded)}/{len(urls)} reel(s)")
    return downloaded


# ── Step 2: Extract Audio ──────────────────────────────────────────────────


def extract_audio(video_path: Path, audio_dir: Path = AUDIO_DIR) -> Optional[Path]:
    """Extract audio from a video file using ffmpeg."""
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"{video_path.stem}.wav"

    if audio_path.exists():
        print(f"     ⏭️  Audio cached: {audio_path.name}")
        return audio_path

    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        "-y",
        str(audio_path),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"     ❌ ffmpeg failed: {result.stderr[:150]}")
        return None

    return audio_path


def extract_all_audio(video_files: list[Path]) -> list[Path]:
    """Extract audio from all video files."""
    print(f"\n{'─' * 60}")
    print(f"  🎵 Extracting audio from {len(video_files)} video(s)")
    print(f"{'─' * 60}")

    audio_files = []
    for vf in video_files:
        print(f"  📹 {vf.name}")
        af = extract_audio(vf)
        if af:
            audio_files.append(af)

    print(f"\n  ✅ Extracted {len(audio_files)} audio file(s)")
    return audio_files


# ── Step 3: Transcribe Audio ──────────────────────────────────────────────


def transcribe_all(
    audio_files: list[Path],
    model_size: str = "base",
) -> list[dict]:
    """Transcribe all audio files using faster-whisper."""
    print(f"\n{'─' * 60}")
    print(f"  📝 Transcribing {len(audio_files)} audio file(s)")
    print(f"     Model: faster-whisper ({model_size})")
    print(f"{'─' * 60}")

    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    transcripts = []
    whisper_model = None
    using_cpu = False

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("  ❌ faster-whisper not installed.")
        print("     pip install faster-whisper")
        sys.exit(1)

    def _load_model(device="cuda", compute_type="float16"):
        nonlocal whisper_model, using_cpu
        print(f"     🧠 Loading Whisper ({model_size}) on {device}...")
        try:
            whisper_model = WhisperModel(
                model_size, device=device, compute_type=compute_type
            )
            if device == "cuda":
                print(f"     ✅ Using GPU (CUDA)")
            else:
                print(f"     ✅ Using CPU")
                using_cpu = True
        except Exception as e:
            if device == "cuda":
                print(f"     ⚠️  CUDA load failed: {e}")
                print(f"     ⚠️  Falling back to CPU...")
                _load_model(device="cpu", compute_type="int8")
            else:
                raise

    def _transcribe_file(af: Path) -> tuple[str, str]:
        """Transcribe a single file, with CUDA→CPU fallback."""
        nonlocal whisper_model, using_cpu
        try:
            segments, info = whisper_model.transcribe(str(af), beam_size=5)
            text_parts = [seg.text.strip() for seg in segments]
            full_text = " ".join(text_parts)
            lang = info.language if info else "?"
            return full_text, lang
        except RuntimeError as e:
            if not using_cpu and ("cublas" in str(e).lower() or "cuda" in str(e).lower()):
                print(f"     ⚠️  CUDA runtime error: {str(e)[:80]}")
                print(f"     ⚠️  Reloading model on CPU...")
                _load_model(device="cpu", compute_type="int8")
                return _transcribe_file(af)
            raise

    for af in audio_files:
        print(f"\n  🎵 {af.name}")

        transcript_path = TRANSCRIPTS_DIR / f"{af.stem}.txt"

        # Check cache
        if transcript_path.exists():
            text = transcript_path.read_text().strip()
            if text:
                print(f"     ⏭️  Cached: {len(text)} chars")
                transcripts.append({"filename": af.stem, "transcript": text})
                continue

        # Lazy-load model on first uncached file
        if whisper_model is None:
            _load_model()

        print(f"     🎙️  Transcribing...")
        full_text, lang = _transcribe_file(af)

        transcript_path.write_text(full_text)

        print(f"     ✅ Done ({lang}): {len(full_text)} chars")
        transcripts.append({"filename": af.stem, "transcript": full_text})

    print(f"\n  ✅ Transcribed {len(transcripts)} reel(s)")
    return transcripts


# ── Step 4: Extract Persona via Gemini ─────────────────────────────────────


def extract_persona(transcripts: list[dict], name: str) -> str:
    """Send all transcriptions to Gemini Agent to extract a persona."""
    from reelmation.agents.gemini_client import GeminiClient

    print(f"\n{'─' * 60}")
    print(f"  🤖 Extracting persona via Gemini Agent")
    print(f"{'─' * 60}")

    agent = GeminiClient(
        persona=(
            "You are an expert content analyst and persona designer. "
            "You analyze social media content to understand a creator's unique "
            "voice, style, tone, recurring themes, and personality. "
            "You create detailed, actionable persona profiles."
        )
    )

    # Build the analysis prompt
    transcript_block = ""
    for i, t in enumerate(transcripts, 1):
        text = t["transcript"]
        if text.strip():
            transcript_block += f"\n--- Reel {i} ({t['filename']}) ---\n{text}\n"

    if not transcript_block.strip():
        print("  ⚠️  No non-empty transcripts to analyze.")
        return ""

    prompt = f"""I have transcriptions from {len(transcripts)} Instagram reels by @{name}.

Analyze ALL of these transcripts and create a detailed persona profile that captures this creator's unique voice and style.

{transcript_block}

Based on the above transcripts, create a DETAILED PERSONA PROFILE with the following sections:

1. **Voice & Tone**: How they speak, formality level, energy level
2. **Recurring Themes**: Topics they keep coming back to
3. **Vocabulary & Phrases**: Signature words, catchphrases, slang
4. **Storytelling Style**: How they structure their narratives, hooks, pacing
5. **Audience Relationship**: How they address/interact with viewers
6. **Emotional Range**: What emotions they convey most
7. **Content Patterns**: Typical reel structure, length preferences

Then write a **SYSTEM PROMPT** that I can use to make an AI mimic this creator's exact style. The system prompt should be a single paragraph starting with "You are..." that captures everything above.

Format your response as:
## Persona Analysis
[analysis sections]

## System Prompt
[the ready-to-use system prompt]"""

    print(f"  📊 Analyzing {len(transcripts)} transcripts...")
    print(f"     Total text: {len(transcript_block)} chars")

    response = agent.ask(prompt)

    # Save the persona
    TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    persona_path = TRANSCRIPTS_DIR / f"{name}_persona.md"
    persona_path.write_text(f"# Persona: @{name}\n\n{response}")
    print(f"\n  ✅ Persona saved to: {persona_path}")

    # Extract system prompt for easy reuse
    system_prompt = ""
    if "## System Prompt" in response:
        system_prompt = response.split("## System Prompt")[-1].strip()
        system_prompt = re.sub(r"^[#*`\s]+", "", system_prompt)
        system_prompt = system_prompt.strip()

        prompt_path = TRANSCRIPTS_DIR / f"{name}_system_prompt.txt"
        prompt_path.write_text(system_prompt)
        print(f"  ✅ System prompt saved to: {prompt_path}")

    return response


# ── Main ───────────────────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Extract a content creator persona from Instagram reels",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # From a links file (one URL per line):
  python persona_extractor.py --name mkbhd --links reels.txt

  # Direct URLs as arguments:
  python persona_extractor.py --name mkbhd \\
      https://www.instagram.com/reel/ABC123/ \\
      https://www.instagram.com/p/DEF456/

  # Interactive — paste links when prompted:
  python persona_extractor.py --name mkbhd

  # Skip steps (use cached data):
  python persona_extractor.py --name mkbhd --skip-download
  python persona_extractor.py --name mkbhd --skip-download --skip-transcribe
        """,
    )
    parser.add_argument(
        "--name", "-n",
        required=True,
        help="Creator name (used for file naming and persona context)",
    )
    parser.add_argument(
        "--links", "-l",
        help="Path to a text file with Instagram URLs (one per line)",
    )
    parser.add_argument(
        "urls",
        nargs="*",
        help="Instagram reel URLs (alternative to --links)",
    )
    parser.add_argument(
        "--whisper-model",
        choices=["tiny", "base", "small", "medium", "large-v3"],
        default="base",
        help="Whisper model size for transcription (default: base)",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip downloading, use already downloaded videos",
    )
    parser.add_argument(
        "--skip-transcribe",
        action="store_true",
        help="Skip transcription, use cached transcripts",
    )
    parser.add_argument(
        "--cookies-browser",
        default="firefox",
        choices=["firefox", "chrome", "chromium", "edge", "brave"],
        help="Browser to grab cookies from for Instagram auth (default: firefox)",
    )

    args = parser.parse_args()
    name = args.name.lstrip("@")

    print("=" * 60)
    print(f"  🎬 Reelmation — Persona Extractor")
    print(f"  Creator: @{name}")
    print("=" * 60)

    # ── Step 1: Download ──
    if not args.skip_download:
        # Collect URLs
        print(f"\n{'─' * 60}")
        print(f"  🔗 Collecting reel links")
        print(f"{'─' * 60}")

        urls = collect_links(
            links_file=args.links,
            cli_urls=args.urls if args.urls else None,
        )

        video_files = download_reels(
            urls, name, cookies_browser=args.cookies_browser
        )
    else:
        # Find already downloaded files
        video_files = sorted(
            [
                f
                for f in DOWNLOAD_DIR.glob(f"{name}_*.*")
                if f.suffix in {".mp4", ".webm", ".mkv"}
                and f.stat().st_size > 0
            ],
            key=lambda f: f.stat().st_mtime,
        )
        print(f"\n  ⏭️  Skipping download, found {len(video_files)} existing video(s)")

    if not video_files:
        print("\n  ❌ No video files found. Exiting.")
        sys.exit(1)

    # ── Step 2: Extract Audio ──
    audio_files = extract_all_audio(video_files)

    if not audio_files:
        print("\n  ❌ No audio extracted. Exiting.")
        sys.exit(1)

    # ── Step 3: Transcribe ──
    if not args.skip_transcribe:
        transcripts = transcribe_all(audio_files, model_size=args.whisper_model)
    else:
        transcripts = []
        for af in audio_files:
            tp = TRANSCRIPTS_DIR / f"{af.stem}.txt"
            if tp.exists():
                transcripts.append({
                    "filename": af.stem,
                    "transcript": tp.read_text().strip(),
                })
        print(f"\n  ⏭️  Using {len(transcripts)} cached transcript(s)")

    if not transcripts:
        print("\n  ❌ No transcripts generated. Exiting.")
        sys.exit(1)

    # ── Step 4: Extract Persona ──
    persona = extract_persona(transcripts, name)

    # ── Done ──
    print("\n" + "=" * 60)
    print("  ✅ DONE!")
    print("=" * 60)
    print(f"\n  📁 Output files:")
    print(f"     {TRANSCRIPTS_DIR}/{name}_persona.md       — Full analysis")
    print(f"     {TRANSCRIPTS_DIR}/{name}_system_prompt.txt — Ready-to-use prompt")
    print()
    print(f"  💡 Use in your code:")
    print(f'     from reelmation.agents.gemini_client import GeminiClient')
    print(f'     persona = open("{TRANSCRIPTS_DIR}/{name}_system_prompt.txt").read()')
    print(f'     agent = GeminiClient(persona=persona)')
    print()


if __name__ == "__main__":
    main()
