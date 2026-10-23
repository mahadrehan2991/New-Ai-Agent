import os
import sys
import json
import time
import uuid
import queue
import socket
import threading
from datetime import datetime, timezone
import asyncio
import httpx
import websockets
import pyaudio
from dotenv import load_dotenv
from prompt import get_system_prompt, OPENING_GREETING
from tools import execute_tool

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

# Resilient DNS Resolver for Deepgram (Prevents Windows Errno 11002 getaddrinfo timeouts on local router/ISP DNS)
_orig_getaddrinfo = socket.getaddrinfo

def _resilient_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if host in ("agent.deepgram.com", "sts.sac1.deepgram.com"):
        try:
            return _orig_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)
        except Exception:
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("216.200.21.204", port))]
    return _orig_getaddrinfo(host, port, family, type, proto, flags)

socket.getaddrinfo = _resilient_getaddrinfo

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse"
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:3000")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "whsec_harmony_secret_key_london")

async def send_dashboard_webhook(endpoint: str, payload: dict):
    """Sends telemetry events to the clinic staff review dashboard."""
    url = f"{DASHBOARD_URL.rstrip('/')}/api/webhooks/{endpoint.lstrip('/')}"
    headers = {
        "Authorization": f"Bearer {WEBHOOK_SECRET}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            await client.post(url, headers=headers, json=payload)
    except Exception:
        pass

# n8n Webhook Endpoints
N8N_LOOKUP_URL = os.getenv("N8N_LOOKUP_URL", "https://imrant0349t53495834.app.n8n.cloud/webhook/vapi-patient-lookup")
N8N_AVAIL_URL = os.getenv("N8N_AVAILABILITY_URL", "https://imrant0349t53495834.app.n8n.cloud/webhook/vapi-check-availability")
N8N_SAVE_URL = os.getenv("N8N_SAVE_URL", "https://imrant0349t53495834.app.n8n.cloud/webhook/vapi-save-appointment")

# Audio Config
INPUT_RATE = 16000    # Mic input rate (Hz)
OUTPUT_RATE = 24000   # Deepgram TTS output rate (Hz)
CHUNK_SIZE = 1024     # Frames per audio buffer

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

def build_agent_settings() -> dict:
    return {
        "type": "Settings",
        "audio": {
            "input": {"encoding": "linear16", "sample_rate": INPUT_RATE},
            "output": {"encoding": "linear16", "sample_rate": OUTPUT_RATE, "container": "none"}
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
                        "description": "Checks clinic availability for an appointment date and time. Call this ONLY after the caller states pain and requests a specific date and time.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "appointment_date": {"type": "string", "description": "Date in YYYY-MM-DD format."},
                                "appointment_time": {"type": "string", "description": "Requested time within clinic hours (e.g. '10:30 AM', '3:00 PM')."}
                            },
                            "required": ["appointment_date", "appointment_time"]
                        },
                        "endpoint": {
                            "url": N8N_AVAIL_URL,
                            "method": "POST",
                            "headers": {"Content-Type": "application/json"}
                        }
                    },
                    {
                        "name": "Vapi-Patient-Lookup",
                        "description": "Looks up returning patient record using digits-only phone number.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "phone": {"type": "string", "description": "Digits-only callback phone number."}
                            },
                            "required": ["phone"]
                        },
                        "endpoint": {
                            "url": N8N_LOOKUP_URL,
                            "method": "POST",
                            "headers": {"Content-Type": "application/json"}
                        }
                    },
                    {
                        "name": "Vapi-save-appointment",
                        "description": "Saves booked appointment in clinic system after slot and insurance confirmation.",
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
                        },
                        "endpoint": {
                            "url": N8N_SAVE_URL,
                            "method": "POST",
                            "headers": {"Content-Type": "application/json"}
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

async def run_call():
    if not DEEPGRAM_API_KEY:
        print("[ERROR] Please set DEEPGRAM_API_KEY in your .env file!")
        return

    # Initialize PyAudio
    p = pyaudio.PyAudio()

    try:
        # Microphone Stream (Record caller speech)
        mic_stream = p.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=INPUT_RATE,
            input=True,
            frames_per_buffer=CHUNK_SIZE
        )

        # Speaker Stream (Play Hannah's voice)
        speaker_stream = p.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=OUTPUT_RATE,
            output=True,
            frames_per_buffer=CHUNK_SIZE
        )
    except Exception as e:
        print(f"[ERROR] Could not open audio hardware: {e}")
        p.terminate()
        return

    headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
    print("=" * 60)
    print("Connecting live call to Hannah at Happy Harmony Clinic...")
    print("Speak into your microphone. Hannah will reply through your speakers.")
    print("Press Ctrl+C to hang up.")
    print("=" * 60 + "\n")

    import inspect
    sig = inspect.signature(websockets.connect)
    hdr_key = "additional_headers" if "additional_headers" in sig.parameters else "extra_headers"
    connect_kwargs = {hdr_key: headers, "family": socket.AF_INET}

    stop_event = asyncio.Event()
    call_id = f"mic_{uuid.uuid4().hex[:8]}"
    call_start_time = time.time()
    saved_booking = None

    # Background audio playback thread to eliminate stutter & event-loop blocking
    playback_queue = queue.Queue()

    def playback_worker():
        while not stop_event.is_set():
            try:
                chunk = playback_queue.get(timeout=0.05)
                if chunk is None:
                    break
                speaker_stream.write(chunk)
                playback_queue.task_done()
            except queue.Empty:
                continue
            except Exception:
                pass

    playback_thread = threading.Thread(target=playback_worker, daemon=True)
    playback_thread.start()

    # Telemetry Webhook: Call Started
    asyncio.create_task(send_dashboard_webhook("call-started", {
        "callId": call_id,
        "callerPhone": "+15195550199",
        "startedAt": datetime.now(timezone.utc).isoformat(),
    }))

    async with websockets.connect(DEEPGRAM_AGENT_URL, **connect_kwargs) as ws:
        # 1. Send Agent Settings
        settings = build_agent_settings()
        await ws.send(json.dumps(settings))
        print("[Call Connected] Hannah is on the line!\n")

        loop = asyncio.get_running_loop()

        # Task 1: Stream microphone audio to Deepgram
        async def mic_loop():
            try:
                while not stop_event.is_set():
                    data = await loop.run_in_executor(
                        None, mic_stream.read, CHUNK_SIZE, False
                    )
                    if data:
                        await ws.send(data)
                    await asyncio.sleep(0.001)
            except asyncio.CancelledError:
                pass
            except Exception as err:
                if not stop_event.is_set():
                    print(f"\n[Mic error]: {err}")

        # Task 2: Receive Hannah's audio & events from Deepgram
        async def receive_loop():
            nonlocal saved_booking
            try:
                async for raw in ws:
                    if isinstance(raw, bytes):
                        # Queue audio chunk for smooth non-blocking hardware playback
                        playback_queue.put(raw)
                    else:
                        data = json.loads(raw)
                        msg_type = data.get("type", "")

                        if msg_type == "ConversationText":
                            role = data.get("role", "assistant")
                            content = data.get("content", "").strip()
                            if role == "user":
                                print(f"Caller (You): {content}")
                            else:
                                print(f"Hannah: {content}")
                                if "take care" in content.lower() and "happy harmony" in content.lower():
                                    async def delayed_hangup():
                                        await asyncio.sleep(4.0)  # Wait for voice playback to finish
                                        stop_event.set()
                                    asyncio.create_task(delayed_hangup())

                            # Telemetry Webhook: Transcript Turn
                            if content:
                                role_mapped = "caller" if role == "user" else "agent"
                                asyncio.create_task(send_dashboard_webhook("transcript", {
                                    "callId": call_id,
                                    "role": role_mapped,
                                    "text": content,
                                }))

                        elif msg_type == "FunctionCallRequest":
                            # Deepgram official spec: "functions": [{"id": ..., "name": ..., "arguments": ...}]
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
                                if isinstance(raw_args, str):
                                    try:
                                        fn_args = json.loads(raw_args)
                                    except Exception:
                                        fn_args = {}
                                else:
                                    fn_args = raw_args

                                print(f"\n[Clinic Webhook Triggered: {fn_name}({json.dumps(fn_args)})]")
                                t_start = time.time()
                                result = execute_tool(fn_name, fn_args)
                                duration_ms = int((time.time() - t_start) * 1000)
                                print(f"[Clinic Webhook Finished: {json.dumps(result)}]\n")

                                if fn_name == "Vapi-save-appointment":
                                    saved_booking = fn_args

                                # Telemetry Webhook: Tool Event
                                asyncio.create_task(send_dashboard_webhook("tool-event", {
                                    "callId": call_id,
                                    "toolName": fn_name,
                                    "arguments": fn_args,
                                    "result": result,
                                    "durationMs": duration_ms,
                                    "success": True,
                                }))

                                # Deepgram official spec: type=FunctionCallResponse, id, name, content
                                resp = {
                                    "type": "FunctionCallResponse",
                                    "name": fn_name,
                                    "content": json.dumps(result)
                                }
                                if fn_id:
                                    resp["id"] = fn_id
                                await ws.send(json.dumps(resp))

                                if fn_name in ("end_after_reception", "end_call"):
                                    await asyncio.sleep(2.5)
                                    stop_event.set()
                                    break

                        elif msg_type == "FunctionCallCancelled":
                            print("[Notice: Speculative tool call cancelled by caller speech]")

                        elif msg_type == "FunctionCallResponse":
                            print(f"[Clinic Webhook Response Acknowledged by Deepgram]\n")

                        elif msg_type == "UserStartedSpeaking":
                            # Caller interrupted - flush queue immediately for instant response
                            while not playback_queue.empty():
                                try:
                                    playback_queue.get_nowait()
                                    playback_queue.task_done()
                                except Exception:
                                    break

                        elif msg_type == "AgentAudioDone":
                            pass

            except asyncio.CancelledError:
                pass
            except Exception as err:
                if not stop_event.is_set():
                    print(f"\n[Receive error]: {err}")

        mic_task = asyncio.create_task(mic_loop())
        receive_task = asyncio.create_task(receive_loop())

        try:
            await asyncio.gather(mic_task, receive_task)
        except (KeyboardInterrupt, asyncio.CancelledError):
            pass
        finally:
            stop_event.set()
            mic_task.cancel()
            receive_task.cancel()

            try:
                playback_queue.put_nowait(None)
            except Exception:
                pass

            # Telemetry Webhook: Call Ended & AI Enrichment
            duration_s = int(time.time() - call_start_time) if call_start_time else 0
            end_payload = {
                "callId": call_id,
                "durationSeconds": duration_s,
                "status": "completed",
            }
            if saved_booking:
                if saved_booking.get("patient_name"):
                    end_payload["patientName"] = saved_booking.get("patient_name")
                if saved_booking.get("phone"):
                    end_payload["callerPhone"] = saved_booking.get("phone")
                
                appt_date = saved_booking.get("appointment_date", "2026-10-25")
                appt_time = saved_booking.get("appointment_time", "3:00 PM")
                iso_start = format_appointment_iso(appt_date, appt_time)

                end_payload["appointment"] = {
                    "startsAt": iso_start,
                    "type": "initial",
                    "insuranceDirectBilling": bool(saved_booking.get("insurance_company") and saved_booking.get("insurance_company").lower() != "none"),
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
            except Exception:
                pass

    # Cleanup PyAudio
    try:
        mic_stream.stop_stream()
        mic_stream.close()
        speaker_stream.stop_stream()
        speaker_stream.close()
        p.terminate()
    except Exception:
        pass

    print("\n[Call Ended]")

if __name__ == "__main__":
    try:
        asyncio.run(run_call())
    except KeyboardInterrupt:
        print("\n[Call Disconnected]")
