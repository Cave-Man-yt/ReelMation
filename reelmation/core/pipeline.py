import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Dict, Any, List

from reelmation.agents.script_agent import ScriptAgent
from reelmation.media.tts_engine import TextToSpeech
from reelmation.media.image_engine import ImageEngine
from reelmation.core.remotion_builder import RemotionBuilder

FPS = 30
END_BUFFER_MS = 1000
PAUSE_THRESHOLD_MS = 500

class ReelPipeline:
    """Orchestrates the entire end-to-end generation of a video reel."""
    
    def __init__(self, project_root: Path):
        self.root = project_root
        self.remotion_dir = project_root / "remotion"
        self.remotion_public = self.remotion_dir / "public"
        self.script_agent = ScriptAgent()
        self.tts_engine = TextToSpeech()
        self.image_engine = ImageEngine()
        
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
    ) -> str:
        """Run the full generation pipeline."""
        print(f"\n🚀 Starting ReelPipeline for: {topic}")
        
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # 1. Generate Script
        print("\n📝 Step 1: Generating Script")
        script = self.script_agent.generate_reel_script(
            topic=topic,
            style=style,
            num_sentences=num_sentences
        )
        
        script_path = output_dir / "reel_script.json"
        with open(script_path, "w") as f:
            json.dump(script, f, indent=2)
            
        # 2. Voiceover and Timing
        print("\n🎤 Step 2: Generating Voiceover")
        audio_path = output_dir / "voiceover.mp3"
        full_text = " ".join(s["text"] for s in script["sentences"])
        
        word_boundaries = self.tts_engine.generate_with_timestamps(
            text=full_text,
            output_path=str(audio_path),
            voice=voice,
            rate=rate,
            pitch=pitch
        )
        
        audio_duration_ms = (word_boundaries[-1]["offset_ms"] + word_boundaries[-1]["duration_ms"]) if word_boundaries else 0
        
        # 3. Image Generation
        print("\n🖼️ Step 3: Generating Images")
        image_paths = []
        for i, s in enumerate(script["sentences"]):
            img_path = output_dir / f"scene_{i+1:03d}.png"
            if not skip_images:
                res = self.image_engine.generate(s.get("image_prompt", ""), str(img_path))
                image_paths.append(res if res else "")
            else:
                image_paths.append("")
                
        # 4. Build Manifest and Frames
        print("\n🧩 Step 4: Building Manifest")
        manifest = self._build_manifest(script, word_boundaries, image_paths, str(audio_path), audio_duration_ms)
        
        manifest_path = output_dir / "reel_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
            
        # 5. Render Video
        print("\n🎬 Step 5: Rendering Video")
        return self._render_video(manifest, output_dir, image_paths, str(audio_path))

    def _build_manifest(self, script, word_boundaries, image_paths, audio_path, audio_duration_ms):
        sentences = script["sentences"]
        wb_idx = 0
        total_words = len(word_boundaries)
        
        for i, sentence in enumerate(sentences):
            sentence_text = sentence["text"]
            # Clean string matching logic (simplified for pipeline)
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

        # Calculate visual pacing
        for i, sentence in enumerate(sentences):
            if i < len(sentences) - 1:
                next_start = sentences[i + 1]["start_frame"]
                sentence["image_end_frame"] = next_start
            else:
                total_duration_frames = int(((audio_duration_ms + END_BUFFER_MS) / 1000.0) * FPS)
                sentence["image_end_frame"] = total_duration_frames

        script["audio_file"] = "voiceover.mp3"
        script["total_frames"] = int(((audio_duration_ms + END_BUFFER_MS) / 1000.0) * FPS)
        return script
        
    def _render_video(self, manifest, output_dir, image_paths, audio_path) -> str:
        self.remotion_public.mkdir(parents=True, exist_ok=True)
        (self.remotion_public / "images").mkdir(parents=True, exist_ok=True)
        
        shutil.copy2(audio_path, self.remotion_public / "voiceover.mp3")
        
        for i, img_path in enumerate(image_paths):
            if img_path and os.path.exists(img_path):
                shutil.copy2(img_path, self.remotion_public / "images" / f"scene_{i + 1:03d}.png")
                
        props = RemotionBuilder.build_props(manifest)
        props_path = self.remotion_public / "props.json"
        with open(props_path, "w") as f:
            json.dump(props, f, indent=2)
            
        output_mp4 = str((output_dir / "reel.mp4").resolve())
        cmd = [
            "npx", "remotion", "render",
            "ReelComposition",
            output_mp4,
            f"--props={props_path.resolve()}",
        ]
        
        start = time.time()
        result = subprocess.run(
            cmd,
            cwd=str(self.remotion_dir),
            capture_output=True,
            text=True,
            timeout=600,
        )
        
        if result.returncode != 0:
            raise RuntimeError(f"Remotion render failed: {result.stderr[:500]}")
            
        print(f"✅ Rendered in {time.time() - start:.1f}s -> {output_mp4}")
        return output_mp4
