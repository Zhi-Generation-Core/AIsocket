import functools
import http.server
import json
import os
import socket
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"
DEFAULT_MODEL = "gemini-3.1-flash-lite-preview"


def resource_root() -> Path:
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


def log_message(message: str) -> None:
    try:
        log_path = Path(os.environ.get("TEMP", str(Path.home()))) / "socket_ai_designer_demo.log"
        with log_path.open("a", encoding="utf-8") as file:
            file.write(message + "\n")
    except OSError:
        pass


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def get_env_var(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    if value:
        return value
    if sys.platform.startswith("win"):
        try:
            import winreg

            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as key:
                value, _kind = winreg.QueryValueEx(key, name)
                return value or default
        except OSError:
            return default
    return default


class DemoRequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        try:
            log_message("HTTP " + (format % args))
        except Exception:
            pass

    def do_GET(self) -> None:
        if self.path == "/api/health":
            self.write_json(
                200,
                {
                    "ok": True,
                    "hasGeminiKey": bool(get_env_var("GEMINI_API_KEY")),
                    "model": get_env_var("GEMINI_MODEL", DEFAULT_MODEL),
                },
            )
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/gemini-refine":
            self.handle_gemini_refine()
            return
        self.send_error(404, "Unknown API route")

    def handle_gemini_refine(self) -> None:
        api_key = get_env_var("GEMINI_API_KEY")
        model = get_env_var("GEMINI_MODEL", DEFAULT_MODEL)
        if not api_key:
            self.write_json(
                500,
                {
                    "ok": False,
                    "error": "GEMINI_API_KEY is not set in the environment.",
                },
            )
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            result = call_gemini(api_key, model, payload)
            self.write_json(200, {"ok": True, "model": model, "result": result})
        except urllib.error.HTTPError as exc:
            message = exc.read().decode("utf-8", errors="replace")
            self.write_json(exc.code, {"ok": False, "model": model, "error": message})
        except Exception as exc:
            self.write_json(500, {"ok": False, "model": model, "error": str(exc)})

    def write_json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def call_gemini(api_key: str, model: str, payload: dict) -> dict:
    image_data_url = payload.get("imageDataUrl", "")
    image_base64 = ""
    if image_data_url.startswith("data:image/png;base64,"):
        image_base64 = image_data_url.split(",", 1)[1]

    prompt = build_refine_prompt(payload)
    parts = [{"text": prompt}]
    if image_base64:
        parts.append(
            {
                "inline_data": {
                    "mime_type": "image/png",
                    "data": image_base64,
                }
            }
        )

    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0.25,
            "responseMimeType": "application/json",
        },
    }
    url = f"{GEMINI_BASE_URL}/v1beta/models/{model}:generateContent"
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = json.loads(response.read().decode("utf-8"))

    text = (
        raw.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "{}")
    )
    return json.loads(clean_json_text(text))


def clean_json_text(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    return cleaned.strip()


def build_refine_prompt(payload: dict) -> str:
    summary = payload.get("summary", {})
    return f"""
You are the AI review module in a prosthetic socket design demo.
Review the algorithm-generated initial socket using the parameters, geometry summary,
semantic segmentation labels, and optional preview image. Return only structured JSON
for conservative parameter correction and a risk heatmap.

Rules:
- Output JSON only. No Markdown.
- Do not claim medical diagnosis. This is a classroom design demo.
- Keep corrections conservative; avoid changing the initial design dramatically.
- Heatmap coordinates use normalized socket coordinates: y is height ratio 0..1,
  theta is circumferential position 0..1, where theta=0 means anterior/front.
- Treat semanticSegmentation labels as model-side design evidence: bony prominence
  labels should usually increase local relief, posterior soft tissue can be a safer
  load-bearing area, and distal labels need conservative containment.
- Do not invent deformation millimeters directly for semantic regions. Instead, use
  clinicalRuleBase and return semanticWeights from 0.1 to 1.0. The local geometry
  script converts maxDeformationMm * weight into the final Gaussian deformation.
- Use patient context as an adjustment multiplier: higher activity levels usually
  need stronger stability and containment; heavier patients need more conservative
  pressure distribution; fleshy residual limbs need more volume allowance.
- Consider volumeConservation and versionDelta. If a previous version exists, make
  a calibrated change based on the delta instead of redesigning blindly.
- severity must be one of: high, medium, low.
- color must be one of: red, yellow, green.
- Use concise Chinese strings for label, reason, and clinicalNotes.

Current model summary:
{json.dumps(summary, ensure_ascii=False, indent=2)}

Return exactly this JSON shape:
{{
  "parameterCorrections": {{
    "offsetDeltaMm": number,
    "trimDeltaPercent": number,
    "reliefDeltaMm": number,
    "distalDeltaMm": number
  }},
  "riskZones": [
    {{
      "id": "anterior_tibia",
      "label": "前内侧胫骨",
      "severity": "high",
      "color": "red",
      "y": 0.52,
      "theta": 0.0,
      "radius": 0.16,
      "reason": "骨性突起附近压力集中，需要优先减压"
    }}
  ],
  "semanticWeights": {{
    "anterior_tibia": 0.7,
    "fibula_head": 0.6,
    "distal_end": 0.5,
    "posterior_soft_tissue": 0.4
  }},
  "clinicalNotes": [
    "一句简短、可解释的建议"
  ],
  "confidence": 0.0
}}
"""


def main() -> None:
    root = resource_root() / "app"
    if not (root / "src" / "index.html").exists():
        raise RuntimeError(f"Demo assets not found: {root}")

    port = find_free_port()
    handler = functools.partial(DemoRequestHandler, directory=str(root))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    server.daemon_threads = True

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    url = f"http://127.0.0.1:{port}/src/index.html"
    log_message("Socket AI Designer Demo started")
    log_message(url)
    webbrowser.open(url)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    try:
        os.chdir(resource_root())
        main()
    except Exception:
        log_message("Fatal startup error:")
        log_message(traceback.format_exc())
        raise
