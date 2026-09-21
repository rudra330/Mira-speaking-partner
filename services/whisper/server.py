"""Private, memory-only speech transcription service for Mira."""
import asyncio
import hmac
import io
import os
import wave
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from faster_whisper import WhisperModel
from starlette.concurrency import run_in_threadpool

MAX_BYTES = 640_044  # At most 20 seconds of mono 16 kHz PCM16 WAV.
model = None
inference_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app):
    global model
    if len(os.environ.get("WHISPER_SERVICE_TOKEN", "")) < 32:
        raise RuntimeError("Set a WHISPER_SERVICE_TOKEN of at least 32 characters.")
    model = await run_in_threadpool(
        WhisperModel,
        os.environ.get("WHISPER_MODEL", "small"),
        device=os.environ.get("WHISPER_DEVICE", "cpu"),
        compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
        cpu_threads=int(os.environ.get("WHISPER_THREADS", "4")),
        download_root=os.environ.get("WHISPER_MODEL_DIR", "/models"),
    )
    yield
    model = None


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


def decode_wav(content: bytes):
    try:
        with wave.open(io.BytesIO(content), "rb") as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 16000, "NONE"):
                raise ValueError("Expected mono 16 kHz PCM16 WAV")
            frames = audio.getnframes()
            if not 3200 <= frames <= 320000:
                raise ValueError("Audio must be between 0.2 and 20 seconds")
            raw = audio.readframes(frames)
            if len(raw) != frames * 2:
                raise ValueError("Incomplete audio")
        return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    except (wave.Error, EOFError, ValueError) as error:
        raise HTTPException(400, "Send a complete mono 16 kHz PCM16 WAV, up to 20 seconds.") from error


def transcribe(samples, language):
    segments, info = model.transcribe(
        samples, language=None if language == "auto" else language,
        beam_size=1, condition_on_previous_text=False,
        vad_filter=True, vad_parameters={"min_speech_duration_ms": 200, "min_silence_duration_ms": 350},
        no_speech_threshold=0.6,
    )
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()
    return {"text": text, "language": info.language, "engine": "faster-whisper"}


@app.get("/health")
async def health():
    if model is None:
        raise HTTPException(503, "Model is loading")
    return {"ready": True, "engine": "faster-whisper"}


@app.post("/transcribe")
async def transcription(request: Request, language: str = "auto"):
    expected = os.environ.get("WHISPER_SERVICE_TOKEN", "")
    if not expected or not hmac.compare_digest(request.headers.get("authorization", ""), "Bearer " + expected):
        raise HTTPException(401, "Unauthorized")
    if language not in ("auto", "en", "bn"):
        raise HTTPException(400, "Unsupported language")
    if request.headers.get("content-type", "").split(";")[0] != "audio/wav":
        raise HTTPException(415, "Expected audio/wav")
    content = bytearray()
    async for chunk in request.stream():
        if len(content) + len(chunk) > MAX_BYTES:
            raise HTTPException(413, "Recording is too long")
        content.extend(chunk)
    samples = decode_wav(bytes(content))
    del content
    if model is None:
        raise HTTPException(503, "Model is loading")
    try:
        await asyncio.wait_for(inference_lock.acquire(), timeout=2)
    except TimeoutError:
        raise HTTPException(429, "Transcription is busy. Please try again.")
    try:
        return await run_in_threadpool(transcribe, samples, language)
    finally:
        inference_lock.release()
