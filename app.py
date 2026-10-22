import os
import json
import base64
import asyncio
import logging
from typing import List, Dict, Any, Optional

import httpx
import websockets
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, HTMLResponse
from dotenv import load_dotenv

from prompt import get_system_prompt, OPENING_GREETING
from tools import TOOL_DEFINITIONS, execute_tool, get_active_tools

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("voice_agent")

# Configuration
PORT = int(os.getenv("PORT", "8000"))
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
LFM_BASE_URL = os.getenv("LFM_BASE_URL", "http://localhost:8000/v1")
LFM_API_KEY = os.getenv("LFM_API_KEY", "EMPTY")
LFM_MODEL = os.getenv("LFM_MODEL", "liquid-lfm-40b")

FALLBACK_BASE_URL = os.getenv("FALLBACK_BASE_URL", "")
FALLBACK_API_KEY = os.getenv("FALLBACK_API_KEY", "")
FALLBACK_MODEL = os.getenv("FALLBACK_MODEL", "")

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")

# Context window limit: keeps last N conversation turns to prevent context explosion on VPS
MAX_HISTORY_MESSAGES = int(os.getenv("MAX_HISTORY_MESSAGES", "14"))

app = FastAPI(title="Liquid AI Twilio Voice Agent")

@app.get("/")
def health_check():
    return {"status": "ok", "agent": "Hannah - Happy Harmony Clinic", "lfm_model": LFM_MODEL}

@app.get("/simulator", response_class=HTMLResponse)
async def get_simulator():
    """Serves the interactive Web Voice Simulator."""
    sim_path = os.path.join(os.path.dirname(__file__), "simulator.html")
    if os.path.exists(sim_path):
        with open(sim_path, "r", encoding="utf-8") as f:
            return f.read()
    return "<h3>Simulator file not found</h3>"

@app.post("/api/simulate-voice")
async def api_simulate_voice(request: Request):
    """Processes simulated speech, executes tools, measures latency, and returns Aura TTS audio."""
    import time
    body = await request.json()
    user_text = body.get("text", "")
    history = body.get("messages", [])

    messages = [{"role": "system", "content": get_system_prompt()}]
    for m in history:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            messages.append({"role": m["role"], "content": m["content"]})
    messages[0]["content"] = get_system_prompt(messages=messages)

    tools_executed = []
    total_tool_ms = 0
    total_llm_ms = 0

    while True:
        t_llm = time.time()
        ai_msg = await query_brain(messages)
        total_llm_ms += int((time.time() - t_llm) * 1000)
        messages.append(ai_msg)

        tool_calls = ai_msg.get("tool_calls")
        if not tool_calls:
            reply = ai_msg.get("content", "").strip()
            import re
            reply = re.sub(r'^(Hannah|Assistant):\s*', '', reply, flags=re.IGNORECASE)
            reply = re.sub(r'\[.*?\]', '', reply).strip()

            audio_b64 = None
            if DEEPGRAM_API_KEY and reply:
                try:
                    tts_url = "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mp3"
                    headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}", "Content-Type": "application/json"}
                    async with httpx.AsyncClient(timeout=8.0) as client:
                        resp = await client.post(tts_url, headers=headers, json={"text": reply})
                        if resp.status_code == 200:
                            audio_b64 = base64.b64encode(resp.content).decode("utf-8")
                except Exception as e:
                    logger.warning("Deepgram Aura TTS error: %s", e)

            return {
                "reply": reply,
                "audio_base64": audio_b64,
                "llm_ms": total_llm_ms,
                "tool_ms": total_tool_ms,
                "tools_executed": tools_executed
            }

        for tool in tool_calls:
            fn = tool.get("function", {})
            fn_name = fn.get("name")
            try:
                fn_args = json.loads(fn.get("arguments", "{}"))
            except Exception:
                fn_args = {}

            t_t = time.time()
            result = execute_tool(fn_name, fn_args)
            total_tool_ms += int((time.time() - t_t) * 1000)
            tools_executed.append({"name": fn_name, "args": fn_args, "result": result})

            messages.append({
                "role": "tool",
                "tool_call_id": tool.get("id", "call_1"),
                "name": fn_name,
                "content": json.dumps(result)
            })

@app.post("/incoming-call")
async def incoming_call(request: Request):
    """Twilio Voice Webhook: Instructs Twilio to open a bidirectional Media Stream."""
    host = request.headers.get("host", "localhost")
    ws_protocol = "wss" if request.url.scheme == "https" or "ngrok" in host else "ws"
    stream_url = f"{ws_protocol}://{host}/media-stream"

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Response>\n'
        '  <Connect>\n'
        f'    <Stream url="{stream_url}" />\n'
        '  </Connect>\n'
        '</Response>'
    )
    return Response(content=twiml, media_type="application/xml")

async def send_tts_audio(websocket: WebSocket, stream_sid: str, text: str):
    """Converts text to mulaw 8000Hz audio via Deepgram Aura TTS and streams to Twilio."""
    if not text.strip():
        return
    logger.info("TTS generating: %s", text)
    tts_url = "https://api.deepgram.com/v1/speak?model=aura-asteria-en&encoding=mulaw&sample_rate=8000&container=none"
    headers = {
        "Authorization": f"Token {DEEPGRAM_API_KEY}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            async with client.stream("POST", tts_url, headers=headers, json={"text": text}) as response:
                if response.status_code != 200:
                    err_body = await response.aread()
                    logger.error("Deepgram TTS failed: %s %s", response.status_code, err_body)
                    return

                # Send audio chunks in 640-byte increments (~80ms mulaw audio per frame)
                chunk_size = 640
                buffer = bytearray()
                async for chunk in response.aiter_bytes():
                    buffer.extend(chunk)
                    while len(buffer) >= chunk_size:
                        send_chunk = buffer[:chunk_size]
                        buffer = buffer[chunk_size:]
                        payload = base64.b64encode(send_chunk).decode("utf-8")
                        await websocket.send_text(json.dumps({
                            "event": "media",
                            "streamSid": stream_sid,
                            "media": {"payload": payload}
                        }))
                if buffer:
                    payload = base64.b64encode(buffer).decode("utf-8")
                    await websocket.send_text(json.dumps({
                        "event": "media",
                        "streamSid": stream_sid,
                        "media": {"payload": payload}
                    }))
    except Exception as e:
        logger.error("TTS stream error: %s", e)

async def call_llm(messages: List[Dict[str, Any]], base_url: str, api_key: str, model: str) -> Optional[Dict[str, Any]]:
    """Calls OpenAI-compatible LLM endpoint (Liquid AI LFM or fallback)."""
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    active_tools = get_active_tools(messages)
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.1,
        "max_tokens": 40,
        "keep_alive": "24h",
        "options": {
            "num_ctx": 1024,
            "num_predict": 40
        }
    }
    if active_tools:
        payload["tools"] = active_tools
        payload["tool_choice"] = "auto"

    url = f"{base_url.rstrip('/')}/chat/completions"
    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code == 200:
            data = resp.json()
            return data["choices"][0]["message"]
        logger.error("LLM call failed (%s): %s", resp.status_code, resp.text)
        return None

async def query_brain(messages: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Queries Liquid LFM on the VPS, falling back to secondary endpoint if configured."""
    msg = None
    try:
        msg = await call_llm(messages, LFM_BASE_URL, LFM_API_KEY, LFM_MODEL)
    except Exception as err:
        logger.warning("Primary LFM model error: %s", err)

    if not msg and FALLBACK_BASE_URL:
        logger.info("Attempting fallback model at %s...", FALLBACK_BASE_URL)
        try:
            msg = await call_llm(messages, FALLBACK_BASE_URL, FALLBACK_API_KEY, FALLBACK_MODEL)
        except Exception as err:
            logger.error("Fallback model error: %s", err)

    return msg or {
        "role": "assistant",
        "content": "I apologize, our system is experiencing a brief delay. How can I assist you today?"
    }

async def hangup_call(call_sid: str):
    """Terminates the Twilio call via REST API."""
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and call_sid):
        return
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Calls/{call_sid}.json"
    auth = (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    try:
        async with httpx.AsyncClient() as client:
            await client.post(url, auth=auth, data={"Status": "completed"})
            logger.info("Twilio call %s ended successfully.", call_sid)
    except Exception as e:
        logger.error("Failed to hang up Twilio call %s: %s", call_sid, e)

@app.websocket("/media-stream")
async def media_stream(websocket: WebSocket):
    await websocket.accept()
    logger.info("Twilio connected to Media Stream")

    stream_sid = None
    call_sid = None
    dg_socket = None
    should_end_call = False

    # Initialize conversation state with dynamic Toronto date/time prompt
    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": get_system_prompt()}
    ]

    async def run_dg_receive():
        """Listens for transcripts from Deepgram Live STT WebSocket."""
        nonlocal should_end_call
        try:
            async for raw in dg_socket:
                data = json.loads(raw)
                if data.get("type") != "Results":
                    continue
                channel = data.get("channel", {})
                alts = channel.get("alternatives", [])
                if not alts:
                    continue
                transcript = alts[0].get("transcript", "").strip()
                is_final = data.get("is_final", False)
                speech_final = data.get("speech_final", False)

                if transcript and (is_final or speech_final):
                    logger.info("Caller said: %s", transcript)

                    # Barge-in: clear Twilio's audio playback queue if caller speaks
                    if stream_sid:
                        await websocket.send_text(json.dumps({
                            "event": "clear",
                            "streamSid": stream_sid
                        }))

                    # Append user message
                    messages.append({"role": "user", "content": transcript})

                    # Maintain sliding window to protect LFM context budget on VPS
                    if len(messages) > MAX_HISTORY_MESSAGES:
                        # Keep system prompt at [0], slice the tail
                        system_msg = messages[0]
                        recent = messages[-(MAX_HISTORY_MESSAGES - 1):]
                        messages.clear()
                        messages.append(system_msg)
                        messages.extend(recent)

                    # Update system prompt with fresh conversation state
                    messages[0]["content"] = get_system_prompt(messages=messages)

                    # LLM completion loop (handles tool calls)
                    while True:
                        ai_msg = await query_brain(messages)
                        messages.append(ai_msg)

                        tool_calls = ai_msg.get("tool_calls")
                        if not tool_calls:
                            reply_text = ai_msg.get("content", "").strip()
                            reply_text = re.sub(r'^(Hannah|Assistant):\s*', '', reply_text, flags=re.IGNORECASE)
                            reply_text = re.sub(r'\[.*?\]', '', reply_text).strip()
                            if reply_text and stream_sid:
                                await send_tts_audio(websocket, stream_sid, reply_text)
                            break

                        # Process tool calls
                        for tool in tool_calls:
                            t_id = tool.get("id", "call_1")
                            fn = tool.get("function", {})
                            fn_name = fn.get("name")
                            fn_args = {}
                            try:
                                fn_args = json.loads(fn.get("arguments", "{}"))
                            except Exception:
                                pass

                            if fn_name == "end_after_reception":
                                should_end_call = True

                            result = execute_tool(fn_name, fn_args)
                            messages.append({
                                "role": "tool",
                                "tool_call_id": t_id,
                                "name": fn_name,
                                "content": json.dumps(result)
                            })

                    if should_end_call and call_sid:
                        await asyncio.sleep(2.5)  # Allow final audio to finish playing
                        await hangup_call(call_sid)
                        await websocket.close()
                        break
        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            logger.error("Deepgram receive loop error: %s", e)

    dg_url = "wss://api.deepgram.com/v1/listen?encoding=mulaw&sample_rate=8000&channels=1&endpointing=300&interim_results=true"
    dg_headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}

    try:
        async with websockets.connect(dg_url, extra_headers=dg_headers) as deepgram_ws:
            dg_socket = deepgram_ws
            dg_task = asyncio.create_task(run_dg_receive())

            while True:
                msg_text = await websocket.receive_text()
                event_data = json.loads(msg_text)
                event_type = event_data.get("event")

                if event_type == "start":
                    start_data = event_data.get("start", {})
                    stream_sid = start_data.get("streamSid")
                    call_sid = start_data.get("callSid")
                    logger.info("Stream started. streamSid=%s, callSid=%s", stream_sid, call_sid)

                    # Speak configured opening greeting immediately
                    messages.append({"role": "assistant", "content": OPENING_GREETING})
                    asyncio.create_task(send_tts_audio(websocket, stream_sid, OPENING_GREETING))

                elif event_type == "media":
                    media_payload = event_data.get("media", {}).get("payload")
                    if media_payload and dg_socket:
                        audio_bytes = base64.b64decode(media_payload)
                        await dg_socket.send(audio_bytes)

                elif event_type == "stop":
                    logger.info("Twilio stream stopped.")
                    break

            dg_task.cancel()
    except WebSocketDisconnect:
        logger.info("Twilio client disconnected.")
    except Exception as e:
        logger.error("Media stream error: %s", e)
    finally:
        if dg_socket and not dg_socket.closed:
            await dg_socket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
