#!/usr/bin/env python3
"""
Reelmation -- Automated Reel Generator
======================================
Usage:
    ./venv/bin/python main.py "A miracle baby story"
    ./venv/bin/python main.py "Ancient underwater city" --voice en-US-ChristopherNeural
    ./venv/bin/python main.py "Time traveler" --skip-images --sentences 15
"""
import argparse
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from reelmation.core.pipeline import ReelPipeline


def main():
    parser = argparse.ArgumentParser(
        description="Reelmation -- Automated Reel Generator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate a full reel:
  ./venv/bin/python main.py "A miracle baby story"

  # With custom voice and speed:
  ./venv/bin/python main.py "Ancient underwater city" --voice en-US-ChristopherNeural --rate "+5%"

  # Skip image generation (for testing):
  ./venv/bin/python main.py "Time traveler" --skip-images

  # Shorter reel (fewer sentences):
  ./venv/bin/python main.py "A haunted mirror" --sentences 10

  # Reuse a previous run directory:
  ./venv/bin/python main.py "anything" --reuse output/a_haunted_mirror_20260528_160519
        """,
    )

    parser.add_argument("topic", help="The reel topic / story idea")
    parser.add_argument("--voice", "-v", default="en-US-GuyNeural", help="Edge-TTS voice (default: en-US-GuyNeural)")
    parser.add_argument("--rate", "-r", default="+10%", help="Speech rate (e.g. '+5%%', '-10%%'). Default: +10%%")
    parser.add_argument("--pitch", default="+0Hz", help="Speech pitch (e.g. '+2Hz', '-3Hz'). Default: +0Hz")
    parser.add_argument("--style", "-s", default="dramatic", help="Story style/tone (dramatic, mysterious, scary, etc.)")
    parser.add_argument("--output-dir", "-o", default="./output", help="Base output directory. Default: ./output")
    parser.add_argument("--sentences", "-n", type=int, default=12, help="Target sentence count (controls reel length). Default: 12")
    parser.add_argument("--skip-images", action="store_true", help="Skip image generation (use placeholder images)")
    parser.add_argument("--persona-file", help="Path to a custom persona/system prompt text file")
    parser.add_argument("--no-cache", action="store_true", help="Force regeneration of script (ignore cache)")
    parser.add_argument("--from-script", help="Skip LLM entirely -- load script from a previous reel_script.json")
    parser.add_argument("--no-hook-optimize", action="store_true", help="Skip hook optimization (keep original first sentence)")
    parser.add_argument("--reuse", help="Reuse an existing run directory (reuses script and images)")

    args = parser.parse_args()

    # Create output directory with timestamp or reuse existing
    if args.reuse:
        output_dir = Path(args.reuse)
        if not output_dir.exists():
            print(f"  ❌ Reuse directory does not exist: {args.reuse}")
            sys.exit(1)
        args.from_script = str(output_dir / "reel_script.json")
        print(f"  ♻️  Reusing run directory: {output_dir}")
    else:
        topic_slug = re.sub(r"[^\w\s-]", "", args.topic.lower())
        topic_slug = re.sub(r"[\s]+", "_", topic_slug)[:40]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = Path(args.output_dir) / f"{topic_slug}_{timestamp}"

    print("+" + "=" * 58 + "+")
    print("|  🎬 REELMATION -- Automated Reel Generator" + " " * 15 + "|")
    print("+" + "=" * 58 + "+")
    print(f"|  Topic: {args.topic[:48]:<48}  |")
    print(f"|  Output: {str(output_dir)[:47]:<47}  |")
    print("+" + "=" * 58 + "+")

    pipeline = ReelPipeline(Path(__file__).parent.resolve())
    overall_start = time.time()

    try:
        output_mp4 = pipeline.generate(
            topic=args.topic,
            output_dir=output_dir,
            style=args.style,
            num_sentences=args.sentences,
            voice=args.voice,
            rate=args.rate,
            pitch=args.pitch,
            skip_images=args.skip_images,
            persona_file=args.persona_file,
            use_cache=not args.no_cache,
            from_script=args.from_script,
            optimize_hook=not args.no_hook_optimize,
        )

        total_time = time.time() - overall_start
        print("\n" + "+" + "=" * 58 + "+")
        print("|  ✅ REEL GENERATION COMPLETE!" + " " * 29 + "|")
        print("+" + "=" * 58 + "+")
        print(f"|  📹 Video:  {output_mp4[-46:]:<46}  |")
        time_str = f"{total_time:.0f}s"
        print(f"|  ⏱️  Total:  {time_str:<46}  |")
        print("+" + "=" * 58 + "+")

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
