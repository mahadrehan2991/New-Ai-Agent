import os
import re
import json
import time
import base64
import socket
import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

import httpx
import websockets
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, HTMLResponse
from dotenv import load_dotenv

from prompt import get_system_prompt, OPENING_GREETING, update_state
from tools import TOOL_DEFINITIONS, execute_tool, get_active_tools, allowed_tools

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("voice_agent")

# Resilient DNS Resolver for Deepgram (Prevents Windows Errno 11002 getaddrinfo timeouts on local router/ISP DNS)
_orig_getaddrinfo = socket.getaddrinfo

def _resilient_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if host in ("agent.deepgram.com", "sts.sac1.deepgram.com"):
        try:
            return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
        except Exception:
            logger.info("Local DNS lookup failed for %s, using resilient Deepgram Anycast fallback", host)
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("216.200.21.204", port))]
    return _orig_getaddrinfo(host, port, family, type, proto, flags)

socket.getaddrinfo = _resilient_getaddrinfo

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
    return {"status": "ok", "agent": "Justine - Happy Harmony Clinic", "lfm_model": LFM_MODEL}

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
    state = body.get("state") or {}

    retry = update_state(state, user_text) if user_text else ""
    messages = [{"role": "system", "content": get_system_prompt(state, retry)}]
    for m in history:
        if m.get("role") in ("user", "assistant") and m.get("content"):
            messages.append({"role": m["role"], "content": m["content"]})

    tools_executed = []
    total_tool_ms = 0
    total_llm_ms = 0

    while True:
        t_llm = time.time()
        active = allowed_tools(state)
        ai_msg = await query_brain(messages, tools=active)
        total_llm_ms += int((time.time() - t_llm) * 1000)
        messages.append(ai_msg)

        tool_calls = ai_msg.get("tool_calls")
        if not tool_calls:
            reply = ai_msg.get("content", "").strip()
            import re
            reply = re.sub(r'^(Justine|Hannah|Assistant):\s*', '', reply, flags=re.IGNORECASE)
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
                "tools_executed": tools_executed,
                "state": state
            }

        for tool in tool_calls:
            fn = tool.get("function", {})
            fn_name = fn.get("name")
            try:
                fn_args = json.loads(fn.get("arguments", "{}"))
            except Exception:
                fn_args = {}

            t_t = time.time()
            result = execute_tool(fn_name, fn_args, state=state)
            total_tool_ms += int((time.time() - t_t) * 1000)
            tools_executed.append({"name": fn_name, "args": fn_args, "result": result})

            messages.append({
                "role": "tool",
                "tool_call_id": tool.get("id", "call_1"),
                "name": fn_name,
                "content": json.dumps(result)
            })

CALL_CALLER_PHONES: Dict[str, str] = {}
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:3000")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "whsec_harmony_secret_key_london")

async def send_dashboard_webhook(endpoint: str, payload: dict):
    """Sends asynchronous telemetry event to the clinic staff review dashboard."""
    url = f"{DASHBOARD_URL.rstrip('/')}/api/webhooks/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {WEBHOOK_SECRET}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code >= 400:
                logger.warning("Dashboard webhook %s returned HTTP %s: %s", endpoint, resp.status_code, resp.text)
    except Exception as e:
        logger.warning("Could not deliver webhook to dashboard (%s): %s", endpoint, e)

def format_appointment_iso(appt_date: str, appt_time: str) -> str:
    """Parses date and time like '3:00 PM' or '3 pm' into exact UTC ISO string."""
    clean_date = (appt_date or "2026-10-25").strip()
    clean_time = (appt_time or "15:00").strip().upper()
    try:
        import re
        m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?", clean_time)
        if m:
            h = int(m.group(1))
            mn = int(m.group(2) or 0)
            mer = m.group(3)
            if mer == "PM" and h < 12:
                h += 12
            elif mer == "AM" and h == 12:
                h = 0
            return f"{clean_date}T{h:02d}:{mn:02d}:00Z"
    except Exception:
        pass
    return f"{clean_date}T15:00:00Z"

ROBOCALL_PATTERNS = [
    r"press (?:one|two|three|four|five|six|seven|eight|nine|zero|\d|star|pound)",
    r"to replay your message",
    r"to continue recording",
    r"to delete and (?:rerecord|re-record)",
    r"for delivery options",
    r"to send a fax",
    r"to cancel this message",
    r"to send this message",
    r"record your message (?:after|at) the tone",
    r"message is too short",
    r"simply hang up when done",
    r"leave (?:a|your) message (?:after|at) the tone",
    r"please leave (?:a|your) message",
    r"is not available to take your call",
    r"at the tone please record",
]

def is_robocall_or_voicemail(text: str) -> bool:
    if not text:
        return False
    return any(re.search(pat, text, re.IGNORECASE) for pat in ROBOCALL_PATTERNS)

async def start_twilio_call_recording(call_sid: str, callback_url: str):
    """Instructs Twilio to record the ongoing call."""
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and call_sid):
        return
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Calls/{call_sid}/Recordings.json"
    auth = (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    data = {
        "RecordingStatusCallback": callback_url,
        "RecordingStatusCallbackEvent": "completed",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, auth=auth, data=data)
            if resp.status_code in (200, 201):
                logger.info("Twilio call recording initiated successfully for %s", call_sid)
            else:
                logger.warning("Twilio recording start returned %s: %s", resp.status_code, resp.text)
    except Exception as e:
        logger.error("Failed to start Twilio call recording: %s", e)

@app.post("/recording-callback")
async def recording_callback(request: Request):
    """Twilio webhook when call recording is processed and ready."""
    try:
        form = await request.form()
        call_sid = form.get("CallSid")
        recording_sid = form.get("RecordingSid")
        logger.info("Twilio recording callback received: CallSid=%s, RecordingSid=%s", call_sid, recording_sid)
        if call_sid and recording_sid:
            host = request.headers.get("host", "localhost:8000")
            proto = "https" if ("localhost" not in host and "127.0.0.1" not in host) or "ngrok" in host or "trycloudflare" in host else "http"
            audio_url = f"{proto}://{host}/api/recordings/{recording_sid}.mp3"

            await send_dashboard_webhook("call-ended", {
                "callId": call_sid,
                "recordingUrl": audio_url
            })
    except Exception as e:
        logger.warning("Error handling recording callback: %s", e)
    return Response(status_code=200)

@app.get("/api/recordings/{recording_sid}.mp3")
async def proxy_recording(recording_sid: str):
    """Streams Twilio call recording to the browser dashboard using account credentials."""
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN):
        return Response(status_code=403)
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Recordings/{recording_sid}.mp3"
    auth = (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, auth=auth)
            if resp.status_code == 200:
                return Response(content=resp.content, media_type="audio/mpeg")
            return Response(status_code=resp.status_code)
    except Exception as e:
        logger.error("Error streaming recording from Twilio: %s", e)
        return Response(status_code=500)

@app.post("/incoming-call")
async def incoming_call(request: Request):
    """Twilio Voice Webhook: Instructs Twilio to open a bidirectional Media Stream."""
    host = request.headers.get("host", "localhost")
    try:
        form = await request.form()
        call_sid = form.get("CallSid")
        caller_phone = form.get("From")
        if call_sid and caller_phone:
            CALL_CALLER_PHONES[call_sid] = caller_phone
            logger.info("Incoming Twilio call from %s (CallSid: %s)", caller_phone, call_sid)
    except Exception as e:
        logger.warning("Could not parse form from incoming call: %s", e)

    # Automatically use wss:// for Cloudflare tunnels, ngrok, or any remote host
    is_secure = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto") == "https"
        or "ngrok" in host
        or "trycloudflare.com" in host
        or "sslip.io" in host
        or ("localhost" not in host and "127.0.0.1" not in host)
    )
    ws_protocol = "wss" if is_secure else "ws"
    stream_url = f"{ws_protocol}://{host}/media-stream"

    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Response>\n'
        '  <Connect>\n'
        f'    <Stream url="{stream_url}" />\n'
        '  </Connect>\n'
        '  <Hangup />\n'
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

async def call_llm(messages: List[Dict[str, Any]], base_url: str, api_key: str, model: str, tools: Optional[List[Dict[str, Any]]] = None) -> Optional[Dict[str, Any]]:
    """Calls OpenAI-compatible LLM endpoint (Liquid AI LFM or fallback)."""
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    active_tools = tools if tools is not None else get_active_tools(messages)
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

async def query_brain(messages: List[Dict[str, Any]], tools: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """Queries Liquid LFM on the VPS, falling back to secondary endpoint if configured."""
    msg = None
    try:
        msg = await call_llm(messages, LFM_BASE_URL, LFM_API_KEY, LFM_MODEL, tools=tools)
    except Exception as err:
        logger.warning("Primary LFM model error: %s", err)

    if not msg and FALLBACK_BASE_URL:
        logger.info("Attempting fallback model at %s...", FALLBACK_BASE_URL)
        try:
            msg = await call_llm(messages, FALLBACK_BASE_URL, FALLBACK_API_KEY, FALLBACK_MODEL, tools=tools)
        except Exception as err:
            logger.error("Fallback model error: %s", err)

    return msg or {
        "role": "assistant",
        "content": "I apologize, our system is experiencing a brief delay. How can I assist you today?"
    }

async def hangup_call(call_sid: str):
    """Terminates the Twilio call via REST API."""
    if not (TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and call_sid):
        logger.warning("hangup_call skipped: missing TWILIO_ACCOUNT_SID/AUTH_TOKEN or call_sid=%s", call_sid)
        return
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Calls/{call_sid}.json"
    auth = (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, auth=auth, data={"Status": "completed"})
            if resp.status_code in (200, 202):
                logger.info("Twilio call %s hung up successfully via REST API.", call_sid)
            else:
                logger.warning("Twilio hangup for %s returned HTTP %s: %s", call_sid, resp.status_code, resp.text)
    except Exception as e:
        logger.error("Failed to hang up Twilio call %s via REST API: %s", call_sid, e)

# Internal Clinical Endpoints (Direct SQLite & Email)
CLINICAL_AVAIL_PATH = "/api/clinical/check-availability"
CLINICAL_LOOKUP_PATH = "/api/clinical/patient-lookup"
CLINICAL_SAVE_PATH = "/api/clinical/save-appointment"

def build_twilio_agent_settings() -> dict:
    return {
        "type": "Settings",
        "audio": {
            "input": {"encoding": "mulaw", "sample_rate": 8000},
            "output": {"encoding": "mulaw", "sample_rate": 8000, "container": "none"}
        },
        "agent": {
            "language": "en",
            "listen": {
                # eot_threshold only works on Flux (v2); 0.85 = wait for higher confidence before ending caller's turn
                "provider": {"type": "deepgram", "version": "v2", "model": "flux-general-en", "eot_threshold": 0.85}
            },
            "think": {
                "provider": {
                    "type": "open_ai",
                    "model": "gpt-4o-mini"
                },
                "prompt": get_system_prompt(),
                "functions": [
                    {
                        "name": "vapi-check-availability",
                        "description": "Checks clinic availability for an appointment date and time. Invoke immediately when the caller specifies a preferred date and time.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "appointment_date": {"type": "string", "description": "Date in YYYY-MM-DD format."},
                                "appointment_time": {"type": "string", "description": "Requested time within clinic hours (e.g. '10:30 AM', '3:00 PM')."}
                            },
                            "required": ["appointment_date", "appointment_time"]
                        }
                    },
                    {
                        "name": "Vapi-Patient-Lookup",
                        "description": "Looks up returning patient record using digits-only phone number. Invoke immediately when an existing patient provides their phone number.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "phone": {"type": "string", "description": "Digits-only callback phone number."}
                            },
                            "required": ["phone"]
                        }
                    },
                    {
                        "name": "Vapi-save-appointment",
                        "description": "Saves booked appointment in clinic system. Invoke immediately after slot and insurance confirmation to finalize booking.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "patient_name": {"type": "string", "description": "Full name of patient"},
                                "phone": {"type": "string", "description": "Digits-only phone"},
                                "area_of_concern": {"type": "string", "description": "Pain or injury area"},
                                "appointment_day": {"type": "string", "description": "Day of week"},
                                "appointment_date": {"type": "string", "description": "Date in YYYY-MM-DD"},
                                "appointment_time": {"type": "string", "description": "Confirmed time"},
                                "insurance_company": {"type": "string", "description": "Insurance provider or 'None'"}
                            },
                            "required": [
                                "patient_name", "phone", "area_of_concern",
                                "appointment_day", "appointment_date",
                                "appointment_time", "insurance_company"
                            ]
                        }
                    },
                    {
                        "name": "end_after_reception",
                        "description": "Ends the phone call. Invoke this function in the EXACT SAME turn when speaking the closing goodbye phrase ('Thank you for choosing Happy Harmony Physiotherapy and Spine Rehabilitation. Take care!').",
                        "parameters": {
                            "type": "object",
                            "properties": {}
                        }
                    }
                ]
            },
            "speak": {
                "provider": {"type": "deepgram", "model": "aura-asteria-en"}
            },
            "greeting": OPENING_GREETING
        }
    }

@app.websocket("/media-stream")
async def media_stream(websocket: WebSocket):
    await websocket.accept()
    logger.info("Twilio connected to Media Stream")

    stream_sid = None
    call_sid = None
    caller_phone = None
    call_start_time = None
    saved_booking = None
    dg_socket = None
    pending_greeting_chunks: List[bytes] = []
    stop_event = asyncio.Event()
    hangup_triggered = False

    async def trigger_delayed_hangup(delay_seconds: float = 4.0):
        nonlocal hangup_triggered
        if hangup_triggered:
            return
        hangup_triggered = True
        logger.info("Call termination scheduled in %.1fs for call %s", delay_seconds, call_sid)
        await asyncio.sleep(delay_seconds)
        if call_sid:
            await hangup_call(call_sid)
        stop_event.set()
        try:
            await websocket.close()
        except Exception:
            pass
        if dg_socket:
            try:
                await dg_socket.close()
            except Exception:
                pass

    dg_url = "wss://agent.deepgram.com/v1/agent/converse"
    headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}

    async def run_dg_receive():
        """Listens for audio frames & events from Deepgram Voice Agent API."""
        nonlocal call_sid, stream_sid, saved_booking, call_start_time
        try:
            async for raw in dg_socket:
                if isinstance(raw, bytes):
                    if stream_sid:
                        payload = base64.b64encode(raw).decode("utf-8")
                        await websocket.send_text(json.dumps({
                            "event": "media",
                            "streamSid": stream_sid,
                            "media": {"payload": payload}
                        }))
                    else:
                        pending_greeting_chunks.append(raw)
                else:
                    data = json.loads(raw)
                    msg_type = data.get("type", "")

                    if msg_type == "UserStartedSpeaking":
                        # After the opening greeting (7s), flush Twilio's playback queue on barge-in
                        now = time.time()
                        if call_start_time and (now - call_start_time) > 7.0:
                            if stream_sid:
                                try:
                                    await websocket.send_text(json.dumps({
                                        "event": "clear",
                                        "streamSid": stream_sid
                                    }))
                                except Exception:
                                    pass

                    elif msg_type == "AgentAudioDone":
                        pass

                    elif msg_type == "ConversationText":
                        role = data.get("role", "assistant")
                        content = data.get("content", "").strip()
                        if role == "user":
                            logger.info("Caller said: %s", content)
                            if is_robocall_or_voicemail(content):
                                logger.warning("Automated voicemail/IVR detected from caller: '%s'. Hanging up immediately.", content)
                                asyncio.create_task(trigger_delayed_hangup(delay_seconds=0.2))
                                break
                        else:
                            logger.info("Justine said: %s", content)
                            lower_content = content.lower()
                            if "take care" in lower_content or ("goodbye" in lower_content and "thank you" in lower_content):
                                logger.info("Justine closing phrase detected: '%s'. Scheduling automatic hangup.", content)
                                asyncio.create_task(trigger_delayed_hangup(delay_seconds=4.5))

                        # Telemetry Webhook: Transcript turn
                        if call_sid and content:
                            role_mapped = "caller" if role == "user" else "agent"
                            asyncio.create_task(send_dashboard_webhook("transcript", {
                                "callId": call_sid,
                                "role": role_mapped,
                                "text": content,
                            }))

                    elif msg_type == "FunctionCallRequest":
                        fn_list = data.get("functions")
                        if not fn_list:
                            fn_list = [{
                                "id": data.get("id") or data.get("function_call_id") or data.get("call_id"),
                                "name": data.get("name") or data.get("function_name"),
                                "arguments": data.get("arguments") or data.get("input") or {}
                            }]

                        for item in fn_list:
                            fn_id = item.get("id")
                            fn_name = item.get("name")
                            raw_args = item.get("arguments") or {}
                            fn_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args

                            logger.info("Executing tool: %s with args: %s", fn_name, fn_args)
                            t_start = time.time()
                            result = execute_tool(fn_name, fn_args)
                            fn_duration_ms = int((time.time() - t_start) * 1000)

                            if fn_name == "Vapi-save-appointment":
                                saved_booking = fn_args

                            # Telemetry Webhook: Tool Event
                            if call_sid:
                                asyncio.create_task(send_dashboard_webhook("tool-event", {
                                    "callId": call_sid,
                                    "toolName": fn_name,
                                    "arguments": fn_args,
                                    "result": result,
                                    "durationMs": fn_duration_ms,
                                    "success": True,
                                }))

                            resp = {
                                "type": "FunctionCallResponse",
                                "name": fn_name,
                                "content": json.dumps(result)
                            }
                            if fn_id:
                                resp["id"] = fn_id
                            await dg_socket.send(json.dumps(resp))

                            if fn_name in ("end_after_reception", "end_call"):
                                asyncio.create_task(trigger_delayed_hangup(delay_seconds=3.5))

        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            logger.error("Deepgram Agent receive error: %s", e)

    try:
        import inspect
        sig = inspect.signature(websockets.connect)
        hdr_key = "additional_headers" if "additional_headers" in sig.parameters else "extra_headers"
        connect_opts = {hdr_key: headers, "family": socket.AF_INET}
        async with websockets.connect(dg_url, **connect_opts) as deepgram_ws:
            dg_socket = deepgram_ws
            settings = build_twilio_agent_settings()
            await dg_socket.send(json.dumps(settings))
            logger.info("Deepgram Voice Agent API initialized for Twilio call")

            dg_task = asyncio.create_task(run_dg_receive())

            while not stop_event.is_set():
                msg_text = await websocket.receive_text()
                event_data = json.loads(msg_text)
                event_type = event_data.get("event")

                if event_type == "start":
                    start_data = event_data.get("start", {})
                    stream_sid = start_data.get("streamSid")
                    call_sid = start_data.get("callSid")
                    call_start_time = time.time()
                    caller_phone = CALL_CALLER_PHONES.get(call_sid, "Unknown")
                    logger.info("Stream started. streamSid=%s, callSid=%s, callerPhone=%s", stream_sid, call_sid, caller_phone)

                    # Flush any greeting frames generated before streamSid arrived
                    while pending_greeting_chunks:
                        chunk = pending_greeting_chunks.pop(0)
                        payload = base64.b64encode(chunk).decode("utf-8")
                        await websocket.send_text(json.dumps({
                            "event": "media",
                            "streamSid": stream_sid,
                            "media": {"payload": payload}
                        }))

                    # Telemetry Webhook: Call Started
                    asyncio.create_task(send_dashboard_webhook("call-started", {
                        "callId": call_sid,
                        "callerPhone": caller_phone,
                        "startedAt": datetime.now(timezone.utc).isoformat(),
                    }))

                    # Initiate Twilio recording now that the media stream is active
                    ws_host = websocket.headers.get("host", "localhost")
                    cb_proto = "https" if ("localhost" not in ws_host and "127.0.0.1" not in ws_host) or "trycloudflare" in ws_host or "ngrok" in ws_host else "http"
                    recording_cb = f"{cb_proto}://{ws_host}/recording-callback"
                    asyncio.create_task(start_twilio_call_recording(call_sid, recording_cb))

                elif event_type == "media":
                    media_payload = event_data.get("media", {}).get("payload")
                    if media_payload and dg_socket:
                        # Mute caller mic during opening greeting (first 6.5s) to eliminate acoustic echo feedback
                        if call_start_time and (time.time() - call_start_time) < 6.5:
                            continue
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
        # Telemetry Webhook: Call Ended & AI Enrichment
        if call_sid:
            duration_s = int(time.time() - call_start_time) if call_start_time else 0
            end_payload: Dict[str, Any] = {
                "callId": call_sid,
                "durationSeconds": duration_s,
                "status": "completed",
            }
            if saved_booking:
                end_payload["outcome"] = "booked"
                if saved_booking.get("patient_name"):
                    end_payload["patientName"] = saved_booking.get("patient_name")
                if saved_booking.get("phone"):
                    end_payload["callerPhone"] = saved_booking.get("phone")
                appt_date = saved_booking.get("appointment_date", "")
                appt_time = saved_booking.get("appointment_time", "")
                iso_start = format_appointment_iso(appt_date, appt_time)
                has_insurance = bool(saved_booking.get("insurance_company") and saved_booking.get("insurance_company").lower() != "none")
                end_payload["appointment"] = {
                    "startsAt": iso_start,
                    "type": "initial",
                    "insuranceDirectBilling": has_insurance,
                    "status": "booked"
                }
                if saved_booking.get("area_of_concern"):
                    end_payload["complaint"] = {
                        "bodyArea": saved_booking.get("area_of_concern"),
                        "description": f"Caller reported: {saved_booking.get('area_of_concern')}",
                        "severity": 3
                    }
            try:
                await send_dashboard_webhook("call-ended", end_payload)
            except Exception as e:
                logger.warning("Failed to send call-ended webhook: %s", e)

        if dg_socket:
            try:
                await dg_socket.close()
            except Exception:
                pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
