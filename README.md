# Deepgram Voice AI Agent (Hannah - Happy Harmony Clinic)

A real-time, low-latency voice receptionist agent powered by **Deepgram Voice Agent API** (`v1/agent/converse`), PyAudio for local live calls, and automated **n8n** webhook function execution for clinic appointments.

## Architecture

```
Caller (Microphone / Phone)
          │ (16kHz PCM / Twilio Stream)
          ▼
    Deepgram Voice Agent API (WebSocket)
    ├── Listen: Nova-3 Speech-to-Text (Ultra-low latency with barge-in)
    ├── Think: Cloud LLM (GPT-4o-mini / Gemini Flash) with Clinic System Prompt
    ├── Tools (Server-Side + Client-Side Fallback):
    │   ├── vapi-check-availability (n8n Webhook)
    │   ├── Vapi-Patient-Lookup (n8n Webhook)
    │   ├── Vapi-save-appointment (n8n Webhook)
    │   └── end_after_reception (Call termination)
    └── Speak: Deepgram Aura-2 / Flux TTS (Hannah's natural voice)
```

## Quick Start (Live Voice Call via Mic & Speakers)

1. Clone and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Configure `.env` with your Deepgram API Key:
   ```ini
   DEEPGRAM_API_KEY=your_deepgram_api_key_here
   ```
3. Run the live call:
   ```bash
   python deepgram_agent.py
   ```
   Speak into your microphone and Hannah will respond through your speakers in real time.

## Running Tests

Verify tool execution, input phone validation, and state gating:
```bash
pytest
```

## Production Docker Deployment (VPS)

1. Clone repository to your VPS:
   ```bash
   git clone <your-repo-url>
   cd "Voice Ai agent (Liquid Ai)"
   ```
2. Configure `.env` on VPS:
   ```bash
   cp .env.example .env
   nano .env
   ```
3. Start container with Docker Compose:
   ```bash
   docker compose up -d --build
   ```
4. Check container status & logs:
   ```bash
   docker compose ps
   docker compose logs -f
   ```

## Web Voice Simulator

Open in your browser to test voice, STT, and measure exact millisecond latency:
`http://localhost:8000/simulator`

## Twilio Configuration

In the Twilio Console under your Phone Number's Voice settings:
- Set **A CALL COMES IN** Webhook: `POST https://your-server-or-ngrok-domain/incoming-call`
