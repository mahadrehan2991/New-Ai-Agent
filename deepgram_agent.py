import os
import sys
import json
import asyncio
import websockets
import pyaudio
from dotenv import load_dotenv
from prompt import get_system_prompt, OPENING_GREETING
from tools import execute_tool

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse"

# n8n Webhook Endpoints
N8N_LOOKUP_URL = os.getenv("N8N_LOOKUP_URL", "https://imrant0349t53495834.app.n8n.cloud/webhook/vapi-patient-lookup")
N8N_AVAIL_URL = os.getenv("N8N_AVAILABILITY_URL", "https://imrant0349t53495834.app.n8n.cloud/webhook/vapi-check-availability")
N8N_SAVE_URL = os.getenv("N8N_SAVE_URL", "https://imrant0349t53495834.app.n8n.cloud/webhook/vapi-save-appointment")

# Audio Config
INPUT_RATE = 16000    # Mic input rate (Hz)
OUTPUT_RATE = 24000   # Deepgram TTS output rate (Hz)
CHUNK_SIZE = 1024     # Frames per audio buffer

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
                "provider": {"type": "deepgram", "model": "nova-3"}
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
                        "description": "Ends the phone call after the final closing statement has been spoken.",
                        "parameters": {
                            "type": "object",
                            "properties": {}
                        }
                    }
                ]
            },
            "speak": {
                "provider": {"type": "deepgram", "model": "aura-2-thalia-en"}
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
    connect_kwargs = {"additional_headers": headers} if "additional_headers" in sig.parameters else {"extra_headers": headers}

    stop_event = asyncio.Event()

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
            try:
                async for raw in ws:
                    if isinstance(raw, bytes):
                        # Play Hannah's spoken voice in real time
                        speaker_stream.write(raw)
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
                                result = execute_tool(fn_name, fn_args)
                                print(f"[Clinic Webhook Finished: {json.dumps(result)}]\n")

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
                            # Barge-in detected: caller started speaking
                            pass

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
