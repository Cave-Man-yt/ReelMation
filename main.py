#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path
from datetime import datetime
import re

from reelmation.core.pipeline import ReelPipeline

def main():
    parser = argparse.ArgumentParser(description="Reelmation — Automated Reel Generator (OOP Edition)")
    
    parser.add_argument("topic", help="The reel topic / story idea")
    parser.add_argument("--voice", "-v", default="en-US-GuyNeural", help="Edge-TTS voice")
    parser.add_argument("--rate", "-r", default="+10%", help="Speech rate")
    parser.add_argument("--pitch", default="+0Hz", help="Speech pitch")
    parser.add_argument("--style", "-s", default="dramatic", help="Story style/tone")
    parser.add_argument("--output-dir", "-o", default="./output", help="Base output directory")
    parser.add_argument("--sentences", "-n", type=int, default=12, help="Target sentence count")
    parser.add_argument("--skip-images", action="store_true", help="Skip image generation")
    
    args = parser.parse_args()
    
    topic_slug = re.sub(r"[^\w\s-]", "", args.topic.lower())
    topic_slug = re.sub(r"[\s]+", "_", topic_slug)[:40]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path(args.output_dir) / f"{topic_slug}_{timestamp}"
    
    print("╔" + "═" * 58 + "╗")
    print("║  🎬 REELMATION — OOP Architecture" + " " * 23 + "║")
    print("╠" + "═" * 58 + "╣")
    print(f"║  Topic: {args.topic[:48]:<48}  ║")
    print(f"║  Output: {str(output_dir)[:47]:<47}  ║")
    print("╚" + "═" * 58 + "╝")

    pipeline = ReelPipeline(Path(__file__).parent.resolve())
    
    try:
        pipeline.generate(
            topic=args.topic,
            output_dir=output_dir,
            style=args.style,
            num_sentences=args.sentences,
            voice=args.voice,
            rate=args.rate,
            pitch=args.pitch,
            skip_images=args.skip_images,
        )
    except Exception as e:
        print(f"\n❌ PIPELINE FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
