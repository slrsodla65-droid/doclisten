#!/usr/bin/env python3
import asyncio
import hashlib
import json
import os
import re
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".tts_cache"
CACHE.mkdir(exist_ok=True)

KOREAN_VOICES = [
    {"ShortName": "gtts-ko-human", "Locale": "ko-KR", "FriendlyName": "Google 자연 낭독"},
    {"ShortName": "gtts-ko", "Locale": "ko-KR", "FriendlyName": "Google 한국어"},
    {"ShortName": "ko-KR-HyunsuMultilingualNeural", "Locale": "ko-KR", "FriendlyName": "Hyunsu 남성"},
    {"ShortName": "ko-KR-InJoonNeural", "Locale": "ko-KR", "FriendlyName": "InJoon 남성"},
    {"ShortName": "ko-KR-SunHiNeural", "Locale": "ko-KR", "FriendlyName": "SunHi 여성"},
]
KOREAN_VOICE_NAMES = {v["ShortName"] for v in KOREAN_VOICES}
CACHE_VERSION = "multilingual-reading-v1"
RATE_MAP = {"0.8": "-20%", "1": "+0%", "1.0": "+0%", "1.2": "+20%", "1.5": "+50%"}

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/voices":
            return self.send_json({"voices": KOREAN_VOICES})
        if path == "/api/config":
            return self.send_json(get_public_config())
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/tts":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            text = str(payload.get("text", "")).strip()
            voice = str(payload.get("voice", "ko-KR-SunHiNeural"))
            rate = str(payload.get("rate", "1"))
            if not text:
                self.send_error(400, "text required")
                return
            if voice not in KOREAN_VOICE_NAMES:
                self.send_error(400, f"unsupported Korean voice: {voice}")
                return
            audio_text = normalize_tts_pronunciation(text[:1800])
            audio_path = synthesize_cached(audio_text, voice, rate)
            data = audio_path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("X-TTS-Voice", voice)
            self.send_header("X-TTS-Locale", "ko-KR")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "public, max-age=31536000")
            self.end_headers()
            self.wfile.write(data)
        except Exception as exc:
            self.send_error(500, str(exc))

    def send_json(self, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def safe_public_url(value: str) -> str:
    url = str(value or "").strip()
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        return ""
    return url


def get_public_config() -> dict:
    payment_url = safe_public_url(os.environ.get("DOC_LISTEN_PAYMENT_URL", ""))
    return {
        "paymentProvider": os.environ.get("DOC_LISTEN_PAYMENT_PROVIDER", "toss-payments"),
        "paymentUrl": payment_url,
        "betaPriceLabel": os.environ.get("DOC_LISTEN_BETA_PRICE_LABEL", "월 4,900원 베타 후보"),
        "freeDailyLimit": int(os.environ.get("DOC_LISTEN_FREE_DAILY_LIMIT", "20")),
    }


def transform_to_reading_script(text: str) -> str:
    """문서용 PDF 문장을 TTS가 더 사람처럼 설명하도록 읽기용 문장으로 바꾼다.

    화면에 보이는 PDF 원문은 건드리지 않고, 음성 생성 입력에만 적용한다.
    """
    spoken = re.sub(r"\s+", " ", text).strip()
    if not spoken:
        return ""

    # 문서식 나열 문장을 말로 설명하는 문장으로 변환한다.
    plan_match = re.fullmatch(
        r"가격\s*정책\s*및\s*회원\s*플랜\s*설계는\s*무료\s*체험,\s*베이직,\s*프로,\s*엔터프라이즈\s*플랜으로\s*구성한다\. ?",
        spoken,
    )
    if plan_match:
        return " ".join([
            "가격 정책과 회원 플랜은, 크게 네 가지로 나눌 수 있습니다.",
            "먼저 무료 체험.",
            "그다음 베이직.",
            "그리고 프로.",
            "마지막으로 엔터프라이즈 플랜입니다.",
        ])

    # 긴 사업 설명 문장은 연결어를 넣어 리듬을 만든다.
    spoken = re.sub(
        r"단계별\s*사업\s*확장\s*전략은\s*초기\s*고객\s*확보와\s*유료\s*전환율\s*검증\s*이후\s*본격적으로\s*시장(?:을|을\s*)\s*넓히는\s*방식입니다\.",
        "단계별 사업 확장 전략은, 먼저 초기 고객 확보와 그다음 유료 전환율 검증 이후 본격적으로 시장을 넓히는 방식입니다.",
        spoken,
    )

    # 자주 나오는 문서 표현 앞에는 약한 쉼표를 넣어 한 덩어리로 밀어 읽지 않게 한다.
    spoken = re.sub(r"\s+(먼저|그리고|하지만|다만|즉|예를 들어|그다음|마지막으로)\s+", r", \1 ", spoken)
    spoken = re.sub(r"\s+(이후|뒤)\s+", r" \1, ", spoken)
    return re.sub(r"\s+", " ", spoken).strip()


def normalize_tts_pronunciation(text: str) -> str:
    normalized = transform_to_reading_script(text)
    # TTS가 `사업확장`을 `싸업확장`처럼 뭉개 읽는 것을 줄이기 위한 음성 전용 보정.
    normalized = re.sub(r"사업\s*(확장|계획|모델|전략|구조|운영|부문|단계|화|성장)", r"사업 \1", normalized)
    normalized = re.sub(r"단계별\s*사업\s*확장", "단계별 사업 확장", normalized)
    normalized = re.sub(r"([가-힣])\s+([.,!?])", r"\1\2", normalized)
    return normalized


def synthesize_cached(text: str, voice: str, rate: str) -> Path:
    safe_rate = RATE_MAP.get(rate, "+0%")
    key = hashlib.sha256(json.dumps({"version": CACHE_VERSION, "text": text, "voice": voice, "rate": safe_rate}, ensure_ascii=False).encode()).hexdigest()
    out = CACHE / f"{key}.mp3"
    if out.exists() and out.stat().st_size > 0:
        return out
    if voice == "gtts-ko-human":
        synthesize_gtts_human(text, out)
    elif voice == "gtts-ko":
        synthesize_gtts(text, out)
    else:
        asyncio.run(synthesize_edge(text, voice, safe_rate, out))
    return out


def split_multilingual_tts_segments(text: str) -> list[tuple[str, str]]:
    """한국어 TTS가 영어를 억지로 읽지 않도록 영어 구간을 분리한다."""
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []

    english_pattern = re.compile(r"[A-Za-z][A-Za-z0-9&+./:#%_-]*(?:\s+[A-Za-z][A-Za-z0-9&+./:#%_-]*)*[.!?]?")
    segments: list[tuple[str, str]] = []
    cursor = 0
    for match in english_pattern.finditer(normalized):
        start, end = match.span()
        if start > cursor:
            ko = normalized[cursor:start].strip()
            if ko:
                segments.append(("ko", ko))
        en = match.group(0).strip()
        if en:
            segments.append(("en", en))
        cursor = end
    if cursor < len(normalized):
        ko = normalized[cursor:].strip()
        if ko:
            segments.append(("ko", ko))

    merged: list[tuple[str, str]] = []
    for lang, part in segments:
        if merged and merged[-1][0] == lang:
            merged[-1] = (lang, f"{merged[-1][1]} {part}".strip())
        else:
            merged.append((lang, part))
    return merged or [("ko", normalized)]


def split_for_human_reading(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    marked = re.sub(r"(다\.|요\.|니다\.|[.!?。！？])\s+", r"\1<break>", normalized)
    pieces = marked.split("<break>")
    chunks: list[str] = []
    for piece in pieces:
        piece = piece.strip()
        if not piece:
            continue
        if len(piece) <= 70:
            chunks.append(piece)
            continue
        clause_parts = re.split(r"(?<=[,，;；:：])\s+|(?<=며)\s+|(?<=고)\s+|(?<=지만)\s+|(?<=으며)\s+", piece)
        current = ""
        for part in clause_parts:
            part = part.strip()
            if not part:
                continue
            if current and len(current) + len(part) > 75:
                chunks.append(current.strip())
                current = part
            else:
                current = f"{current} {part}".strip()
        if current:
            chunks.append(current.strip())
    return chunks or [normalized]


def make_silence_mp3(path: Path, ms: int):
    seconds = max(0.08, ms / 1000)
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
        "-t", f"{seconds:.3f}", "-q:a", "9", "-acodec", "libmp3lame", str(path)
    ], check=True)


def concat_mp3(files: list[Path], out: Path):
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".txt", delete=False) as f:
        list_path = Path(f.name)
        for file in files:
            f.write(f"file '{file.as_posix()}'\n")
    try:
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-f", "concat", "-safe", "0", "-i", str(list_path),
            "-ar", "24000", "-ac", "1", "-b:a", "64k", str(out)
        ], check=True)
    finally:
        list_path.unlink(missing_ok=True)


def synthesize_gtts_human(text: str, out: Path):
    from gtts import gTTS
    chunks = split_for_human_reading(text)
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        files: list[Path] = []
        serial = 0
        for i, chunk in enumerate(chunks):
            for lang, segment in split_multilingual_tts_segments(chunk):
                chunk_path = tmpdir / f"chunk_{serial:03d}_{lang}.mp3"
                gTTS(text=segment, lang=lang).save(str(chunk_path))
                files.append(chunk_path)
                serial += 1
            if i < len(chunks) - 1:
                pause_ms = 520 if re.search(r"[.!?。！？]$|다\.$|요\.$|니다\.$", chunk) else 280
                silence_path = tmpdir / f"silence_{i:03d}.mp3"
                make_silence_mp3(silence_path, pause_ms)
                files.append(silence_path)
        concat_mp3(files, out)


def synthesize_gtts(text: str, out: Path):
    from gtts import gTTS
    gTTS(text=text, lang="ko").save(str(out))

async def synthesize_edge(text: str, voice: str, rate: str, out: Path):
    import edge_tts
    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    await communicate.save(str(out))


def main():
    port = int(os.environ.get("PORT", "4173"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Serving PDF listener on http://0.0.0.0:{port}", flush=True)
    server.serve_forever()

if __name__ == "__main__":
    main()
