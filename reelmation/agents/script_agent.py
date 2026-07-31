"""
Script Agent — LLM-powered reel scriptwriter.
==============================================
Extends GeminiClient with domain-specific methods for generating
structured reel scripts (narration + character bible + image prompts).

Usage:
    from reelmation.agents.script_agent import ScriptAgent

    agent = ScriptAgent(persona="You are a viral scriptwriter.")
    script = agent.generate_reel_script(topic="A haunted mirror", num_sentences=12)
"""

import json

from .gemini_client import GeminiClient

# ── Emotion Lexicons (used for hook scoring & arc enforcement) ─────────────

EMOTION_LEXICON = {
    # HIGH intensity — visceral, immediate (1.0 weight)
    "terrifying": 1.0, "devastating": 1.0, "horrifying": 1.0,
    "nightmare": 1.0, "catastrophic": 1.0, "heartbreaking": 1.0,
    "shocking": 1.0, "furious": 1.0, "panic": 1.0, "euphoric": 1.0,
    "ruthless": 1.0, "savage": 1.0, "vengeful": 1.0,
    # MEDIUM intensity — strong but less urgent (0.6 weight)
    "miracle": 0.6, "unbelievable": 0.6, "incredible": 0.6,
    "beautiful": 0.6, "tragic": 0.6, "stunning": 0.6,
    "desperate": 0.6, "forbidden": 0.6, "legendary": 0.6,
    "impossible": 0.6, "glorious": 0.6, "electrifying": 0.6,
    "sinister": 0.6, "doomed": 0.6, "betrayal": 0.6,
    "hope": 0.6, "love": 0.6, "fear": 0.6, "guilt": 0.6,
    "greed": 0.6, "paradise": 0.6, "chilling": 0.6,
    # LOW intensity — atmospheric, world-building (0.3 weight)
    "mysterious": 0.3, "haunting": 0.3, "breathtaking": 0.3,
    "magical": 0.3, "mystic": 0.3, "ancient": 0.3,
    "hidden": 0.3, "forgotten": 0.3, "secret": 0.3,
    "darkness": 0.3, "light": 0.3, "shadow": 0.3,
    "destiny": 0.3, "fate": 0.3, "deadly": 0.3,
    "haunted": 0.3, "unforgiving": 0.3,
    # EDUCATIONAL & CURIOSITY keywords (0.8 weight)
    "discovery": 0.8, "reveal": 0.8, "surprising": 0.8, "essential": 0.8,
    "unbelievable": 0.8, "shocking": 0.8, "secret": 0.8, "mystery": 0.8,
    "facts": 0.8, "fact": 0.8, "history": 0.8, "science": 0.8, "mind-blowing": 0.8,
}

EMOTION_BIGRAMS = {
    "no one": 0.6, "never again": 0.8, "too late": 0.8,
    "last chance": 0.7, "point of no return": 0.9,
    "no way out": 0.9, "left behind": 0.7,
}

EMOTION_WORDS = frozenset(EMOTION_LEXICON.keys())


class ScriptAgent(GeminiClient):
    """LLM agent for generating structured reel scripts with 3-act narrative arcs."""
    def generate_reel_script(
        self,
        topic: str,
        style: str = "dramatic",
        num_sentences: int = 18,
        max_retries: int = 5,
        log_file: str = "llm_debug.log",
        optimize_hook: bool = True,
        knowledgeBase: str = "",
    ) -> dict:
        """
        Generate a structured reel script as JSON with paired sentences
        and image prompts.

        Uses a three-phase approach for consistency and quality:
          Phase 1: Generate narration sentences
          Phase 2: Generate character bible + environment bible +
                   per-sentence environment assignments
          Phase 3: Generate image prompts in batches with full bible
                   context, then validate compliance

        All raw LLM responses are logged to `log_file` for debugging.

        Args:
            topic: The reel topic / story idea.
            style: Tone of the story (dramatic, mysterious, scary, etc.)
            num_sentences: Target number of sentences (controls reel length).
            max_retries: How many times to retry on parse failure.
            log_file: Path to debug log file.
            knowledgeBase: Optional custom notes to guide the script.

        Returns:
            Parsed dict with keys: title, characters, environments,
            sentences[]. Each sentence has: text, environment, image_prompt.
        """
        import re as _re
        from datetime import datetime as _dt

        def _log(msg: str, raw: str = ""):
            """Append to debug log file."""
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"\n{'='*60}\n")
                f.write(f"[{_dt.now().isoformat()}] {msg}\n")
                if raw:
                    f.write(f"{'─'*60}\n")
                    f.write(raw)
                    f.write(f"\n{'─'*60}\n")

        # Clear log for this run
        with open(log_file, "w", encoding="utf-8") as f:
            f.write(f"Reelmation LLM Debug Log — {_dt.now().isoformat()}\n")
            f.write(f"Topic: {topic} | Style: {style} | Sentences: {num_sentences}\n")

        # ── Phase 1: Generate narration sentences ──────────────────────
        print("[ScriptAgent] Phase 1: Generating narration sentences...")

        kb_section = f"Knowledge Base/Notes to include:\n{knowledgeBase}\n\n" if knowledgeBase else ""

        phase1_prompt = (
            f"Write an informative, educational social media reel narration about: {topic}.\n\n"
            f"{kb_section}"
            "JSON Format:\n"
            "{\n"
            '  "title": "catchy title",\n'
            '  "sentences": ["sentence 1", ...]\n'
            "}\n\n"
            "Rules:\n"
            f"- EXACTLY {num_sentences} sentences in the array.\n"
            "- Each sentence: 8-12 words, ASCII only, no line breaks, no quotes, no stage directions.\n"
            f"- Act 1 (1-{num_sentences // 3}): Hook the audience, introduce the core concept, and explain why it is important.\n"
            f"- Act 2 ({num_sentences // 3 + 1}-{2 * num_sentences // 3}): Break down the core scientific or factual mechanism, process, or steps clearly.\n"
            f"- Act 3 ({2 * num_sentences // 3 + 1}-{num_sentences}): Summarize the key takeaways and real-world significance.\n"
            "- Sentence 1: Start with you, stop, imagine, this, did you know, or every to create an immediate curiosity gap.\n"
            "- Write to be spoken aloud; make every sentence factually informative, clear, and engaging.\n"
            "- Do NOT use dramatic stories or fictional plotlines. Stick to science and facts.\n"
        )


        script_data = None
        for attempt in range(max_retries):
            try:
                raw = self.ask_once(phase1_prompt)
                _log(f"Phase 1 attempt {attempt+1} — raw response ({len(raw)} chars)", raw)

                cleaned = self._clean_and_repair(raw)
                _log(f"Phase 1 attempt {attempt+1} — after repair ({len(cleaned)} chars)", cleaned)

                data = json.loads(cleaned)

                # Validate
                if "sentences" not in data or not isinstance(data["sentences"], list):
                    raise ValueError("Missing or invalid 'sentences' array")

                sentences = data["sentences"]
                if len(sentences) < 8:
                    raise ValueError(f"Only {len(sentences)} sentences, need >= 8")

                # Ensure sentences are strings
                for i, s in enumerate(sentences):
                    if not isinstance(s, str) or not s.strip():
                        raise ValueError(f"Sentence {i} is not a valid string")

                script_data = data
                print(f"[ScriptAgent] Phase 1 OK: {len(sentences)} sentences generated")
                break

            except (json.JSONDecodeError, ValueError) as e:
                _log(f"Phase 1 attempt {attempt+1} FAILED: {e}")
                print(f"[ScriptAgent] Phase 1 attempt {attempt+1}/{max_retries} failed: {e}")
                if attempt >= max_retries - 1:
                    raise RuntimeError(
                        f"Phase 1 failed after {max_retries} attempts: {e}\n"
                        f"Check {log_file} for raw LLM outputs."
                    )

        sentences = script_data["sentences"]

        # ── Phase 1b: Hook Optimization ────────────────────────────
        if optimize_hook:
            print("[ScriptAgent] Phase 1b: Optimizing hook...")
            hook_result = self.generate_hook_variations(
                original_hook=sentences[0],
                topic=topic,
                style=style,
                log_fn=_log,
            )
            sentences[0] = hook_result["best"]["text"]
            script_data["sentences"] = sentences
            script_data["hook_analysis"] = hook_result
            _log(
                f"Hook optimization: selected '{hook_result['best']['source']}' "
                f"(score {hook_result['best']['score']['total']:.1f}/12)",
                json.dumps(hook_result, indent=2),
            )
            print(f"[ScriptAgent] Phase 1b OK: best hook = "
                  f"'{hook_result['best']['source']}' "
                  f"({hook_result['best']['score']['total']:.1f}/12)")
        else:
            original_score = self.score_hook(sentences[0])
            script_data["hook_analysis"] = {
                "original": {"text": sentences[0], "score": original_score},
                "variations": [],
                "best": {"text": sentences[0], "score": original_score, "source": "original"}
            }

        # ── Phase 1c: Emotional Arc Enforcement ────────────────────
        print("[ScriptAgent] Phase 1c: Enforcing emotional arc contrast...")
        sentences, arc_info = self.enforce_emotional_arc(
            sentences=sentences,
            topic=topic,
            style=style,
            log_fn=_log,
        )
        script_data["sentences"] = sentences
        script_data["arc_enforcement"] = arc_info
        _log(
            f"Arc enforcement: StDev {arc_info['original_stdev']:.3f} → {arc_info['final_stdev']:.3f} "
            f"({arc_info['attempts']} attempts, acts regenerated: {arc_info['acts_regenerated']})"
        )
        print(f"[ScriptAgent] Phase 1c OK: StDev {arc_info['final_stdev']:.3f}")

        # ── Phase 1d: Sentence Length Enforcement ──────────────────
        print("[ScriptAgent] Phase 1d: Enforcing sentence lengths...")
        sentences, trim_info = self.enforce_sentence_lengths(
            sentences=sentences,
            log_fn=_log,
        )
        script_data["sentences"] = sentences
        script_data["trim_enforcement"] = trim_info
        if trim_info["trimmed_count"] > 0:
            _log(f"Trimmed {trim_info['trimmed_count']} sentences: {trim_info['trimmed_indices']}")
            print(f"[ScriptAgent] Phase 1d OK: trimmed {trim_info['trimmed_count']} over-long sentences")
        else:
            print("[ScriptAgent] Phase 1d OK: all sentences within target length")

        # ── Phase 2: Scientific Component Extraction ───────────────────
        print("[ScriptAgent] Phase 2: Extracting scientific components and settings...")

        phase2_prompt = (
            f"Identify the 2 primary scientific/physical components, elements, or subjects of this topic: {topic}.\n"
            "Provide their realistic, educational, high-fidelity visual appearance descriptions for a text-to-image AI.\n\n"
            "Format:\n"
            "{\n"
            '  "components": [\n'
            '    {"name": "Name of component", "appearance": "realistic, educational, scientific detail, lighting, scale (macro or wide)"}\n'
            '  ]\n'
            "}\n\n"
            "Rules:\n"
            "- Do NOT personify them. Keep them realistic and informative.\n"
            "- JSON output only, single-line strings, ASCII only.\n"
        )

        components_data = None
        for attempt in range(max_retries):
            try:
                raw = self.ask_once(phase2_prompt)
                _log(f"Phase 2 attempt {attempt+1} — raw response ({len(raw)} chars)", raw)

                cleaned = self._clean_and_repair(raw)
                _log(f"Phase 2 attempt {attempt+1} — after repair ({len(cleaned)} chars)", cleaned)

                data = json.loads(cleaned)

                if "components" not in data or not isinstance(data["components"], list) or len(data["components"]) == 0:
                    raise ValueError("Missing or invalid 'components' array")
                for c in data["components"]:
                    if not c.get("name") or not c.get("appearance"):
                        raise ValueError(f"Component missing name or appearance: {c}")

                components_data = data
                break
            except Exception as e:
                _log(f"Phase 2 attempt {attempt+1} FAILED: {e}")
                print(f"    ⚠️  Attempt {attempt+1}/{max_retries} failed: {e}")
                if attempt >= max_retries - 1:
                    components_data = {
                        "components": [
                            {
                                "name": topic.split()[-1] if topic.split() else "Subject",
                                "appearance": f"A realistic, highly detailed 3D scientific render representing {topic}, clear lighting, macro photography."
                            }
                        ]
                    }
                    print("    ⚠️  Using fallback programmatic components")

        characters = []
        for comp in components_data["components"]:
            characters.append({
                "name": comp["name"],
                "role": "subject",
                "appearance": comp["appearance"]
            })

        environments = [
            {
                "id": "setting_a",
                "name": "Primary Setting",
                "description": f"A realistic, high-fidelity outdoors or natural environment depicting the subject of {topic} under clear daylight, detailed, scientific look."
            },
            {
                "id": "setting_b",
                "name": "Secondary Setting",
                "description": f"A microscopic or schematic close-up view showing the inner structural or molecular details related to {topic}, detailed scientific diagram style."
            }
        ]

        sent_envs = []
        for i in range(len(sentences)):
            sent_envs.append("setting_a" if i % 2 == 0 else "setting_b")

        env_lookup = {e["id"]: e for e in environments}

        # ── Log bible prominently ──────────────────────────────────────
        print("\n" + "─" * 60)
        print("  📖 CHARACTER BIBLE")
        print("─" * 60)
        for c in characters:
            print(f"  👤 {c['name']} ({c.get('role', 'unknown')})")
            print(f"     {c['appearance']}")
        print("\n" + "─" * 60)
        print("  🏛️  ENVIRONMENT BIBLE")
        print("─" * 60)
        for e in environments:
            print(f"  📍 {e.get('name', e['id'])} [{e['id']}]")
            print(f"     {e['description'][:120]}{'...' if len(e['description']) > 120 else ''}")
        print("─" * 60 + "\n")

        _log(
            "Phase 2 BIBLE",
            json.dumps({"characters": characters, "environments": environments,
                         "sentence_environments": sent_envs}, indent=2),
        )

        # ── Phase 3: Generate image prompts with bible context ─────────
        print(f"[ScriptAgent] Phase 3: Generating image prompts for {len(sentences)} sentences...")

        # Build the bible context block that will be injected into every prompt
        char_block = "\n".join(
            f"- {c['name']} ({c.get('role', '')}): {c['appearance']}"
            for c in characters
        )
        env_block = "\n".join(
            f"- {e['id']}: {e['description']}"
            for e in environments
        )
        bible_context = (
            "CHARACTER BIBLE:\n"
            f"{char_block}\n\n"
            "ENVIRONMENT BIBLE:\n"
            f"{env_block}\n"
        )

        CONSISTENCY_SUFFIX = (
            "Consistent character design, same outfit throughout, "
            "photorealistic, cinematic, 4K, high detail."
        )

        all_image_prompts = []
        for idx, (s, env) in enumerate(zip(sentences, sent_envs)):
            print(f"  📷 Generating prompt for sentence {idx+1}/{len(sentences)}...")
            
            phase3_prompt = (
                "Generate a detailed image prompt for a text-to-image AI based on this bible:\n"
                f"{bible_context}\n"
                f"SENTENCE: [ENV: {env}] {s}\n\n"
                "Rules:\n"
                "- Structure: Character appearance + environment description + action/pose + camera/lighting.\n"
                "- Length: 40-70 words.\n"
                "- Output the raw prompt text only. No markdown, no JSON, no formatting, single line.\n"
            )

            prompt_text = None
            for attempt in range(max_retries):
                try:
                    raw = self.ask_once(phase3_prompt)
                    _log(
                        f"Phase 3 sentence {idx+1} "
                        f"attempt {attempt+1} — raw ({len(raw)} chars)",
                        raw,
                    )

                    cleaned = raw.strip()
                    if cleaned.startswith("```"):
                        cleaned = cleaned.replace("```json", "").replace("```", "").strip()
                    cleaned = cleaned.strip('"\'')
                    
                    if len(cleaned) < 10:
                        raise ValueError("Prompt too short or empty")

                    prompt_text = cleaned
                    break

                except Exception as e:
                    _log(f"Phase 3 sentence {idx+1} attempt {attempt+1} FAILED: {e}")
                    print(f"    ⚠️  Attempt {attempt+1}/{max_retries} failed: {e}")
                    if attempt >= max_retries - 1:
                        # Fallback: build prompt from bible directly
                        env_desc = env_lookup.get(env, {}).get("description", "")
                        char_descs = ". ".join(
                            f"{c['name']}, {c['appearance']}" for c in characters
                        )
                        prompt_text = (
                            f"{char_descs}. Setting: {env_desc}. "
                            f"Scene depicting: {s}. Dramatic lighting, "
                            f"cinematic composition, 4K."
                        )
                        print(f"    ⚠️  Using bible-based fallback prompt for sentence {idx+1}")

            all_image_prompts.append(prompt_text)

        # ── Append consistency suffix to every prompt ──────────────────
        for i, prompt in enumerate(all_image_prompts):
            if CONSISTENCY_SUFFIX.lower() not in prompt.lower():
                all_image_prompts[i] = f"{prompt} {CONSISTENCY_SUFFIX}"

        # ── Compliance validation ──────────────────────────────────────
        all_image_prompts = self._validate_prompt_compliance(
            prompts=all_image_prompts,
            characters=characters,
            sentences=sentences,
            log_fn=_log,
        )

        # ── Combine into final structure ───────────────────────────────
        result = {
            "title": script_data.get("title", topic),
            "characters": characters,
            "environments": environments,
            "sentences": [
                {
                    "text": sentences[i],
                    "environment": sent_envs[i] if i < len(sent_envs) else "",
                    "image_prompt": all_image_prompts[i]
                        if i < len(all_image_prompts)
                        else f"Cinematic scene: {sentences[i]}",
                }
                for i in range(len(sentences))
            ],
        }

        if "hook_analysis" in script_data:
            result["hook_analysis"] = script_data["hook_analysis"]

        _log(
            f"FINAL RESULT: {len(result['sentences'])} sentences",
            json.dumps(result, indent=2),
        )

        print(
            f"[ScriptAgent] Script complete: "
            f"{len(result['sentences'])} sentences, "
            f"{len(characters)} characters, "
            f"{len(environments)} environments, "
            f"title='{result['title']}'"
        )
        return result

    @staticmethod
    def _validate_prompt_compliance(
        prompts: list[str],
        characters: list[dict],
        sentences: list[str],
        log_fn=None,
    ) -> list[str]:
        """
        Validate that image prompts reference character names and anchor
        traits from the bible. Auto-repair drifted prompts by prepending
        the character's full appearance description.

        Anchor traits checked per character:
          - Character name (case-insensitive)
          - First color word found in the appearance (hair/clothing anchor)

        Args:
            prompts: List of image prompt strings.
            characters: Character bible list.
            sentences: Narration sentences (parallel to prompts).
            log_fn: Optional logging function.

        Returns:
            List of (possibly repaired) prompt strings.
        """
        import re as _re

        # Extract anchor traits per character
        color_pattern = _re.compile(
            r'\b(black|white|red|blue|green|yellow|brown|gray|grey|blonde|blond|'
            r'auburn|brunette|silver|golden|dark|light|bright|orange|purple|pink)\b',
            _re.IGNORECASE,
        )

        char_anchors = []
        for c in characters:
            name = c["name"]
            appearance = c.get("appearance", "")
            # Find first two color words as anchors
            colors = color_pattern.findall(appearance)
            anchors = list(dict.fromkeys(col.lower() for col in colors))[:2]
            char_anchors.append({
                "name": name,
                "name_lower": name.lower(),
                "appearance": appearance,
                "color_anchors": anchors,
            })

        repaired_count = 0
        result = list(prompts)

        for i, prompt in enumerate(result):
            prompt_lower = prompt.lower()
            repairs_needed = []

            for ca in char_anchors:
                # Check if character name appears in the sentence
                # (only validate characters relevant to this sentence)
                sentence_lower = sentences[i].lower() if i < len(sentences) else ""

                # Heuristic: character is relevant if their name appears in
                # the sentence, or if there's only one character (always relevant)
                is_relevant = (
                    ca["name_lower"] in sentence_lower
                    or len(characters) == 1
                    # Also check if any pronoun-heavy sentence (no names) —
                    # protagonist is likely relevant
                    or (ca.get("name_lower", "") and
                        not any(other["name_lower"] in sentence_lower
                                for other in char_anchors))
                )

                if not is_relevant:
                    continue

                # Check compliance: name present?
                name_present = ca["name_lower"] in prompt_lower
                # Check compliance: at least one color anchor present?
                colors_present = any(
                    col in prompt_lower for col in ca["color_anchors"]
                ) if ca["color_anchors"] else True

                if not name_present or not colors_present:
                    repairs_needed.append(ca)

            if repairs_needed:
                # Prepend missing character descriptions
                prefix_parts = []
                for ca in repairs_needed:
                    prefix_parts.append(f"{ca['name']}, {ca['appearance']}")
                prefix = ". ".join(prefix_parts) + ". "
                result[i] = prefix + prompt
                repaired_count += 1

                if log_fn:
                    names = ", ".join(ca["name"] for ca in repairs_needed)
                    log_fn(
                        f"Compliance repair on sentence {i+1}: "
                        f"injected [{names}] appearance"
                    )

        if repaired_count > 0:
            print(
                f"  🔧 Compliance validator: repaired {repaired_count}/{len(prompts)} "
                f"prompts with missing character details"
            )
        else:
            print(f"  ✅ Compliance validator: all {len(prompts)} prompts passed")

        return result

    @staticmethod
    def _clean_and_repair(raw: str) -> str:
        """Strip markdown fences, then run JSON repair."""
        import re as _re

        cleaned = raw.strip()
        
        # 1. Try to find markdown code blocks first
        block_match = _re.search(r"```(?:json)?\s*(.*?)\s*```", cleaned, _re.DOTALL)
        if block_match:
            cleaned = block_match.group(1).strip()
        else:
            # 2. Try to find the outermost curly braces or brackets
            brace_match = _re.search(r"(\{.*\}|\[.*\])", cleaned, _re.DOTALL)
            if brace_match:
                cleaned = brace_match.group(1).strip()
                
        # Apply JSON repair
        return ScriptAgent._repair_json(cleaned)

    @staticmethod
    def _repair_json(text: str) -> str:
        """
        Repair common JSON issues from LLM output.

        Fixes:
        - Literal newlines inside JSON string values (the #1 cause of parse failures)
        - Trailing commas before closing brackets/braces
        - Unicode smart quotes → ASCII quotes
        - Em-dashes → hyphens
        """
        import re as _re

        # Replace unicode smart quotes with ASCII equivalents
        text = text.replace("\u201c", '"').replace("\u201d", '"')  # " "
        text = text.replace("\u2018", "'").replace("\u2019", "'")  # ' '

        # Replace em-dashes and en-dashes with hyphens
        text = text.replace("\u2014", "-").replace("\u2013", "-")  # — –

        # Fix literal newlines inside JSON string values.
        # Strategy: walk through the text tracking whether we're inside a
        # string. When we encounter a newline inside a string, replace
        # it with a space.
        result = []
        in_string = False
        escape_next = False
        i = 0

        while i < len(text):
            ch = text[i]

            if escape_next:
                result.append(ch)
                escape_next = False
                i += 1
                continue

            if ch == '\\' and in_string:
                result.append(ch)
                escape_next = True
                i += 1
                continue

            if ch == '"' and not escape_next:
                in_string = not in_string
                result.append(ch)
                i += 1
                continue

            if in_string and ch == '\n':
                # Replace literal newline inside string with a space
                result.append(' ')
                i += 1
                continue

            if in_string and ch == '\r':
                # Skip carriage returns inside strings
                i += 1
                continue

            if in_string and ch == '\t':
                # Replace tabs inside strings with a space
                result.append(' ')
                i += 1
                continue

            result.append(ch)
            i += 1

        text = ''.join(result)

        # Remove trailing commas before ] or }
        text = _re.sub(r',\s*([}\]])', r'\1', text)

        return text

    @staticmethod
    def score_hook(text: str) -> dict:
        """
        Score a hook sentence (0-10) against virality heuristics.

        Returns:
            {"total": float, "breakdown": {"curiosity_gap": float, "specificity": float, ...}}
        """
        import re as _re
        
        breakdown = {
            "curiosity_gap": 0.0,
            "specificity": 0.0,
            "emotional_charge": 0.0,
            "brevity": 0.0,
            "power_opening": 0.0,
            "narrative_tension": 0.0
        }
        
        # 1. Curiosity gap (max 2 pts)
        text_lower = text.lower()
        if text.endswith('?') or any(phrase in text_lower for phrase in ["what if", "imagine", "you won't believe", "never expected", "nobody knew"]):
            breakdown["curiosity_gap"] = 2.0
        elif any(phrase in text_lower for phrase in ["but", "however", "until", "yet", "suddenly"]):
            breakdown["curiosity_gap"] = 1.0
            
        # 2. Specificity (max 2 pts)
        # Check for numbers/statistics
        has_number = bool(_re.search(r'\b\d+\b', text_lower) or any(w in text_lower for w in ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "first", "million", "percent"]))
        # Check for proper nouns / locations
        words = text.split()
        has_proper_noun = False
        if len(words) > 1:
            for w in words[1:]:
                w_clean = w.strip(".,?!\"';:")
                if w_clean and w_clean[0].isupper() and w_clean.lower() not in ["i", "the", "a", "an", "and", "but", "or"]:
                    has_proper_noun = True
                    break
        if has_number:
            breakdown["specificity"] = 2.0
        elif has_proper_noun:
            breakdown["specificity"] = 1.0
            
        # 3. Emotional charge (max 2 pts)
        cleaned_words = [w.strip(".,?!\"';:") for w in text_lower.split()]
        emotion_matches = sum(1 for w in cleaned_words if w in EMOTION_WORDS)
        if emotion_matches >= 2:
            breakdown["emotional_charge"] = 2.0
        elif emotion_matches == 1:
            breakdown["emotional_charge"] = 1.0
            
        # 4. Brevity (max 2 pts)
        word_count = len(words)
        if 5 <= word_count <= 12:
            breakdown["brevity"] = 2.0
        elif 13 <= word_count <= 18:
            breakdown["brevity"] = 1.0
            
        # 5. Power opening (max 2 pts)
        if words:
            first_word = words[0].strip(".,?!\"';:").lower()
            if first_word in ["you", "they", "nobody", "she", "he", "we", "this", "these", "who", "what", "how", "why", "when", "where"]:
                breakdown["power_opening"] = 2.0
            elif first_word in ["imagine", "stop", "look", "listen", "remember", "never", "always", "every", "all"]:
                breakdown["power_opening"] = 2.0
            elif has_number and words[0][0].isdigit():
                breakdown["power_opening"] = 2.0
            elif len(first_word) > 2 and (first_word.endswith('s') or first_word.endswith('ed') or first_word.endswith('ing')):
                breakdown["power_opening"] = 1.5
            elif first_word not in ["the", "a", "an", "and", "but", "or", "so", "of", "to", "in", "on", "at", "for"]:
                breakdown["power_opening"] = 1.0
                
        # 6. Narrative tension / open loop (max 2 pts)
        tension_score = 0.0
        open_loop_endings = ["next", "happened", "then", "everything", "before",
                             "began", "changed", "knew", "realized", "discovered"]
        last_word = cleaned_words[-1] if cleaned_words else ""
        if last_word in open_loop_endings:
            tension_score = 2.0
        elif any(phrase in text_lower for phrase in [
            "nobody expected", "no one knew", "what happened next",
            "little did they know", "everything changed",
            "the moment when", "until one day", "before it was too late",
            "and then", "that was when"
        ]):
            tension_score = 2.0
        elif any(phrase in text_lower for phrase in [
            "didn't know", "couldn't believe", "never thought",
            "wasn't supposed to", "should have been",
        ]):
            tension_score = 1.0
            
        breakdown["narrative_tension"] = tension_score

        # P1: Buzzword stacking — if 3+ emotion words, penalize proportionally
        if emotion_matches >= 3:
            penalty = (emotion_matches - 2) * 1.5
            breakdown["buzzword_penalty"] = -penalty

        # P2: Excessive length claiming brevity — if >15 words AND got brevity points
        if word_count > 15 and breakdown["brevity"] > 0:
            breakdown["length_penalty"] = -1.0

        # P3: ALL CAPS abuse
        caps_words = sum(1 for w in words if w.isupper() and len(w) > 1)
        if caps_words >= 2:
            breakdown["caps_penalty"] = -1.5

        total = max(0.0, sum(breakdown.values()))
        return {"total": total, "breakdown": breakdown}

    def generate_hook_variations(
        self,
        original_hook: str,
        topic: str,
        style: str,
        max_retries: int = 3,
        log_fn=None,
    ) -> dict:
        """
        Generate 3 variations of the first sentence (hook) and score them.
        """
        import json
        prompt = (
            f"You are a social media hook expert. Given this hook: \"{original_hook}\"\n"
            f"for a {style} reel about: {topic}.\n\n"
            "Generate EXACTLY 3 variations as a JSON array under 'variations':\n"
            "1. Question Hook (provocative question)\n"
            "2. Shocking Stat/Bold Claim (surprising number/claim)\n"
            "3. Cliffhanger/Open Loop (mystery/tension)\n\n"
            "Format:\n"
            "{\n"
            '  "variations": [\n'
            '    {"type": "type", "text": "variation text", "reasoning": "reason"}\n'
            '  ]\n'
            "}\n\n"
            "Rules:\n"
            "- Text length: 6 to 14 words.\n"
            "- Start word must be: did you know, you, they, stop, look, imagine, how, why, what, who, when, where, this, or a number.\n"
            "- Must end with '?' or introduce a surprising fact.\n"
            "- Must contain a number/statistic, a proper noun, or a clear subject keyword.\n"
            "- Keep the tone informative and educational. Do NOT force overly dramatic emotional words.\n"
            "- JSON output only, single-line strings, ASCII only.\n"
        )
        
        original_score = self.score_hook(original_hook)
        result = {
            "original": {"text": original_hook, "score": original_score},
            "variations": [],
            "best": {"text": original_hook, "score": original_score, "source": "original"}
        }
        
        for attempt in range(max_retries):
            try:
                raw = self.ask_once(prompt)
                if log_fn:
                    log_fn(f"Hook variations attempt {attempt+1} — raw response", raw)
                
                cleaned = self._clean_and_repair(raw)
                data = json.loads(cleaned)
                
                if "variations" not in data or not isinstance(data["variations"], list):
                    raise ValueError("Missing or invalid 'variations' array")
                
                variations = data["variations"]
                if len(variations) < 3:
                    raise ValueError(f"Got {len(variations)} variations, need 3")
                
                scored_vars = []
                best_text = original_hook
                best_score = original_score["total"]
                best_source = "original"
                best_full_score = original_score
                
                for v in variations:
                    v_type = v.get("type", "unknown")
                    v_text = v.get("text", "").strip()
                    v_reasoning = v.get("reasoning", "")
                    
                    if not v_text:
                        continue
                    
                    v_score = self.score_hook(v_text)
                    scored_vars.append({
                        "type": v_type,
                        "text": v_text,
                        "reasoning": v_reasoning,
                        "score": v_score
                    })
                    
                    if v_score["total"] > best_score:
                        best_score = v_score["total"]
                        best_text = v_text
                        best_source = v_type
                        best_full_score = v_score
                
                result["variations"] = scored_vars
                result["best"] = {
                    "text": best_text,
                    "score": best_full_score,
                    "source": best_source
                }
                
                if log_fn:
                    log_fn(f"Hook variations successfully parsed and scored. Winner: {best_source}")
                break
                
            except Exception as e:
                if log_fn:
                    log_fn(f"Hook variations attempt {attempt+1} failed: {e}")
                print(f"  ⚠️  Hook variations attempt {attempt+1}/{max_retries} failed: {e}")
                
        return result

    @staticmethod
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

    def enforce_emotional_arc(
        self,
        sentences: list[str],
        topic: str,
        style: str,
        min_stdev: float = 0.08,
        max_attempts: int = 2,
        log_fn=None,
    ) -> tuple[list[str], dict]:
        """
        Enforce emotional arc contrast by calculating standard deviation across 3 acts
        and selectively regenerating the weakest act if the standard deviation is below threshold.
        """
        # Bypassed for educational/informative reels to keep them factual and clear
        return sentences, {
            "original_stdev": 0.0,
            "final_stdev": 0.0,
            "attempts": 0,
            "acts_regenerated": []
        }

    def enforce_sentence_lengths(
        self,
        sentences: list[str],
        min_words: int = 7,
        max_words: int = 13,
        target_words: int = 10,
        log_fn=None,
    ) -> tuple[list[str], dict]:
        """
        Identify sentences exceeding max_words and shorten them using a single batched LLM call.
        """
        import json
        
        current_sentences = list(sentences)
        over_long_indices = []
        original_lengths = []
        
        for i, s in enumerate(current_sentences):
            w_count = len(s.split())
            original_lengths.append(w_count)
            if w_count > max_words:
                over_long_indices.append(i)
                
        if not over_long_indices:
            return current_sentences, {
                "trimmed_count": 0,
                "trimmed_indices": [],
                "original_lengths": original_lengths,
                "final_lengths": original_lengths
            }
            
        to_trim = []
        for idx in over_long_indices:
            to_trim.append({
                "index": idx,
                "text": current_sentences[idx],
                "word_count": original_lengths[idx]
            })
            
        formatted_list = "\n".join(
            f"- Sentence [{item['index']}]: \"{item['text']}\" ({item['word_count']} words)"
            for item in to_trim
        )
        
        prompt = (
            f"Shorten the following narration sentences to be between {min_words} and {max_words} words (target: {target_words} words).\n\n"
            f"Sentences:\n{formatted_list}\n\n"
            "Format:\n"
            "{\n"
            '  "trimmed_sentences": [\n'
            '    {"index": index_here, "text": "Shortened sentence here"}\n'
            '  ]\n'
            "}\n\n"
            "Rules:\n"
            "- Preserve narrative meaning, style, and keywords.\n"
            "- Do NOT merge/combine or add any text outside of JSON. Single-line strings only.\n"
        )
        
        trimmed_indices = []
        try:
            if log_fn:
                log_fn(f"Sentence length enforcement: indices {over_long_indices} are over {max_words} words. Prompt:\n{prompt}")
            raw = self.ask_once(prompt)
            if log_fn:
                log_fn("Sentence length enforcement raw response", raw)
                
            cleaned = self._clean_and_repair(raw)
            data = json.loads(cleaned)
            
            if "trimmed_sentences" not in data or not isinstance(data["trimmed_sentences"], list):
                raise ValueError("Missing or invalid 'trimmed_sentences' array")
                
            for item in data["trimmed_sentences"]:
                idx = item.get("index")
                text = item.get("text", "").strip()
                if idx is not None and isinstance(idx, int) and 0 <= idx < len(current_sentences) and text:
                    new_w_count = len(text.split())
                    # Validate that it actually got shorter or is within limit
                    if new_w_count <= max_words:
                        current_sentences[idx] = text
                        trimmed_indices.append(idx)
                    else:
                        if log_fn:
                            log_fn(f"Shortened sentence at index {idx} still too long ({new_w_count} words): '{text}'")
                            
        except Exception as e:
            if log_fn:
                log_fn(f"Sentence length enforcement failed: {e}")
                
        final_lengths = [len(s.split()) for s in current_sentences]
        return current_sentences, {
            "trimmed_count": len(trimmed_indices),
            "trimmed_indices": trimmed_indices,
            "original_lengths": original_lengths,
            "final_lengths": final_lengths
        }


