#!/usr/bin/env python3
"""
Text-to-Speech via Microsoft Edge Neural TTS (edge-tts) for Reelmation
=====================================================================
Converts text into high-quality, natural-sounding, perfectly consistent speech.

Usage:
    # CLI Basic Usage:
    python T2Speech.py "Hello from Reelmation!" -o output.mp3

    # List premium English voices:
    python T2Speech.py --list-voices

    # Adjust speed (e.g. 15% faster):
    python T2Speech.py "Quick narration here." -o output.mp3 --rate "+15%"
"""

import sys
import os
import argparse
import asyncio
import edge_tts
from tabulate import tabulate

class TextToSpeech:
    """
    Wrapper for Edge-TTS neural engine providing premium, stable voice synthesis.
    """
    def __init__(self, default_voice="en-US-GuyNeural"):
        self.default_voice = default_voice

    async def _generate_async(self, text: str, output_path: str, voice: str, rate: str, pitch: str):
        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
        await communicate.save(output_path)

    async def _get_voices_async(self, locale_prefix="en-"):
        voices_manager = await edge_tts.VoicesManager.create()
        all_voices = voices_manager.voices
        # Filter voices that start with locale prefix (e.g. English)
        filtered_voices = [
            v for v in all_voices 
            if v["Locale"].lower().startswith(locale_prefix.lower())
        ]
        return filtered_voices

    def generate(self, text: str, output_path: str, voice: str = None, rate: str = "+0%", pitch: str = "+0Hz"):
        """
        Synthesize text to speech (Synchronous Wrapper)
        
        Args:
            text (str): The script narration text.
            output_path (str): Destination file path (e.g. .mp3 or .wav).
            voice (str): Voice identifier name. Defaults to self.default_voice.
            rate (str): Speech rate modification (e.g., "+10%", "-5%").
            pitch (str): Speech pitch modification (e.g., "+0Hz", "-5Hz").
        """
        selected_voice = voice or self.default_voice
        
        # Rate must start with + or - and end with %
        if rate and not (rate.startswith('+') or rate.startswith('-')):
            rate = f"+{rate}"
        if rate and not rate.endswith('%'):
            rate = f"{rate}%"
            
        # Pitch must start with + or - and end with Hz or %
        if pitch and not (pitch.startswith('+') or pitch.startswith('-')):
            pitch = f"+{pitch}"
        if pitch and not (pitch.endswith('Hz') or pitch.endswith('%')):
            pitch = f"{pitch}Hz"

        # Direct directory creation
        out_dir = os.path.dirname(os.path.abspath(output_path))
        os.makedirs(out_dir, exist_ok=True)

        asyncio.run(self._generate_async(text, output_path, selected_voice, rate, pitch))
        print(f"✅ Audio generated successfully: {output_path} ({selected_voice})")

    def list_voices(self, locale_prefix="en-"):
        """
        List and display premium voices in a readable table format.
        """
        voices = asyncio.run(self._get_voices_async(locale_prefix))
        
        table_data = []
        for v in voices:
            table_data.append([
                v["ShortName"],
                v["Gender"],
                v["Locale"],
                v["FriendlyName"].split(" - ")[0]
            ])
            
        # Sort by locale, then shortname
        table_data.sort(key=lambda x: (x[2], x[0]))
        
        print(f"\n--- Available Premium Neural Voices ({locale_prefix}*) ---")
        print(tabulate(table_data, headers=["Voice Name / ShortName", "Gender", "Locale", "Description"], tablefmt="simple"))
        print("\n💡 Popular choices for reels:")
        print("  - en-US-GuyNeural (Male, very professional & popular)")
        print("  - en-US-AnaNeural (Female, extremely friendly)")
        print("  - en-GB-SoniaNeural (Female, elegant British accent)")
        print("  - en-US-ChristopherNeural (Male, deep, story-like voice)\n")

    # ── Word-Level Timing ──────────────────────────────────────────────────

    async def _generate_with_timestamps_async(
        self, text: str, output_path: str, voice: str, rate: str, pitch: str
    ) -> list[dict]:
        """
        Generate audio AND capture word-level timing via WordBoundary events.

        Returns:
            List of dicts: [{"text": "word", "offset_ms": int, "duration_ms": int}, ...]
            Punctuation is stripped from word text.
        """
        import re

        communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
        word_boundaries = []

        with open(output_path, "wb") as audio_file:
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_file.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    # Edge-TTS reports offset/duration in 100-nanosecond ticks
                    raw_text = chunk["text"]
                    # Strip punctuation from word text for clean subtitle display
                    clean_text = re.sub(r"[^\w\s'-]", "", raw_text).strip()
                    if clean_text:  # Skip if the "word" was pure punctuation
                        word_boundaries.append({
                            "text": clean_text,
                            "offset_ms": chunk["offset"] // 10_000,
                            "duration_ms": chunk["duration"] // 10_000,
                        })

        return word_boundaries

    def generate_with_timestamps(
        self,
        text: str,
        output_path: str,
        voice: str = None,
        rate: str = "+0%",
        pitch: str = "+0Hz",
    ) -> list[dict]:
        """
        Synthesize text to audio and return word-level timestamps.

        Args:
            text: Full narration text.
            output_path: Destination file path (e.g. .mp3).
            voice: Voice identifier name. Defaults to self.default_voice.
            rate: Speech rate modification (e.g., "+10%", "-5%").
            pitch: Speech pitch modification (e.g., "+0Hz", "-3Hz").

        Returns:
            List of word timing dicts:
            [{"text": "word", "offset_ms": 0, "duration_ms": 150}, ...]
        """
        selected_voice = voice or self.default_voice

        # Normalize rate format
        if rate and not (rate.startswith('+') or rate.startswith('-')):
            rate = f"+{rate}"
        if rate and not rate.endswith('%'):
            rate = f"{rate}%"

        # Normalize pitch format
        if pitch and not (pitch.startswith('+') or pitch.startswith('-')):
            pitch = f"+{pitch}"
        if pitch and not (pitch.endswith('Hz') or pitch.endswith('%')):
            pitch = f"{pitch}Hz"

        # Ensure output directory exists
        out_dir = os.path.dirname(os.path.abspath(output_path))
        os.makedirs(out_dir, exist_ok=True)

        word_boundaries = asyncio.run(
            self._generate_with_timestamps_async(
                text, output_path, selected_voice, rate, pitch
            )
        )

        print(
            f"✅ Audio generated with {len(word_boundaries)} word timestamps: "
            f"{output_path} ({selected_voice})"
        )
        return word_boundaries


def main():
    parser = argparse.ArgumentParser(description="Edge Neural Text-to-Speech wrapper for Reelmation.")
    parser.add_argument("text", nargs="?", help="Text string to synthesize to audio.")
    parser.add_argument("-o", "--output", default="output.mp3", help="Output file destination (e.g., narration.mp3 or narration.wav).")
    parser.add_argument("-v", "--voice", default="en-US-GuyNeural", help="Microsoft Edge neural voice ShortName. Default: en-US-GuyNeural")
    parser.add_argument("-r", "--rate", default="+0%", help="Speaking rate change, e.g. +10% or -5%. Default: +0%")
    parser.add_argument("-p", "--pitch", default="+0Hz", help="Voice pitch change, e.g. -5Hz or +2Hz. Default: +0Hz")
    parser.add_argument("--list-voices", action="store_true", help="List all available English neural voices and exit.")
    parser.add_argument("-f", "--file", help="Path to a text file containing script to read.")

    args = parser.parse_args()

    tts = TextToSpeech()

    if args.list_voices:
        tts.list_voices()
        sys.exit(0)

    # Determine input text
    script_text = ""
    if args.file:
        try:
            with open(args.file, 'r', encoding='utf-8') as f:
                script_text = f.read().strip()
        except Exception as e:
            print(f"❌ Error reading text file: {e}")
            sys.exit(1)
    elif args.text:
        script_text = args.text.strip()

    if not script_text:
        print("❌ Error: Please provide text directly or specify a file with -f / --file.")
        parser.print_help()
        sys.exit(1)

    print(f"🎤 Synthesizing speech...")
    try:
        tts.generate(
            text=script_text,
            output_path=args.output,
            voice=args.voice,
            rate=args.rate,
            pitch=args.pitch
        )
    except Exception as e:
        print(f"❌ Synthesis failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
