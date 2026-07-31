"""
Core pipeline orchestrating the entire reel generation process.
"""
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Optional

from reelmation.agents.script_agent import ScriptAgent, EMOTION_LEXICON, EMOTION_BIGRAMS
from reelmation.media.tts_engine import TextToSpeech
from reelmation.media.image_engine import ImageEngine
from reelmation.core.remotion_builder import RemotionBuilder

FPS = 30
WIDTH = 1080
HEIGHT = 1920
END_BUFFER_MS = 1000


class ReelPipeline:
    """Orchestrates the entire end-to-end reel generation pipeline."""

    def __init__(self, project_root: Path):
        self.root = project_root
        self.remotion_dir = project_root / "remotion"
        self.remotion_public = self.remotion_dir / "public"
        self.cache_dir = project_root / ".cache" / "scripts"

    def generate(
        self,
        topic: str,
        output_dir: Path,
        style: str = "dramatic",
        num_sentences: int = 12,
        voice: str = "en-US-GuyNeural",
        rate: str = "+10%",
        pitch: str = "+0Hz",
        skip_images: bool = False,
        persona_file: Optional[str] = None,
        use_cache: bool = True,
        from_script: Optional[str] = None,
        optimize_hook: bool = True,
        knowledge_base: str = "",
    ) -> str:
        """Run the full generation pipeline and return the path to the rendered MP4."""
        output_dir.mkdir(parents=True, exist_ok=True)
        log_file = str(output_dir / "llm_debug.log")

        # ── Step 1: Generate or Load Script ──
        print("\n" + "=" * 60)
        print("  🤖 STEP 1: Generating Script via Gemini")
        print("=" * 60)

        script = self._get_script(
            topic=topic, style=style, num_sentences=num_sentences,
            persona_file=persona_file, use_cache=use_cache,
            from_script=from_script, optimize_hook=optimize_hook,
            log_file=log_file, knowledge_base=knowledge_base,
        )
        self._print_script_summary(script)

        # Save raw script
        script_path = output_dir / "reel_script.json"
        with open(script_path, "w") as f:
            json.dump(script, f, indent=2)
        print(f"  💾 Script saved: {script_path}")

        # ── Step 2: Generate Voiceover ──
        print("\n" + "=" * 60)
        print("  🎤 STEP 2: Generating Voiceover + Word Timestamps")
        print("=" * 60)

        audio_path = output_dir / "voiceover.mp3"
        full_text = " ".join(s["text"] for s in script["sentences"])

        tts = TextToSpeech()
        word_boundaries = tts.generate_with_timestamps(
            text=full_text, output_path=str(audio_path),
            voice=voice, rate=rate, pitch=pitch,
        )

        if word_boundaries:
            audio_duration_ms = word_boundaries[-1]["offset_ms"] + word_boundaries[-1]["duration_ms"]
        else:
            audio_duration_ms = 0

        # Duration validation
        if audio_duration_ms < 15000:
            print(f"  ⚠️  Audio is very short ({audio_duration_ms / 1000:.1f}s) -- reel may feel rushed")
        elif audio_duration_ms > 65000:
            print(f"  ⚠️  Audio is very long ({audio_duration_ms / 1000:.1f}s) -- may exceed reel limits")

        # ── Step 3: Generate Images ──
        print("\n" + "=" * 60)
        print("  🖼️  STEP 3: Generating Scene Images")
        print("=" * 60)

        image_paths = self._generate_images(script, output_dir, skip_images)

        # ── Step 4: Build Manifest ──
        print("\n" + "=" * 60)
        print("  🧩 STEP 4: Building Reel Manifest")
        print("=" * 60)

        manifest = self._build_manifest(
            script, word_boundaries, image_paths,
            str(audio_path), audio_duration_ms,
        )

        # ── Step 4.5: Score Metadata ──
        metadata_score = self._score_metadata(script, manifest, audio_duration_ms)
        manifest["metadata_score"] = metadata_score

        manifest_path = output_dir / "reel_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"  💾 Manifest saved: {manifest_path}")

        # ── Step 5: Render Video ──
        print("\n" + "=" * 60)
        print("  🎬 STEP 5: Rendering Final Video via Remotion")
        print("=" * 60)

        return self._render_video(manifest, output_dir, image_paths, str(audio_path))

    # ── Script Generation ──────────────────────────────────────────────────

    def _get_script(self, topic, style, num_sentences, persona_file,
                    use_cache, from_script, optimize_hook, log_file, knowledge_base=""):
        """Load script from file/cache or generate fresh via LLM."""
        # Load from existing file
        if from_script:
            script_path = Path(from_script)
            if not script_path.exists():
                raise FileNotFoundError(f"Script file not found: {from_script}")
            script = json.loads(script_path.read_text())
            print(f"  📂 Loaded script from: {from_script}")
            return script

        # Try cache
        if use_cache:
            cached = self._load_cached_script(topic, style, num_sentences)
            if cached:
                print(f"  💾 Using cached script (use --no-cache to regenerate)")
                return cached

        # Generate fresh
        persona = (
            "You are a viral social media reel scriptwriter for Reelmation. "
            "You write dramatic, cinematic short stories that captivate audiences "
            "in 30-45 second narrated video reels. Your stories are vivid, "
            "emotionally powerful, and always end with maximum impact."
        )
        if persona_file:
            try:
                persona = Path(persona_file).read_text().strip()
                print(f"  📜 Using custom persona from: {persona_file}")
            except FileNotFoundError:
                print(f"  ⚠️  Persona file not found: {persona_file}, using default")

        agent = ScriptAgent(persona=persona)
        script = agent.generate_reel_script(
            topic=topic, style=style, num_sentences=num_sentences,
            optimize_hook=optimize_hook, log_file=log_file,
            knowledgeBase=knowledge_base,
        )

        self._save_cached_script(topic, style, num_sentences, script)
        return script

    def _load_cached_script(self, topic, style, num_sentences):
        key = self._cache_key(topic, style, num_sentences)
        cache_file = self.cache_dir / f"{key}.json"
        if cache_file.exists():
            try:
                data = json.loads(cache_file.read_text())
                if "sentences" in data and len(data["sentences"]) >= 8:
                    return data
            except Exception:
                pass
        return None

    def _save_cached_script(self, topic, style, num_sentences, script):
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        key = self._cache_key(topic, style, num_sentences)
        cache_file = self.cache_dir / f"{key}.json"
        cache_file.write_text(json.dumps(script, indent=2))
        print(f"  💾 Script cached for reuse")

    @staticmethod
    def _cache_key(topic, style, num_sentences):
        slug = re.sub(r"[^\w\s-]", "", topic.lower())
        slug = re.sub(r"[\s]+", "_", slug)[:50]
        return f"{slug}__{style}__{num_sentences}"

    # ── Image Generation ───────────────────────────────────────────────────

    def _generate_images(self, script, output_dir, skip_images):
        image_paths = []
        engine = ImageEngine()
        total = len(script["sentences"])
        for i, s in enumerate(script["sentences"]):
            img_path = output_dir / f"scene_{i + 1:03d}.png"
            if not skip_images:
                result = engine.generate(s.get("image_prompt", ""), str(img_path))
                image_paths.append(result if result else "")
                status = "✅" if result else "⚠️  fallback"
                print(f"  {status} Scene {i + 1:02d}/{total}")
            else:
                image_paths.append("")
                print(f"  ⏭️  Scene {i + 1:02d} (skipped)")
        return image_paths

    # ── Manifest Building ──────────────────────────────────────────────────

    def _build_manifest(self, script, word_boundaries, image_paths, audio_path, audio_duration_ms):
        sentences = script["sentences"]
        wb_idx = 0
        total_words = len(word_boundaries)

        for i, sentence in enumerate(sentences):
            sentence_text = sentence["text"]
            s_words = [w.strip(".,?!\"';:") for w in sentence_text.split() if w.strip(".,?!\"';:")]
            sentence_word_timings = []

            for _ in s_words:
                if wb_idx < total_words:
                    sentence_word_timings.append(word_boundaries[wb_idx])
                    wb_idx += 1

            if sentence_word_timings:
                start_ms = sentence_word_timings[0]["offset_ms"]
                end_ms = sentence_word_timings[-1]["offset_ms"] + sentence_word_timings[-1]["duration_ms"]
            else:
                start_ms, end_ms = 0, 0

            sentence["start_frame"] = int((start_ms / 1000.0) * FPS)
            sentence["end_frame"] = int((end_ms / 1000.0) * FPS)
            sentence["image_file"] = f"images/scene_{i + 1:03d}.png"

            words_framed = []
            for w in sentence_word_timings:
                w_start = int((w["offset_ms"] / 1000.0) * FPS)
                w_end = int(((w["offset_ms"] + w["duration_ms"]) / 1000.0) * FPS)
                words_framed.append({"text": w["text"], "start_frame": w_start, "end_frame": w_end})
            sentence["words"] = words_framed

        # Visual pacing -- each image extends until the next sentence starts
        for i, sentence in enumerate(sentences):
            if i < len(sentences) - 1:
                sentence["image_end_frame"] = sentences[i + 1]["start_frame"]
            else:
                sentence["image_end_frame"] = int(((audio_duration_ms + END_BUFFER_MS) / 1000.0) * FPS)

        total_frames = int(((audio_duration_ms + END_BUFFER_MS) / 1000.0) * FPS)
        script["audio_file"] = "voiceover.mp3"
        script["total_frames"] = total_frames

        print(f"  ✅ Manifest: {len(sentences)} sentences, {total_frames} frames ({total_frames / FPS:.1f}s)")
        return script

    # ── Metadata Scoring ───────────────────────────────────────────────────

    def _score_metadata(self, script, manifest, audio_duration_ms):
        print("\n" + "=" * 60)
        print("  📊 STEP 4.5: Reel Metadata Scoring & Analysis")
        print("=" * 60)

        # Hook Strength (0-25)
        hook_analysis = script.get("hook_analysis", {})
        hook_score_12 = hook_analysis.get("best", {}).get("score", {}).get("total", 6.0)
        hook_strength = (hook_score_12 / 12.0) * 25.0

        # Pacing (0-25)
        total_words = sum(len(s.get("words", [])) for s in manifest.get("sentences", []))
        duration_sec = audio_duration_ms / 1000.0
        wps = total_words / duration_sec if duration_sec > 0 else 0.0
        if 2.5 <= wps <= 3.2:
            pacing = 25.0
            pacing_detail = f"{wps:.1f} wps (ideal)"
        elif wps < 2.5:
            pacing = max(0, 25.0 * (wps - 1.5) / 1.0)
            pacing_detail = f"{wps:.1f} wps (slow)"
        else:
            pacing = max(0, 25.0 * (4.5 - wps) / 1.3)
            pacing_detail = f"{wps:.1f} wps (fast)"

        # Scene Density (0-25)
        scene_count = len({s.get("image_file", "") for s in manifest.get("sentences", []) if s.get("image_file")})
        sps = scene_count / duration_sec if duration_sec > 0 else 0.0
        if 0.25 <= sps <= 0.5:
            scene_density = 25.0
        elif sps < 0.25:
            scene_density = max(0, 25.0 * (sps - 0.1) / 0.15)
        else:
            scene_density = max(0, 25.0 * (0.8 - sps) / 0.3)

        # Emotional Arc (0-25)
        def _emotion_density(text):
            text_lower = text.lower()
            words = [w.strip(".,?!\"';:") for w in text_lower.split()]
            score = sum(EMOTION_LEXICON.get(w, 0.0) for w in words)
            for bigram, weight in EMOTION_BIGRAMS.items():
                if bigram in text_lower:
                    score += weight
            return score / max(len(words), 1)

        sents = manifest.get("sentences", [])
        n = len(sents)
        if n >= 3:
            densities = [_emotion_density(s.get("text", "")) for s in sents]
            act_sz = n // 3
            means = [
                sum(densities[:act_sz]) / act_sz,
                sum(densities[act_sz:2 * act_sz]) / act_sz,
                sum(densities[2 * act_sz:]) / max(len(densities[2 * act_sz:]), 1),
            ]
            ov = sum(means) / 3.0
            std_dev = (sum((m - ov) ** 2 for m in means) / 3.0) ** 0.5
            emotional_arc = min(25.0, 25.0 * (std_dev / 0.10))
        else:
            emotional_arc = 12.5
            std_dev = 0.0

        total = round(hook_strength + pacing + scene_density + emotional_arc)
        grade = (
            "A+" if total >= 90 else "A" if total >= 80 else "B" if total >= 65
            else "C" if total >= 50 else "D" if total >= 35 else "F"
        )

        # Render scorecard
        print(f"  +-{'-'*18}-+-{'-'*5}-+-{'-'*22}-+")
        print(f"  | {'Metric':<18} | {'Score':>5} | {'Detail':<22} |")
        print(f"  +-{'-'*18}-+-{'-'*5}-+-{'-'*22}-+")
        print(f"  | {'Hook Strength':<18} | {hook_strength:>4.1f}/ | {hook_score_12:.1f}/12 raw{' '*11} |")
        print(f"  | {'Pacing':<18} | {pacing:>4.1f}/ | {pacing_detail:<22} |")
        print(f"  | {'Scene Density':<18} | {scene_density:>4.1f}/ | {sps:.2f} scenes/sec{' '*7} |")
        print(f"  | {'Emotional Arc':<18} | {emotional_arc:>4.1f}/ | StDev={std_dev:.3f}{' '*10} |")
        print(f"  +-{'-'*18}-+-{'-'*5}-+-{'-'*22}-+")
        print(f"  | {'TOTAL':<18} | {total:>3d}/ | Grade: {grade:<15} |")
        print(f"  +-{'-'*18}-+-{'-'*5}-+-{'-'*22}-+")

        return {"total": total, "grade": grade}

    # ── Video Rendering ────────────────────────────────────────────────────

    def _render_video(self, manifest, output_dir, image_paths, audio_path):
        self.remotion_public.mkdir(parents=True, exist_ok=True)
        (self.remotion_public / "images").mkdir(parents=True, exist_ok=True)

        shutil.copy2(audio_path, self.remotion_public / "voiceover.mp3")
        print(f"  📁 Copied audio -> voiceover.mp3")

        copied = 0
        for i, img_path in enumerate(image_paths):
            if img_path and os.path.exists(img_path):
                shutil.copy2(img_path, self.remotion_public / "images" / f"scene_{i + 1:03d}.png")
                copied += 1
        print(f"  📁 Copied {copied} images -> public/images/")

        props = RemotionBuilder.build_props(manifest)
        props_path = self.remotion_public / "props.json"
        with open(props_path, "w") as f:
            json.dump(props, f, indent=2)
        print(f"  📄 Props saved -> props.json")

        output_mp4 = str((output_dir / "reel.mp4").resolve())
        total_frames = manifest.get("total_frames", 0)
        print(f"\n  🎬 Rendering {total_frames} frames at {FPS}fps...")
        print(f"     Output: {output_mp4}")

        start = time.time()
        cmd = [
            "npx", "remotion", "render",
            "ReelComposition", output_mp4,
            f"--props={props_path.resolve()}",
        ]

        result = subprocess.run(
            cmd, cwd=str(self.remotion_dir),
            capture_output=True, text=True, timeout=600,
        )

        elapsed = time.time() - start

        if result.returncode != 0:
            print(f"  ❌ Remotion render failed (exit code {result.returncode})")
            print(f"     stderr: {result.stderr[:500]}")
            raise RuntimeError(f"Remotion render failed: {result.stderr[:200]}")

        if os.path.exists(output_mp4):
            size_mb = os.path.getsize(output_mp4) / (1024 * 1024)
            duration_s = total_frames / FPS
            print(f"\n  ✅ Render complete!")
            print(f"     📹 {output_mp4}")
            print(f"     📐 {WIDTH}x{HEIGHT}")
            print(f"     ⏱️  {duration_s:.1f}s duration")
            print(f"     💾 {size_mb:.1f} MB")
            print(f"     ⚡ Rendered in {elapsed:.1f}s")
        else:
            raise RuntimeError(f"Render output not found: {output_mp4}")

        return output_mp4

    # ── Utilities ──────────────────────────────────────────────────────────

    @staticmethod
    def _print_script_summary(script):
        print(f"\n  ✅ Script: '{script.get('title', 'Untitled')}'")
        print(f"     {len(script['sentences'])} sentences")

        characters = script.get("characters", [])
        environments = script.get("environments", [])
        if characters:
            print(f"\n  {'─' * 56}")
            print(f"  📖 Characters ({len(characters)}):")
            for c in characters:
                print(f"     👤 {c['name']} ({c.get('role', '?')})")
                desc = c['appearance'][:90]
                print(f"        {desc}{'...' if len(c['appearance']) > 90 else ''}")
        if environments:
            print(f"\n  🏛️  Environments ({len(environments)}):")
            for e in environments:
                print(f"     📍 {e.get('name', e['id'])} [{e['id']}]")
                desc = e['description'][:90]
                print(f"        {desc}{'...' if len(e['description']) > 90 else ''}")

        print(f"\n  {'─' * 56}")
        for i, s in enumerate(script["sentences"], 1):
            env_tag = f" [{s.get('environment', '')}]" if s.get("environment") else ""
            text = s['text'][:70]
            ellipsis = '...' if len(s['text']) > 70 else ''
            print(f"  {i:2d}.{env_tag} {text}{ellipsis}")
        print(f"  {'─' * 56}")
