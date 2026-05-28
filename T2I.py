"""
Text-to-Image via ComfyUI for Reelmation
=========================================
Sends image generation prompts to a local ComfyUI server and retrieves
the generated images.

Requires ComfyUI running at 127.0.0.1:8188.

Usage:
    from T2I import T2Igen
    output = T2Igen("a cinematic shot of a sunset", output_path="scene_001.png")
"""

import json
import os
import random
import time
import urllib.request
import urllib.parse
import websocket
import uuid
from typing import Optional


# ── Configuration ──────────────────────────────────────────────────────────
SERVER_ADDRESS = "127.0.0.1:8188"
CLIENT_ID = str(uuid.uuid4())
DEFAULT_WORKFLOW = os.path.join(os.path.dirname(__file__), "Z-image-T2I.json")
IMAGE_TIMEOUT_SECONDS = 90


# ── ComfyUI API Helpers ───────────────────────────────────────────────────

def queue_prompt(prompt: dict, server: str = SERVER_ADDRESS) -> dict:
    """Queue a workflow prompt on ComfyUI."""
    p = {"prompt": prompt, "client_id": CLIENT_ID}
    data = json.dumps(p).encode("utf-8")
    req = urllib.request.Request(f"http://{server}/prompt", data=data)
    return json.loads(urllib.request.urlopen(req).read())


def get_image(
    filename: str,
    subfolder: str,
    folder_type: str,
    server: str = SERVER_ADDRESS,
) -> bytes:
    """Download a generated image from ComfyUI."""
    data = {"filename": filename, "subfolder": subfolder, "type": folder_type}
    url_values = urllib.parse.urlencode(data)
    with urllib.request.urlopen(
        f"http://{server}/view?{url_values}"
    ) as response:
        return response.read()


def check_comfyui_alive(server: str = SERVER_ADDRESS) -> bool:
    """Check if ComfyUI server is reachable."""
    try:
        req = urllib.request.Request(f"http://{server}/system_stats")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


def wait_for_image(
    prompt_id: str,
    server: str = SERVER_ADDRESS,
    timeout: int = IMAGE_TIMEOUT_SECONDS,
) -> Optional[dict]:
    """
    Wait for ComfyUI to finish generating an image.
    Polls via WebSocket with timeout and progress logging.

    Returns:
        Output data dict on success, None on failure/timeout.
    """
    ws = websocket.WebSocket()
    try:
        ws.connect(f"ws://{server}/ws?clientId={CLIENT_ID}")
        ws.settimeout(timeout)
    except Exception as e:
        print(f"     ❌ WebSocket connection failed: {e}")
        return None

    start_time = time.time()
    print(f"     ⏳ Waiting for generation (timeout: {timeout}s)...")

    try:
        while True:
            elapsed = time.time() - start_time
            if elapsed > timeout:
                print(f"     ❌ Timeout after {timeout}s")
                ws.close()
                return None

            try:
                out = ws.recv()
            except websocket.WebSocketTimeoutException:
                print(f"     ❌ WebSocket timeout after {timeout}s")
                ws.close()
                return None

            if isinstance(out, str):
                message = json.loads(out)
                msg_type = message.get("type", "")

                # Track progress
                if msg_type == "progress":
                    data = message.get("data", {})
                    value = data.get("value", 0)
                    maximum = data.get("max", 0)
                    if maximum > 0:
                        pct = int(value / maximum * 100)
                        print(
                            f"     ⚙️  Step {value}/{maximum} ({pct}%)",
                            end="\r",
                        )

                # Check for execution errors
                elif msg_type == "execution_error":
                    data = message.get("data", {})
                    if data.get("prompt_id") == prompt_id:
                        error_msg = data.get("exception_message", "Unknown")
                        node = data.get("node_type", "?")
                        print(f"\n     ❌ ComfyUI error in {node}: {error_msg}")
                        ws.close()
                        return None

                # Check for completion
                elif msg_type == "executed":
                    data = message.get("data", {})
                    if data.get("prompt_id") == prompt_id:
                        print(f"\n     ✅ Generation complete ({elapsed:.1f}s)")
                        ws.close()
                        return data.get("output")

                # Check for execution_cached (already generated)
                elif msg_type == "execution_cached":
                    data = message.get("data", {})
                    if prompt_id in data.get("nodes", []):
                        print(f"\n     ✅ Using cached result ({elapsed:.1f}s)")
                        ws.close()
                        return data.get("output", {})

    except Exception as e:
        print(f"\n     ❌ WebSocket error: {e}")
        ws.close()
        return None


# ── Main Generation Function ──────────────────────────────────────────────

def T2Igen(
    prompt: str,
    output_path: Optional[str] = None,
    workflow_path: str = DEFAULT_WORKFLOW,
    server: str = SERVER_ADDRESS,
    timeout: int = IMAGE_TIMEOUT_SECONDS,
) -> Optional[str]:
    """
    Generate an image from a text prompt using ComfyUI.

    Args:
        prompt: The text prompt for image generation.
        output_path: Where to save the generated image. If None, auto-names.
        workflow_path: Path to the ComfyUI workflow JSON.
        server: ComfyUI server address.
        timeout: Max seconds to wait for generation.

    Returns:
        Path to the saved image file on success, None on failure.
    """
    # Check ComfyUI is alive
    if not check_comfyui_alive(server):
        print(f"  ❌ ComfyUI server not reachable at {server}")
        return None

    # Load workflow
    try:
        with open(workflow_path, "r") as f:
            workflow = json.load(f)
    except FileNotFoundError:
        print(f"  ❌ Workflow file not found: {workflow_path}")
        return None

    # Set the prompt text (node 15 = CLIPTextEncode)
    workflow["15"]["inputs"]["text"] = prompt

    # Randomize seed (node 13 = KSamplerAdvanced)
    workflow["13"]["inputs"]["noise_seed"] = random.randint(1, 100_000_000_000_000)

    # Queue the prompt
    try:
        response = queue_prompt(workflow, server)
        prompt_id = response["prompt_id"]
    except Exception as e:
        print(f"  ❌ Failed to queue prompt: {e}")
        return None

    # Wait for completion
    output_data = wait_for_image(prompt_id, server, timeout)
    if output_data is None:
        return None

    # Download and save the image
    try:
        for node_id, node_output in output_data.items():
            if isinstance(node_output, list) and len(node_output) > 0:
                image_info = node_output[0]
                image_data = get_image(
                    image_info["filename"],
                    image_info.get("subfolder", ""),
                    image_info.get("type", "output"),
                    server,
                )

                # Determine output path
                if output_path is None:
                    output_path = f"output_{image_info['filename']}"

                # Ensure output directory exists
                out_dir = os.path.dirname(os.path.abspath(output_path))
                os.makedirs(out_dir, exist_ok=True)

                with open(output_path, "wb") as f:
                    f.write(image_data)

                size_kb = len(image_data) / 1024
                print(f"     💾 Saved: {output_path} ({size_kb:.0f} KB)")
                return output_path

    except Exception as e:
        print(f"  ❌ Failed to download/save image: {e}")
        return None

    print(f"  ❌ No image data in ComfyUI output")
    return None
