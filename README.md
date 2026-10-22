# Liquid AI Twilio Voice Agent (Hannah - Happy Harmony Clinic)

A real-time voice receptionist agent running on Twilio Media Streams, Deepgram Live STT/TTS, and a Liquid AI Foundation Model (LFM) running on your VPS.

## Architecture

```
Twilio Inbound Call (Phone)
          │ (Mulaw 8000Hz bi-directional WebSocket)
          ▼
    FastAPI Server (/media-stream)
    ├── Deepgram Live STT (Transcribes caller speech with barge-in)
    ├── Brain: Liquid AI LFM (OpenAI-compatible /v1/chat/completions)
    │   └── Tools:
    │       ├── vapi-check-availability (date & time availability)
    │       ├── Vapi-Patient-Lookup (phone lookup)
    │       ├── Vapi-save-appointment (booking persistence)
    │       └── end_after_reception (terminates call)
    └── Deepgram Aura TTS (Streams 8000Hz mulaw audio back to Twilio)
```

## Setup

1. Copy `.env.example` to `.env` and fill in credentials:
   ```bash
   cp .env.example .env
   ```
2. Set your Deepgram API key and your VPS LFM endpoint (`LFM_BASE_URL`, e.g. `http://localhost:8000/v1` or public IP).
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the test suite:
   ```bash
   python test_agent.py
   ```
5. Start the server:
   ```bash
   python app.py
   ```

## Twilio Configuration

In the Twilio Console under your Phone Number's Voice settings:
- Set **A CALL COMES IN** Webhook: `POST https://your-server-or-ngrok-domain/incoming-call`
