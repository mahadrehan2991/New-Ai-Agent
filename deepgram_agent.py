import os
import json
import asyncio
import websockets
from dotenv import load_dotenv
from prompt import get_system_prompt, OPENING_GREETING

load_dotenv()

DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")
DEEPGRAM_AGENT_URL = "wss://agent.deepgram.com/v1/agent/converse"

# n8n Webhook Endpoints
N8N_LOOKUP_URL = os.getenv("N8N_LOOKUP_URL", "https://imrant0349t53495834.app.n8n.cloud/webhook/vapi-patient-lookup")
N8N_AVAIL_URL = os.getenv("N8N_AVAILABILITY_URL", "https://imrant0349t53495834.app.n8n.cloud/webhook/vapi-check-availability")
N8N_SAVE_URL = os.getenv("N8N_SAVE_URL", "https://imrant0349t53495834.app.n8n.cloud/webhook/vapi-save-appointment")

def build_agent_settings() -> dict:
    return {
        "type": "Settings",
        "audio": {
            "input": {"encoding": "linear16", "sample_rate": 24000},
            "output": {"encoding": "linear16", "sample_rate": 24000, "container": "none"}
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
                        "name": "check_clinic_availability",
                        "description": "Checks clinic availability for an appointment date and time. Call this ONLY after the caller states pain and requests a date/time.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "appointment_date": {"type": "string", "description": "Date in YYYY-MM-DD"},
                                "appointment_time": {"type": "string", "description": "Time (e.g. 10:30 AM, 3:00 PM)"}
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
                        "name": "lookup_patient",
                        "description": "Looks up returning patient record using digits-only phone.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "phone": {"type": "string", "description": "Digits-only phone number"}
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
                        "name": "save_clinic_appointment",
                        "description": "Saves booked appointment in clinic system after slot and insurance confirmation.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "patient_name": {"type": "string"},
                                "phone": {"type": "string"},
                                "area_of_concern": {"type": "string"},
                                "appointment_day": {"type": "string"},
                                "appointment_date": {"type": "string"},
                                "appointment_time": {"type": "string"},
                                "insurance_company": {"type": "string"}
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
                    }
                ]
            },
            "speak": {
                "provider": {"type": "deepgram", "model": "aura-2-thalia-en"}
            },
            "greeting": OPENING_GREETING
        }
    }

async def run_agent():
    if not DEEPGRAM_API_KEY:
        print("[ERROR] Please set DEEPGRAM_API_KEY in your .env file!")
        return

    headers = {"Authorization": f"Token {DEEPGRAM_API_KEY}"}
    print(f"Connecting to Deepgram Voice Agent API ({DEEPGRAM_AGENT_URL})...")

    # Connect with websockets (compatible across websockets versions)
    connect_kwargs = {"additional_headers": headers} if hasattr(websockets, "asyncio") else {"extra_headers": headers}
    async with websockets.connect(DEEPGRAM_AGENT_URL, **connect_kwargs) as ws:
        settings = build_agent_settings()
        await ws.send(json.dumps(settings))
        print("[Connected] Settings sent! Hannah is ready.")
        print(f"Opening Greeting: \"{OPENING_GREETING}\"\n")

        async for raw in ws:
            if isinstance(raw, bytes):
                # Raw audio chunk received from Deepgram TTS
                pass
            else:
                data = json.loads(raw)
                event_type = data.get("type", "")
                if event_type == "ConversationText":
                    role = data.get("role", "assistant")
                    content = data.get("content", "")
                    print(f"[{role.upper()}]: {content}")
                elif event_type == "FunctionCallRequest":
                    print(f"[Function Call]: {data.get('function_name')} ({data.get('input')})")
                elif event_type == "UserStartedSpeaking":
                    print("[Caller is speaking...]")
                elif event_type == "AgentAudioDone":
                    print("[Hannah finished speaking]\n")

if __name__ == "__main__":
    asyncio.run(run_agent())
