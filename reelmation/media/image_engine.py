import json
import os
import random
import time
import urllib.request
import urllib.parse
import websocket
import uuid
from typing import Optional

class ImageEngine:
    """Text-to-Image engine using a local ComfyUI instance."""
    
    def __init__(self, server_address: str = "127.0.0.1:8188", timeout: int = 90):
        self.server = server_address
        self.client_id = str(uuid.uuid4())
        self.timeout = timeout
        self.default_workflow = os.path.join(os.path.dirname(__file__), "..", "..", "Z-image-T2I.json")

    def check_alive(self) -> bool:
        """Check if ComfyUI server is reachable."""
        try:
            req = urllib.request.Request(f"http://{self.server}/system_stats")
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status == 200
        except Exception:
            return False

    def _queue_prompt(self, prompt: dict) -> dict:
        p = {"prompt": prompt, "client_id": self.client_id}
        data = json.dumps(p).encode("utf-8")
        req = urllib.request.Request(f"http://{self.server}/prompt", data=data)
        return json.loads(urllib.request.urlopen(req).read())

    def _get_image(self, filename: str, subfolder: str, folder_type: str) -> bytes:
        data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        url_values = urllib.parse.urlencode(data)
        with urllib.request.urlopen(f"http://{self.server}/view?{url_values}") as response:
            return response.read()

    def _wait_for_image(self, prompt_id: str) -> Optional[dict]:
        ws = websocket.WebSocket()
        try:
            ws.connect(f"ws://{self.server}/ws?clientId={self.client_id}")
            ws.settimeout(self.timeout)
        except Exception as e:
            print(f"     ❌ WebSocket connection failed: {e}")
            return None

        start_time = time.time()
        try:
            while True:
                elapsed = time.time() - start_time
                if elapsed > self.timeout:
                    print(f"     ❌ Timeout after {self.timeout}s")
                    ws.close()
                    return None

                try:
                    out = ws.recv()
                except websocket.WebSocketTimeoutException:
                    ws.close()
                    return None

                if isinstance(out, str):
                    message = json.loads(out)
                    msg_type = message.get("type", "")

                    if msg_type == "executed":
                        data = message.get("data", {})
                        if data.get("prompt_id") == prompt_id:
                            ws.close()
                            return data.get("output")
                            
                    elif msg_type == "execution_error":
                        data = message.get("data", {})
                        if data.get("prompt_id") == prompt_id:
                            ws.close()
                            return None
        except Exception:
            ws.close()
            return None

    def generate(self, prompt: str, output_path: str, workflow_path: Optional[str] = None) -> Optional[str]:
        if not self.check_alive():
            print(f"  ❌ ComfyUI server not reachable at {self.server}")
            return None

        wp = workflow_path or self.default_workflow
        try:
            with open(wp, "r") as f:
                workflow = json.load(f)
        except FileNotFoundError:
            print(f"  ❌ Workflow file not found: {wp}")
            return None

        workflow["15"]["inputs"]["text"] = prompt
        workflow["13"]["inputs"]["noise_seed"] = random.randint(1, 100_000_000_000_000)

        try:
            response = self._queue_prompt(workflow)
            prompt_id = response["prompt_id"]
        except Exception as e:
            return None

        output_data = self._wait_for_image(prompt_id)
        if not output_data: return None

        try:
            for node_id, node_output in output_data.items():
                if isinstance(node_output, list) and len(node_output) > 0:
                    image_info = node_output[0]
                    image_data = self._get_image(
                        image_info["filename"],
                        image_info.get("subfolder", ""),
                        image_info.get("type", "output")
                    )

                    out_dir = os.path.dirname(os.path.abspath(output_path))
                    os.makedirs(out_dir, exist_ok=True)

                    with open(output_path, "wb") as f:
                        f.write(image_data)
                    return output_path
        except Exception:
            return None

        return None
