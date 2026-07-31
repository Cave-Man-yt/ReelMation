import json
import os
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict

class GeminiClient:
    """
    Base client for interacting with Gemini models via Cloud Code Platform API.
    Handles authentication, rate limiting, and raw conversation flow.
    """
    ENDPOINT_DAILY = "https://daily-cloudcode-pa.googleapis.com"
    ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com"
    
    PATH_GENERATE_CHAT = "/v1internal:generateChat"
    PATH_LOAD_CODE_ASSIST = "/v1internal:loadCodeAssist"
    
    TOKEN_FILE_CLI = os.path.expanduser("~/.gemini/antigravity-cli/antigravity-oauth-token")
    
    AUTHOR_USER = "USER"
    AUTHOR_SYSTEM = "SYSTEM"

    def __init__(
        self,
        persona: Optional[str] = None,
        project: Optional[str] = None,
        tier_id: str = "standard-tier",
        endpoint: str = "prod",
        max_retries: int = 3,
        retry_delay: float = 5.0,
    ):
        self.persona = persona
        self.project = project
        self.tier_id = tier_id
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.base_url = self.ENDPOINT_DAILY if endpoint == "daily" else self.ENDPOINT_PROD
        
        self._history: List[Dict[str, str]] = []
        self._access_token: Optional[str] = None
        self._token_expiry: Optional[datetime] = None
        
        self._load_token()
        if not self.project:
            self._discover_project()
            
        if self.persona:
            self._apply_persona()

    def _load_token(self):
        token_path = Path(self.TOKEN_FILE_CLI)
        if not token_path.exists():
            raise FileNotFoundError(f"Auth token missing at {self.TOKEN_FILE_CLI}. Run CLI login first.")
            
        with open(token_path) as f:
            data = json.load(f)
            
        token_data = data["token"]
        self._access_token = token_data["access_token"]
        
        expiry_str = token_data.get("expiry", "")
        if expiry_str:
            import re
            expiry_clean = re.sub(r"\.\d+", "", expiry_str)
            try:
                self._token_expiry = datetime.fromisoformat(expiry_clean)
            except ValueError:
                self._token_expiry = None

    def _is_token_valid(self) -> bool:
        if not self._access_token: return False
        if not self._token_expiry: return True
        now = datetime.now(self._token_expiry.tzinfo)
        return (self._token_expiry - now).total_seconds() > 60

    def _ensure_token(self):
        if not self._is_token_valid():
            self._load_token()
            if not self._is_token_valid():
                raise RuntimeError("Token is expired. Refresh authentication.")

    def _discover_project(self):
        for env_var in ["GEMINI_PROJECT", "GOOGLE_CLOUD_PROJECT", "GCP_PROJECT"]:
            val = os.environ.get(env_var, "").strip()
            if val:
                self.project = val
                return
        try:
            result = self._api_call(self.PATH_LOAD_CODE_ASSIST, {})
            self.project = result.get("cloudaicompanionProject", "")
            if not self.project:
                raise ValueError("No project found via API")
        except Exception as e:
            # Fallback to the known working project if API discovery fails
            self.project = "sustained-flare-xhpd3"

    def _apply_persona(self):
        if self.persona:
            self._history = [
                {"author": self.AUTHOR_USER, "content": self.persona},
                {"author": self.AUTHOR_SYSTEM, "content": "Understood. I will follow these instructions precisely."},
            ]

    def _api_call(self, path: str, payload: dict) -> dict:
        self._ensure_token()
        url = self.base_url + path
        data = json.dumps(payload).encode("utf-8")
        
        for attempt in range(self.max_retries + 1):
            req = urllib.request.Request(
                url, data=data, method="POST",
                headers={
                    "Authorization": f"Bearer {self._access_token}",
                    "Content-Type": "application/json",
                }
            )
            try:
                with urllib.request.urlopen(req, timeout=30.0) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < self.max_retries:
                    time.sleep(self.retry_delay * (2**attempt))
                    continue
                elif e.code == 401:
                    self._load_token()
                    continue
                raise RuntimeError(f"API error {e.code}: {e.read().decode('utf-8', errors='replace')}")
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt < self.max_retries:
                    time.sleep(self.retry_delay * (2**attempt))
                    continue
                raise RuntimeError(f"Network error: {e}")
        raise RuntimeError("Max retries exceeded")

    def ask(self, message: str) -> str:
        modified_message = message + "\n\nCRITICAL: Do NOT use any internal reasoning or thinking blocks. You MUST output the JSON response immediately and directly to avoid hitting the token limit. Do NOT output any conversational text."
        payload = {"userMessage": modified_message, "project": self.project, "tierId": self.tier_id}
        if self._history:
            payload["history"] = self._history
            
        result = self._api_call(self.PATH_GENERATE_CHAT, payload)
        response_text = result.get("markdown", "")
        
        self._history.append({"author": self.AUTHOR_USER, "content": message})
        self._history.append({"author": self.AUTHOR_SYSTEM, "content": response_text})
        return response_text

    def ask_once(self, message: str) -> str:
        history = []
        if self.persona:
            history = [
                {"author": self.AUTHOR_USER, "content": self.persona},
                {"author": self.AUTHOR_SYSTEM, "content": "Understood. I will follow these instructions precisely."},
            ]
            
        modified_message = message + "\n\nCRITICAL: Do NOT use any internal reasoning or thinking blocks. You MUST output the JSON response immediately and directly to avoid hitting the token limit. Do NOT output any conversational text."
        payload = {"userMessage": modified_message, "project": self.project, "tierId": self.tier_id}
        if history:
            payload["history"] = history
            
        result = self._api_call(self.PATH_GENERATE_CHAT, payload)
        return result.get("markdown", "")

    def reset_history(self):
        self._history = []
        if self.persona:
            self._apply_persona()
