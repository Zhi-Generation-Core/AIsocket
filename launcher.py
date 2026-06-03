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
import urllib.request
import webbrowser
from pathlib import Path


DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"
DEFAULT_MODEL = "gemini-3.1-flash-lite"


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


def parse_env_line(line: str) -> tuple[str, str] | None:
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    if line.lower().startswith("export "):
        line = line[7:].lstrip()
    if "=" not in line:
        return None
    key, value = line.split("=", 1)
    key = key.strip()
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        value = value[1:-1]
    return (key, value) if key else None


def find_env_file() -> Path | None:
    candidates = [
        resource_root() / ".env",
        Path.cwd() / ".env",
    ]
    if getattr(sys, "frozen", False):
        candidates.insert(0, Path(sys.executable).resolve().parent / ".env")
    if hasattr(sys, "_MEIPASS"):
        candidates.insert(0, Path(sys._MEIPASS) / ".env")

    seen: set[Path] = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if resolved in seen:
            continue
        seen.add(resolved)
        if candidate.is_file():
            return candidate
    return None


def load_env_file() -> None:
    env_path = find_env_file()
    if env_path is None:
        return

    loaded = 0
    try:
        with env_path.open("r", encoding="utf-8-sig") as file:
            for raw_line in file:
                parsed = parse_env_line(raw_line)
                if parsed is None:
                    continue
                key, value = parsed
                if os.environ.get(key) is None:
                    os.environ[key] = value
                    loaded += 1
    except OSError as exc:
        log_message(f"Failed to read .env: {exc}")
        return

    log_message(f"Loaded {loaded} variable(s) from {env_path}")


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


def normalize_model_name(model: str) -> str:
    return (model or DEFAULT_MODEL).strip().removeprefix("models/")


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
                    "model": normalize_model_name(get_env_var("GEMINI_MODEL", DEFAULT_MODEL)),
                    "baseUrl": get_env_var("GEMINI_BASE_URL", DEFAULT_GEMINI_BASE_URL),
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
        model = normalize_model_name(get_env_var("GEMINI_MODEL", DEFAULT_MODEL))
        if not api_key:
            self.write_json(500, {"ok": False, "error": "GEMINI_API_KEY is not set in .env."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            result = call_gemini(api_key, model, payload)
            self.write_json(200, {"ok": True, "model": model, "result": result})
        except urllib.error.HTTPError as exc:
            error_text = exc.read().decode("utf-8", errors="replace")
            self.write_json(exc.code, {"ok": False, "model": model, "error": format_gemini_error(exc.code, error_text)})
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
    parts = [{"text": build_refine_prompt(payload)}]
    if image_data_url.startswith("data:image/png;base64,"):
        parts.append(
            {
                "inline_data": {
                    "mime_type": "image/png",
                    "data": image_data_url.split(",", 1)[1],
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
    base_url = get_env_var("GEMINI_BASE_URL", DEFAULT_GEMINI_BASE_URL).rstrip("/")
    url = f"{base_url}/v1beta/models/{model}:generateContent"
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    proxy_server = get_env_var("GEMINI_PROXY_SERVER")
    opener = urllib.request.build_opener()
    if proxy_server:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": proxy_server, "https": proxy_server})
        )

    with opener.open(request, timeout=45) as response:
        raw = json.loads(response.read().decode("utf-8"))

    text = raw.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "{}")
    return json.loads(clean_json_text(text))


def format_gemini_error(status: int, raw_text: str) -> str:
    try:
        payload = json.loads(raw_text)
        message = payload.get("error", {}).get("message") or raw_text
    except json.JSONDecodeError:
        message = raw_text or "empty response"
    return f"Gemini HTTP {status}: {message}"


def clean_json_text(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


def build_refine_prompt(payload: dict) -> str:
    summary = payload.get("summary", {})
    return f"""
You are the AI review module in a prosthetic socket design demo.
Review the algorithm-generated initial socket using the parameters, geometry summary,
semantic segmentation labels, and optional preview image. Return only structured JSON.

Rules:
- Output JSON only. No Markdown.
- Do not claim medical diagnosis. This is a classroom design demo.
- Keep corrections conservative; avoid changing the initial design dramatically.
- Treat semanticSegmentation labels as model-side design evidence.
- Use semanticWeights from 0.1 to 1.0 rather than direct deformation values.
- Use concise Chinese strings for clinicalNotes.

Current model summary:
{json.dumps(summary, ensure_ascii=False, indent=2)}

Return exactly this JSON shape:
{{
  "parameterCorrections": {{
    "offsetDeltaMm": 0,
    "trimDeltaPercent": 0,
    "reliefDeltaMm": 0,
    "distalDeltaMm": 0
  }},
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
    load_env_file()
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
    log_message("Socket AI Designer Demo launcher started")
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
