"""
Gemini Agent via Antigravity-CLI Auth
======================================
Uses the antigravity-cli's OAuth token to call Gemini models through Google's
Cloud Code Platform API (CCPA) — the same internal API the CLI uses.

Usage:
    from gemini_agent import GeminiAgent

    agent = GeminiAgent(
        persona="You are a creative storyteller for social media reels.",
        project="sustained-flare-xhpd3",  # From loadCodeAssist response
    )
    response = agent.ask("Write a scary 2-sentence story about a haunted house")
    print(response)
"""

import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional


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
}

EMOTION_BIGRAMS = {
    "no one": 0.6, "never again": 0.8, "too late": 0.8,
    "last chance": 0.7, "point of no return": 0.9,
    "no way out": 0.9, "left behind": 0.7,
}

EMOTION_WORDS = frozenset(EMOTION_LEXICON.keys())



class GeminiAgent:
    """
    An agent that uses the antigravity-cli's OAuth token to call Gemini models
    via the Cloud Code Platform API (CCPA).

    The CCPA endpoint (daily-cloudcode-pa.googleapis.com) provides access to
    Gemini models through the same auth flow used by the antigravity CLI tool.

    Supports:
    - System instructions / persona via conversation history priming
    - Multi-turn conversations with history
    - Automatic token expiry checking
    - Configurable model selection
    """

    # ── Endpoints ──────────────────────────────────────────────────────────
    # The CLI uses gRPC to cloudcode-pa.googleapis.com, but Google also
    # exposes a REST/JSON transcoding layer on the same service.
    ENDPOINT_DAILY = "https://daily-cloudcode-pa.googleapis.com"
    ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com"

    # ── API Paths ──────────────────────────────────────────────────────────
    PATH_GENERATE_CHAT = "/v1internal:generateChat"
    PATH_LOAD_CODE_ASSIST = "/v1internal:loadCodeAssist"
    PATH_FETCH_MODELS = "/v1internal:fetchAvailableModels"
    PATH_GENERATE_CONTENT = "/v1internal:generateContent"

    # ── Token Files ────────────────────────────────────────────────────────
    TOKEN_FILE_CLI = os.path.expanduser(
        "~/.gemini/antigravity-cli/antigravity-oauth-token"
    )
    TOKEN_FILE_DESKTOP = os.path.expanduser("~/.gemini/oauth_creds.json")

    # ── Author Enum ────────────────────────────────────────────────────────
    # ChatMessage.EntityType enum values:
    #   "USER"   (or 1) = User message
    #   "SYSTEM" (or 2) = System/model response
    AUTHOR_USER = "USER"
    AUTHOR_SYSTEM = "SYSTEM"

    def __init__(
        self,
        persona: Optional[str] = None,
        project: Optional[str] = None,
        tier_id: str = "standard-tier",
        endpoint: str = "daily",  # "daily" (staging) or "prod"
        max_retries: int = 3,
        retry_delay: float = 5.0,
    ):
        """
        Initialize the Gemini Agent.

        Args:
            persona: System instruction / persona prompt. The model will be
                     primed with this via a fake conversation turn at the
                     start of the history.
            project: GCP project ID. If None, auto-discovered via loadCodeAssist.
            tier_id: Tier ID (usually "standard-tier").
            endpoint: "daily" for staging, "prod" for production.
            max_retries: Max retries on rate limit (429) errors.
            retry_delay: Base delay in seconds between retries.
        """
        self.persona = persona
        self.project = project
        self.tier_id = tier_id
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.base_url = (
            self.ENDPOINT_DAILY if endpoint == "daily" else self.ENDPOINT_PROD
        )

        # Conversation history for multi-turn
        self._history: list[dict] = []

        # Token cache
        self._access_token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None

        # Load token on init
        self._load_token()

        # Auto-discover project if not provided
        if not self.project:
            self._discover_project()

        # Apply persona as initial history if provided
        if self.persona:
            self._apply_persona()

    # ── Token Management ───────────────────────────────────────────────────

    def _load_token(self):
        """Load the OAuth token from the antigravity-cli token file."""
        token_path = Path(self.TOKEN_FILE_CLI)
        if not token_path.exists():
            raise FileNotFoundError(
                f"Antigravity CLI token not found at {self.TOKEN_FILE_CLI}\n"
                "Run 'agy' and log in first to create the token."
            )

        with open(token_path) as f:
            data = json.load(f)

        token_data = data["token"]
        self._access_token = token_data["access_token"]

        # Parse expiry (handle nanosecond precision)
        expiry_str = token_data.get("expiry", "")
        if expiry_str:
            import re

            expiry_clean = re.sub(r"\.\d+", "", expiry_str)
            try:
                self._token_expiry = datetime.fromisoformat(expiry_clean)
            except ValueError:
                self._token_expiry = None

    def _is_token_valid(self) -> bool:
        """Check if the current token is still valid."""
        if not self._access_token:
            return False
        if not self._token_expiry:
            return True  # Can't check, assume valid
        now = datetime.now(self._token_expiry.tzinfo)
        # Add 60s buffer
        return (self._token_expiry - now).total_seconds() > 60

    def _ensure_token(self):
        """Ensure we have a valid token, reload if expired."""
        if not self._is_token_valid():
            self._load_token()
            if not self._is_token_valid():
                raise RuntimeError(
                    "Token is expired. Run 'agy' to refresh authentication."
                )

    # ── Project Discovery ──────────────────────────────────────────────────

    def _discover_project(self):
        """Auto-discover the project ID from loadCodeAssist."""
        try:
            result = self._api_call(self.PATH_LOAD_CODE_ASSIST, {})
            self.project = result.get("cloudaicompanionProject", "")
            if not self.project:
                raise ValueError("No project found in loadCodeAssist response")
            print(f"[GeminiAgent] Auto-discovered project: {self.project}")
        except Exception as e:
            raise RuntimeError(
                f"Failed to auto-discover project: {e}\n"
                "Please provide the project ID manually."
            )

    # ── Persona / System Instructions ──────────────────────────────────────

    def _apply_persona(self):
        """
        Apply persona via conversation history priming.

        The CCPA generateChat endpoint doesn't have a dedicated
        systemInstruction field. Instead, we prime the model by injecting
        a fake conversation turn where the user defines the persona and
        the "system" acknowledges it.
        """
        if self.persona:
            self._history = [
                {
                    "author": self.AUTHOR_USER,
                    "content": self.persona,
                },
                {
                    "author": self.AUTHOR_SYSTEM,
                    "content": (
                        "Understood. I will follow these instructions precisely "
                        "for all subsequent messages."
                    ),
                },
            ]

    # ── Core API Call ──────────────────────────────────────────────────────

    def _api_call(self, path: str, payload: dict) -> dict:
        """Make an API call to the CCPA endpoint."""
        self._ensure_token()

        url = self.base_url + path
        data = json.dumps(payload).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Authorization": f"Bearer {self._access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        for attempt in range(self.max_retries + 1):
            try:
                with urllib.request.urlopen(req, timeout=30.0) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                error_body = e.read().decode("utf-8", errors="replace")
                if e.code == 429:
                    # Rate limited — wait and retry
                    if attempt < self.max_retries:
                        wait = self.retry_delay * (2**attempt)
                        print(
                            f"[GeminiAgent] Rate limited, "
                            f"retrying in {wait:.0f}s... "
                            f"(attempt {attempt + 1}/{self.max_retries})"
                        )
                        time.sleep(wait)
                        # Recreate request (urlopen consumed it)
                        req = urllib.request.Request(
                            url,
                            data=data,
                            headers={
                                "Authorization": f"Bearer {self._access_token}",
                                "Content-Type": "application/json",
                            },
                            method="POST",
                        )
                        continue
                    else:
                        raise RuntimeError(
                            f"Rate limited after {self.max_retries} retries"
                        )
                elif e.code == 401:
                    # Token expired — try to reload
                    self._load_token()
                    req = urllib.request.Request(
                        url,
                        data=data,
                        headers={
                            "Authorization": f"Bearer {self._access_token}",
                            "Content-Type": "application/json",
                        },
                        method="POST",
                    )
                    continue
                else:
                    try:
                        error_data = json.loads(error_body)
                        msg = error_data.get("error", {}).get("message", error_body)
                    except json.JSONDecodeError:
                        msg = error_body
                    raise RuntimeError(f"API error {e.code}: {msg}")
            except (urllib.error.URLError, TimeoutError) as e:
                # Timeout or connection error — wait and retry
                if attempt < self.max_retries:
                    wait = self.retry_delay * (2**attempt)
                    print(
                        f"[GeminiAgent] Network error / Timeout: {e}, "
                        f"retrying in {wait:.0f}s... "
                        f"(attempt {attempt + 1}/{self.max_retries})"
                    )
                    time.sleep(wait)
                    req = urllib.request.Request(
                        url,
                        data=data,
                        headers={
                            "Authorization": f"Bearer {self._access_token}",
                            "Content-Type": "application/json",
                        },
                        method="POST",
                    )
                    continue
                else:
                    raise RuntimeError(f"Network error after retries: {e}")

        raise RuntimeError("Max retries exceeded")

    # ── Chat Methods ───────────────────────────────────────────────────────

    def ask(self, message: str) -> str:
        """
        Send a message and get a response. Maintains conversation history.

        Args:
            message: The user's message.

        Returns:
            The model's response text (markdown).
        """
        payload = {
            "userMessage": message,
            "project": self.project,
            "tierId": self.tier_id,
        }

        # Include conversation history if we have any
        if self._history:
            payload["history"] = self._history

        result = self._api_call(self.PATH_GENERATE_CHAT, payload)

        response_text = result.get("markdown", "")

        # Update history with this exchange
        self._history.append(
            {"author": self.AUTHOR_USER, "content": message}
        )
        self._history.append(
            {"author": self.AUTHOR_SYSTEM, "content": response_text}
        )

        return response_text

    def ask_once(self, message: str) -> str:
        """
        Send a single message without maintaining history.
        Persona is still applied if set.

        Args:
            message: The user's message.

        Returns:
            The model's response text (markdown).
        """
        history = []

        # Apply persona if set
        if self.persona:
            history = [
                {"author": self.AUTHOR_USER, "content": self.persona},
                {
                    "author": self.AUTHOR_SYSTEM,
                    "content": (
                        "Understood. I will follow these instructions precisely."
                    ),
                },
            ]

        payload = {
            "userMessage": message,
            "project": self.project,
            "tierId": self.tier_id,
        }

        if history:
            payload["history"] = history

        result = self._api_call(self.PATH_GENERATE_CHAT, payload)
        return result.get("markdown", "")

    def reset_history(self):
        """Clear conversation history (persona is re-applied)."""
        self._history = []
        if self.persona:
            self._apply_persona()

    def set_persona(self, persona: str):
        """Update the persona and reset history."""
        self.persona = persona
        self.reset_history()

    def get_usage(self, result: dict) -> dict:
        """Extract usage metadata from a raw API result."""
        usage = result.get("usageMetadata", {})
        return {
            "prompt_tokens": int(usage.get("promptTokenCount", 0)),
            "completion_tokens": int(usage.get("candidatesTokenCount", 0)),
            "total_tokens": int(usage.get("totalTokenCount", 0)),
            "thinking_tokens": int(usage.get("thoughtsTokenCount", 0)),
        }

    # ── Convenience Methods ────────────────────────────────────────────────

    def generate_story(self, topic: str, style: str = "dramatic") -> str:
        """
        Generate a short story for a reel.

        Args:
            topic: What the story should be about.
            style: The tone/style (dramatic, funny, scary, etc.)

        Returns:
            The generated story text.
        """
        prompt = (
            f"Write a short, {style} story about: {topic}\n\n"
            "Requirements:\n"
            "- 3-5 sentences maximum\n"
            "- Hook the audience from the first word\n"
            "- Perfect for a 30-60 second social media reel\n"
            "- Be vivid and cinematic\n"
            "- End with a twist or powerful conclusion\n\n"
            "Respond with ONLY the story text, no titles or explanations."
        )
        return self.ask_once(prompt)

    def generate_image_prompts(self, story: str, num_scenes: int = 4) -> list[str]:
        """
        Generate ComfyUI-compatible image prompts for each scene of a story.

        Args:
            story: The story text to generate visuals for.
            num_scenes: Number of scene images to generate.

        Returns:
            List of image generation prompts.
        """
        prompt = (
            f"Given this story:\n\n\"{story}\"\n\n"
            f"Generate exactly {num_scenes} image prompts for a text-to-image AI "
            "(like Stable Diffusion / ComfyUI). Each prompt should describe one "
            "scene from the story.\n\n"
            "Requirements:\n"
            "- Each prompt should be a detailed visual description\n"
            "- Include lighting, mood, camera angle\n"
            "- Cinematic quality, photorealistic style\n"
            "- One prompt per line\n"
            "- No numbering, no explanations\n\n"
            "Respond with ONLY the prompts, one per line."
        )
        result = self.ask_once(prompt)
        # Split into individual prompts
        prompts = [
            line.strip()
            for line in result.strip().split("\n")
            if line.strip()
        ]
        return prompts[:num_scenes]

    def generate_narration_script(self, story: str) -> str:
        """
        Generate a narration script optimized for TTS (ChatTTS).

        Args:
            story: The story text to convert to narration.

        Returns:
            The narration script text.
        """
        prompt = (
            f"Convert this story into a narration script optimized for "
            f"text-to-speech:\n\n\"{story}\"\n\n"
            "Requirements:\n"
            "- Use natural, spoken language\n"
            "- Add dramatic pauses with '...'\n"
            "- Keep sentences short for better TTS output\n"
            "- Avoid special characters that TTS can't pronounce\n"
            "- Maintain the dramatic tone\n\n"
            "Respond with ONLY the narration script."
        )
        return self.ask_once(prompt)

    def generate_reel_script(
        self,
        topic: str,
        style: str = "dramatic",
        num_sentences: int = 18,
        max_retries: int = 5,
        log_file: str = "llm_debug.log",
        optimize_hook: bool = True,
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
        print("[GeminiAgent] Phase 1: Generating narration sentences...")

        phase1_prompt = (
            f"You are a viral social media reel scriptwriter. "
            f"Write a {style} script about: {topic}\n\n"
            "OUTPUT FORMAT: Respond with ONLY valid JSON, nothing else.\n\n"
            "{\n"
            '  "title": "Short catchy title",\n'
            '  "sentences": [\n'
            '    "First narration sentence here.",\n'
            '    "Second narration sentence here."\n'
            "  ]\n"
            "}\n\n"
            "RULES:\n"
            f"- sentences array must contain EXACTLY {num_sentences} strings\n"
            "- Each sentence MUST be between 8 and 12 words in length, optimized for punchy visual narration.\n"
            "- No stage directions, no quotes, no parentheticals.\n"
            "- Keep every string on a single line, no line breaks.\n"
            "- Use only ASCII characters.\n"
            "- HOOK SENTENCE (Sentence 1): Design it as a powerful, clean viral hook:\n"
            "  * Must start with a power word like 'Imagine', 'Nobody', 'You', 'They', 'This', or 'Every'.\n"
            "  * Must contain exactly 1 or 2 strong emotion words (e.g. 'terrifying', 'unbelievable', 'impossible') but NOT 3 or more.\n"
            "  * Must create an immediate curiosity gap or shocking stat (e.g., ending in a question mark or saying 'You won\\'t believe...').\n"
            "- CLEAR 3-ACT EMOTIONAL CONTRAST STRUCTURE:\n"
            "  * ACT 1 (First third of script): Atmospheric & descriptive setting. Keep emotional intensity very low. Use at most 0 or 1 low-intensity words (e.g. 'mysterious', 'ancient', 'hidden', 'shadow', 'secret').\n"
            "  * ACT 2 (Middle third of script): High emotional intensity. Build dramatic suspense or visceral conflict using strong visceral keywords (e.g. 'terrifying', 'devastating', 'horrifying', 'panic', 'desperate', 'furious'). Include 1 or 2 of these in every middle sentence.\n"
            "  * ACT 3 (Final third of script): Resolving impact / climax. Transition to profound, inspiring, or legendary resolutions using high-value resolution keywords (e.g. 'miracle', 'beautiful', 'hope', 'love', 'glorious', 'legendary'). Include 1 or 2 in every final sentence.\n"
            "  * This stark contrast between Act 1 (flat/calm), Act 2 (terrifying/tense), and Act 3 (miraculous/climax) is CRITICAL to maximize the score.\n"
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
                print(f"[GeminiAgent] Phase 1 OK: {len(sentences)} sentences generated")
                break

            except (json.JSONDecodeError, ValueError) as e:
                _log(f"Phase 1 attempt {attempt+1} FAILED: {e}")
                print(f"[GeminiAgent] Phase 1 attempt {attempt+1}/{max_retries} failed: {e}")
                if attempt >= max_retries - 1:
                    raise RuntimeError(
                        f"Phase 1 failed after {max_retries} attempts: {e}\n"
                        f"Check {log_file} for raw LLM outputs."
                    )

        sentences = script_data["sentences"]

        # ── Phase 1b: Hook Optimization ────────────────────────────
        if optimize_hook:
            print("[GeminiAgent] Phase 1b: Optimizing hook...")
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
            print(f"[GeminiAgent] Phase 1b OK: best hook = "
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
        print("[GeminiAgent] Phase 1c: Enforcing emotional arc contrast...")
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
        print(f"[GeminiAgent] Phase 1c OK: StDev {arc_info['final_stdev']:.3f}")

        # ── Phase 1d: Sentence Length Enforcement ──────────────────
        print("[GeminiAgent] Phase 1d: Enforcing sentence lengths...")
        sentences, trim_info = self.enforce_sentence_lengths(
            sentences=sentences,
            log_fn=_log,
        )
        script_data["sentences"] = sentences
        script_data["trim_enforcement"] = trim_info
        if trim_info["trimmed_count"] > 0:
            _log(f"Trimmed {trim_info['trimmed_count']} sentences: {trim_info['trimmed_indices']}")
            print(f"[GeminiAgent] Phase 1d OK: trimmed {trim_info['trimmed_count']} over-long sentences")
        else:
            print("[GeminiAgent] Phase 1d OK: all sentences within target length")

        # ── Phase 2: Character & Environment Bible ─────────────────────
        print("[GeminiAgent] Phase 2: Generating character & environment bible...")

        numbered_all = "\n".join(
            f"{i+1}. {s}" for i, s in enumerate(sentences)
        )

        phase2_prompt = (
            "You are a visual production designer. Given the narration sentences below, "
            "create a CHARACTER BIBLE and ENVIRONMENT BIBLE for consistent image generation.\n\n"
            f"NARRATION SENTENCES:\n{numbered_all}\n\n"
            "OUTPUT FORMAT: Respond with ONLY valid JSON, nothing else.\n\n"
            "{\n"
            '  "characters": [\n'
            "    {\n"
            '      "name": "Character name used in the story",\n'
            '      "role": "protagonist / supporting / etc",\n'
            '      "appearance": "EXACT physical description: age, gender, hair color and style, skin tone, eye color, build, clothing. Keep clothing SIMPLE and HIGH-CONTRAST with bold solid colors (e.g. bright red jacket, white shirt, dark blue jeans). No complex patterns or layered outfits."\n'
            "    }\n"
            "  ],\n"
            '  "environments": [\n'
            "    {\n"
            '      "id": "short_snake_case_id",\n'
            '      "name": "Human readable name",\n'
            '      "description": "Detailed setting: architecture, colors, materials, key objects, lighting conditions, time of day, weather if outdoor"\n'
            "    }\n"
            "  ],\n"
            '  "sentence_environments": [\n'
            '    "env_id_for_sentence_1",\n'
            '    "env_id_for_sentence_2"\n'
            "  ]\n"
            "}\n\n"
            "RULES:\n"
            "- List ALL characters that appear or are implied in the story\n"
            "- List ALL distinct locations/settings across the story\n"
            f"- sentence_environments array must have EXACTLY {len(sentences)} entries, one per sentence\n"
            "- Each entry in sentence_environments must be an id from the environments array\n"
            "- Character clothing must use BOLD, SOLID colors (red, white, black, blue) — no pastels, no patterns, no layered descriptions\n"
            "- Each character appearance must be specific enough to reproduce exactly in every image\n"
            "- Keep every string on a single line, no line breaks\n"
            "- Use only ASCII characters\n"
        )

        bible_data = None
        for attempt in range(max_retries):
            try:
                raw = self.ask_once(phase2_prompt)
                _log(f"Phase 2 attempt {attempt+1} — raw response ({len(raw)} chars)", raw)

                cleaned = self._clean_and_repair(raw)
                _log(f"Phase 2 attempt {attempt+1} — after repair ({len(cleaned)} chars)", cleaned)

                data = json.loads(cleaned)

                # Validate characters
                if "characters" not in data or not isinstance(data["characters"], list):
                    raise ValueError("Missing or invalid 'characters' array")
                if len(data["characters"]) == 0:
                    raise ValueError("No characters defined")
                for c in data["characters"]:
                    if not c.get("name") or not c.get("appearance"):
                        raise ValueError(f"Character missing name or appearance: {c}")

                # Validate environments
                if "environments" not in data or not isinstance(data["environments"], list):
                    raise ValueError("Missing or invalid 'environments' array")
                if len(data["environments"]) == 0:
                    raise ValueError("No environments defined")
                env_ids = {e["id"] for e in data["environments"]}
                for e in data["environments"]:
                    if not e.get("id") or not e.get("description"):
                        raise ValueError(f"Environment missing id or description: {e}")

                # Validate sentence_environments
                sent_envs = data.get("sentence_environments", [])
                if not isinstance(sent_envs, list) or len(sent_envs) < len(sentences):
                    raise ValueError(
                        f"sentence_environments has {len(sent_envs)} entries, "
                        f"need {len(sentences)}"
                    )
                # Warn about unknown env ids but don't fail
                for idx, env_id in enumerate(sent_envs[:len(sentences)]):
                    if env_id not in env_ids:
                        print(
                            f"  ⚠️  Sentence {idx+1} references unknown env '{env_id}', "
                            f"available: {env_ids}"
                        )

                bible_data = data
                print(f"[GeminiAgent] Phase 2 OK: "
                      f"{len(data['characters'])} characters, "
                      f"{len(data['environments'])} environments")
                break

            except (json.JSONDecodeError, ValueError) as e:
                _log(f"Phase 2 attempt {attempt+1} FAILED: {e}")
                print(f"[GeminiAgent] Phase 2 attempt {attempt+1}/{max_retries} failed: {e}")
                if attempt >= max_retries - 1:
                    raise RuntimeError(
                        f"Phase 2 failed after {max_retries} attempts: {e}\n"
                        f"Check {log_file} for raw LLM outputs."
                    )

        characters = bible_data["characters"]
        environments = bible_data["environments"]
        sent_envs = bible_data["sentence_environments"][:len(sentences)]
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
        print(f"[GeminiAgent] Phase 3: Generating image prompts for {len(sentences)} sentences...")

        # Build the bible context block that will be injected into every batch
        char_block = "\n".join(
            f"- {c['name']} ({c.get('role', '')}): {c['appearance']}"
            for c in characters
        )
        env_block = "\n".join(
            f"- {e['id']}: {e['description']}"
            for e in environments
        )
        bible_context = (
            "CHARACTER BIBLE (use these EXACT descriptions — do not paraphrase, "
            "do not invent new characters):\n"
            f"{char_block}\n\n"
            "ENVIRONMENT BIBLE (use these EXACT descriptions for settings):\n"
            f"{env_block}\n"
        )

        BATCH_SIZE = 6
        all_image_prompts = []
        CONSISTENCY_SUFFIX = (
            "Consistent character design, same outfit throughout, "
            "photorealistic, cinematic, 4K, high detail."
        )

        for batch_start in range(0, len(sentences), BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, len(sentences))
            batch = sentences[batch_start:batch_end]
            batch_envs = sent_envs[batch_start:batch_end]
            batch_nums = list(range(batch_start + 1, batch_end + 1))

            print(f"  📷 Generating prompts for sentences {batch_nums[0]}-{batch_nums[-1]}...")

            numbered_with_env = "\n".join(
                f"{n}. [ENV: {env}] {s}"
                for n, s, env in zip(batch_nums, batch, batch_envs)
            )

            phase3_prompt = (
                "Generate image prompts for a text-to-image AI. "
                "You MUST reference the exact character appearances and "
                "environment descriptions from the bible below. "
                "Do NOT invent new characters or change any physical detail.\n\n"
                f"{bible_context}\n"
                f"SENTENCES (with assigned environment):\n{numbered_with_env}\n\n"
                "OUTPUT FORMAT: Respond with ONLY a JSON array of strings, nothing else.\n"
                "Each string is one detailed image prompt.\n\n"
                "[\n"
                '  "Character name, exact appearance from bible, in environment from bible. '
                'Action/pose. Camera angle, lighting, mood, color palette.",\n'
                '  "Another scene..."\n'
                "]\n\n"
                "RULES:\n"
                f"- Array must contain EXACTLY {len(batch)} prompts (one per sentence)\n"
                "- Each prompt: 40-70 words, hyper-descriptive\n"
                "- MUST include character name AND their appearance keywords from the bible\n"
                "- MUST include the assigned environment description from the bible\n"
                "- Include: camera angle, lighting direction, mood, color palette\n"
                "- Each prompt must be visually distinct in composition/action\n"
                "- Keep every string on a single line\n"
                "- Match the emotional tone of the paired sentence\n"
            )

            batch_prompts = None
            for attempt in range(max_retries):
                try:
                    raw = self.ask_once(phase3_prompt)
                    _log(
                        f"Phase 3 batch {batch_nums[0]}-{batch_nums[-1]} "
                        f"attempt {attempt+1} — raw ({len(raw)} chars)",
                        raw,
                    )

                    cleaned = self._clean_and_repair(raw)
                    parsed = json.loads(cleaned)

                    if not isinstance(parsed, list):
                        raise ValueError("Expected a JSON array")

                    # Ensure all entries are strings
                    prompts = [str(p).strip() for p in parsed if str(p).strip()]
                    if len(prompts) < len(batch):
                        raise ValueError(
                            f"Got {len(prompts)} prompts, expected {len(batch)}"
                        )

                    batch_prompts = prompts[:len(batch)]
                    break

                except (json.JSONDecodeError, ValueError) as e:
                    _log(f"Phase 3 batch attempt {attempt+1} FAILED: {e}")
                    print(f"    ⚠️  Attempt {attempt+1}/{max_retries} failed: {e}")
                    if attempt >= max_retries - 1:
                        # Fallback: build prompts from bible directly
                        print(f"    ⚠️  Using bible-based fallback prompts for this batch")
                        batch_prompts = []
                        for s, env_id in zip(batch, batch_envs):
                            env_desc = env_lookup.get(env_id, {}).get("description", "")
                            char_descs = ". ".join(
                                f"{c['name']}, {c['appearance']}" for c in characters
                            )
                            batch_prompts.append(
                                f"{char_descs}. Setting: {env_desc}. "
                                f"Scene depicting: {s}. Dramatic lighting, "
                                f"cinematic composition, 4K."
                            )

            all_image_prompts.extend(batch_prompts)

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
            f"[GeminiAgent] Script complete: "
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
        return GeminiAgent._repair_json(cleaned)

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

        total = sum(breakdown.values())

        # ── Penalties (applied after raw total) ──

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
            f"You are a viral social media hook expert. Given this initial hook: \"{original_hook}\"\n"
            f"for a {style} reel about: {topic}.\n\n"
            "Generate EXACTLY 3 variations of this hook using these virality heuristics:\n"
            "1. Question Hook (opens with a compelling/provocative question)\n"
            "2. Shocking Stat/Bold Claim (leads with a surprising number, percentage, or counterintuitive fact)\n"
            "3. Cliffhanger/Open Loop (starts in the middle of action or creates immediate mystery/tension)\n\n"
            "OUTPUT FORMAT: Respond with ONLY valid JSON, nothing else.\n\n"
            "{\n"
            '  "variations": [\n'
            '    {\n'
            '      "type": "question",\n'
            '      "text": "The new question hook here.",\n'
            '      "reasoning": "Why this hooks the viewer"\n'
            '    },\n'
            '    {\n'
            '      "type": "shocking_stat",\n'
            '      "text": "The shocking stat hook here.",\n'
            '      "reasoning": "Why this hooks the viewer"\n'
            '    },\n'
            '    {\n'
            '      "type": "cliffhanger",\n'
            '      "text": "The cliffhanger hook here.",\n'
            '      "reasoning": "Why this hooks the viewer"\n'
            '    }\n'
            '  ]\n'
            "}\n\n"
            "CRITICAL SCORING RULES TO ACHIEVE A PERFECT 10/10 SCORE:\n"
            "- BREVITY: The text of each variation MUST be EXACTLY between 5 and 12 words in length.\n"
            "- POWER OPENING: The first word MUST be one of: 'you', 'they', 'nobody', 'she', 'he', 'we', 'this', 'these', 'who', 'what', 'how', 'why', 'when', 'where', 'imagine', 'stop', 'look', 'listen', 'never', 'always', 'every', 'all', or start with a number (e.g. '5').\n"
            "- CURIOSITY GAP: Must end with a question mark '?' OR contain one of these exact phrases: 'what if', 'imagine', 'you won\\'t believe', 'never expected', 'nobody knew'.\n"
            "- SPECIFICITY: Must contain a number/statistic (e.g. 'one', 'two', 'three', '5', 'million', 'percent') OR a proper noun (e.g. 'London', 'Sarah').\n"
            "- EMOTIONAL CHARGE: Must contain EXACTLY TWO (2) emotion words from this list: [terrifying, miracle, heartbreaking, shocking, unbelievable, devastating, incredible, horrifying, beautiful, tragic, mysterious, deadly, haunting, breathtaking, chilling, stunning, furious, desperate, forbidden, legendary, impossible, nightmare, paradise, catastrophic, euphoric, ruthless, savage, vengeful].\n"
            "  * WARNING: Do NOT use 3 or more emotion words, or it will trigger a severe buzzword-stacking penalty!\n"
            "- NO CAPS ABUSE: Use standard sentence case. Do NOT use all-caps words (e.g. do NOT write 'TERRIFYING', write 'terrifying').\n"
            "- Keep every string on a single line, no line breaks.\n"
            "- Use only ASCII characters.\n"
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
        import json
        
        original_stdev = 0.0
        final_stdev = 0.0
        attempts = 0
        acts_regenerated = []
        
        current_sentences = list(sentences)
        n_sents = len(current_sentences)
        if n_sents < 3:
            # Cannot do 3-act split
            return current_sentences, {
                "original_stdev": 0.0,
                "final_stdev": 0.0,
                "attempts": 0,
                "acts_regenerated": []
            }
            
        # Helper to compute densities and StDev
        def compute_arc(sents):
            densities = [self._emotion_density(s) for s in sents]
            act_sz = len(sents) // 3
            act1 = densities[:act_sz]
            act2 = densities[act_sz:2*act_sz]
            act3 = densities[2*act_sz:]
            
            m1 = sum(act1) / len(act1) if act1 else 0.0
            m2 = sum(act2) / len(act2) if act2 else 0.0
            m3 = sum(act3) / len(act3) if act3 else 0.0
            
            means = [m1, m2, m3]
            ov_mean = sum(means) / 3.0
            var = sum((m - ov_mean) ** 2 for m in means) / 3.0
            sd = var ** 0.5
            return sd, m1, m2, m3
            
        std_dev, mean1, mean2, mean3 = compute_arc(current_sentences)
        original_stdev = std_dev
        final_stdev = std_dev
        
        if log_fn:
            log_fn(f"Initial emotional arc check: StDev = {std_dev:.4f} (Means: Act 1={mean1:.4f}, Act 2={mean2:.4f}, Act 3={mean3:.4f})")
            
        while final_stdev < min_stdev and attempts < max_attempts:
            attempts += 1
            # Determine weakest act using target deviation pattern: [0.0, 0.15, 0.10]
            deviations = [
                abs(mean1 - 0.0),
                abs(mean2 - 0.15),
                abs(mean3 - 0.10)
            ]
            weakest_act_idx = deviations.index(max(deviations))
            weakest_act_num = weakest_act_idx + 1
            acts_regenerated.append(weakest_act_num)
            
            act_sz = n_sents // 3
            if weakest_act_num == 1:
                start_idx, end_idx = 0, act_sz
                act_instruction = (
                    "ACT 1: Atmospheric & descriptive setting. Keep emotional intensity extremely low. "
                    "Do NOT use any high-intensity emotion words. You can use at most 0 or 1 low-intensity words (e.g. 'mysterious', 'ancient', 'hidden', 'shadow', 'secret')."
                )
            elif weakest_act_num == 2:
                start_idx, end_idx = act_sz, 2 * act_sz
                act_instruction = (
                    "ACT 2: High emotional intensity. Build dramatic suspense or visceral conflict. "
                    "Each sentence MUST contain at least one of these exact visceral keywords: "
                    "['terrifying', 'devastating', 'horrifying', 'panic', 'desperate', 'furious', 'nightmare', 'catastrophic', 'heartbreaking', 'shocking', 'ruthless', 'savage', 'vengeful']."
                )
            else:
                start_idx, end_idx = 2 * act_sz, n_sents
                act_instruction = (
                    "ACT 3: Resolving impact / climax. Transition to profound, inspiring, or legendary resolutions. "
                    "Each sentence MUST contain at least one of these exact resolution/climax keywords: "
                    "['miracle', 'beautiful', 'hope', 'love', 'glorious', 'legendary', 'unbelievable', 'incredible', 'stunning', 'electrifying', 'paradise']."
                )
                
            act_sentences = current_sentences[start_idx:end_idx]
            formatted_sentences = "\n".join(f"- {s}" for s in act_sentences)
            
            prompt = (
                f"You are a viral social media reel scriptwriter. We are optimizing a {style} script about: {topic}.\n"
                f"We need to rewrite Act {weakest_act_num} of the script to dramatically improve the emotional arc.\n\n"
                f"Here are the current sentences for Act {weakest_act_num}:\n"
                f"{formatted_sentences}\n\n"
                f"INSTRUCTION FOR ACT {weakest_act_num}:\n"
                f"{act_instruction}\n\n"
                "CRITICAL RULES:\n"
                "- Rewrite each sentence to follow the instruction above, maintaining the exact narrative flow, meaning, and connection to the rest of the story.\n"
                "- Each rewritten sentence MUST be between 8 and 12 words in length.\n"
                "- Return EXACTLY the same number of sentences as provided.\n"
                "- Return ONLY valid JSON as a dictionary with a single key 'sentences' mapped to a list of strings, like this:\n"
                "{\n"
                '  "sentences": [\n'
                '    "Rewritten sentence 1",\n'
                '    "Rewritten sentence 2"\n'
                "  ]\n"
                "}\n"
            )
            
            try:
                if log_fn:
                    log_fn(f"Regenerating Act {weakest_act_num} (attempt {attempts}). Prompt:\n{prompt}")
                raw = self.ask_once(prompt)
                if log_fn:
                    log_fn(f"Regenerate Act {weakest_act_num} attempt {attempts} — raw response", raw)
                
                cleaned = self._clean_and_repair(raw)
                data = json.loads(cleaned)
                
                if "sentences" not in data or not isinstance(data["sentences"], list):
                    raise ValueError("Missing or invalid 'sentences' array in response")
                    
                new_act_sents = data["sentences"]
                expected_count = end_idx - start_idx
                if len(new_act_sents) != expected_count:
                    raise ValueError(f"Got {len(new_act_sents)} sentences, expected {expected_count}")
                    
                # Replace in current list
                current_sentences[start_idx:end_idx] = [s.strip() for s in new_act_sents]
                
                # Recompute
                std_dev, mean1, mean2, mean3 = compute_arc(current_sentences)
                final_stdev = std_dev
                if log_fn:
                    log_fn(f"After attempt {attempts}: StDev = {final_stdev:.4f} (Means: Act 1={mean1:.4f}, Act 2={mean2:.4f}, Act 3={mean3:.4f})")
                
            except Exception as e:
                if log_fn:
                    log_fn(f"Regeneration attempt {attempts} failed: {e}")
                    
        return current_sentences, {
            "original_stdev": original_stdev,
            "final_stdev": final_stdev,
            "attempts": attempts,
            "acts_regenerated": acts_regenerated
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
            "You are a professional copyeditor. We need to shorten the following social media narration sentences "
            f"to make them exactly between {min_words} and {max_words} words long (ideal: {target_words} words).\n\n"
            "Sentence List:\n"
            f"{formatted_list}\n\n"
            "CRITICAL RULES:\n"
            "- Shorten each sentence to be extremely punchy.\n"
            "- Preserve the core narrative meaning, tense, style, and any key emotional words.\n"
            "- Do NOT add explanation, do NOT merge or combine sentences.\n"
            "- Return ONLY valid JSON as a dictionary with a single key 'trimmed_sentences' mapped to a list of objects, each containing 'index' (integer) and 'text' (string), like this:\n"
            "{\n"
            '  "trimmed_sentences": [\n'
            '    {"index": index_here, "text": "Shortened sentence here"}\n'
            '  ]\n'
            "}\n"
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


# ── Quick Test ─────────────────────────────────────────────────────────────


def main():
    """Quick test of the Gemini Agent."""
    print("=" * 60)
    print("  Gemini Agent via Antigravity-CLI Auth — Quick Test")
    print("=" * 60)

    # Create agent with storyteller persona
    agent = GeminiAgent(
        persona=(
            "You are a creative storyteller AI for Reelmation, "
            "a tool that generates social media reels. "
            "You write dramatic, cinematic short stories that work "
            "perfectly as 30-60 second narrated video reels. "
            "Always be vivid, concise, and end with impact."
        )
    )

    print(f"\n✅ Agent initialized")
    print(f"   Project: {agent.project}")
    print(f"   Endpoint: {agent.base_url}")
    print(f"   Persona: {agent.persona[:60]}...")

    # Test 1: Simple ask
    print("\n" + "─" * 60)
    print("Test 1: Simple ask")
    print("─" * 60)
    response = agent.ask("Write a 2-sentence horror story about an old mirror.")
    print(f"Response:\n{response}")

    # Test 2: Multi-turn (should remember context)
    print("\n" + "─" * 60)
    print("Test 2: Multi-turn follow-up")
    print("─" * 60)
    response2 = agent.ask("Now make it funny instead.")
    print(f"Response:\n{response2}")

    # Test 3: Story generation for reel
    print("\n" + "─" * 60)
    print("Test 3: Generate story for reel")
    print("─" * 60)
    agent.reset_history()  # Fresh context
    story = agent.generate_story("a time traveler stuck in a loop", "mysterious")
    print(f"Story:\n{story}")

    # Test 4: Image prompts
    print("\n" + "─" * 60)
    print("Test 4: Generate image prompts")
    print("─" * 60)
    prompts = agent.generate_image_prompts(story, num_scenes=3)
    for i, p in enumerate(prompts, 1):
        print(f"  Scene {i}: {p[:80]}...")

    print("\n" + "=" * 60)
    print("  All tests complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
