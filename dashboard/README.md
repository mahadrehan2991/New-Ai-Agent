# Happy Harmony Physiotherapy & Spine Rehabilitation Clinic
## Hannah AI Voice Receptionist & Clinical Staff Dashboard

A web dashboard built for clinic staff to monitor, review, and audit incoming telephony calls handled by **Hannah**, the clinic's AI voice receptionist (powered by Deepgram Voice Agent API & Twilio).

---

## Tech Stack
* **Framework:** Next.js (App Router) + TypeScript
* **Styling:** Tailwind CSS + Lucide Icons
* **Database & ORM:** SQLite via Prisma (schema portable to PostgreSQL)
* **Visualizations:** Recharts (symptom distribution, 30-day volume, outcomes breakdown, hourly trends)
* **Auth:** Secure HMAC session cookie with Argon2/timing-safe constant-time password check

---

## Environment Variables

Create a `dashboard/.env` file:

```env
# Database
DATABASE_URL="file:./dev.db"

# Clinic Staff Auth
ADMIN_PASSWORD="admin_harmony_2026"
SESSION_SECRET="whsec_harmony_secret_key_london"

# Ingestion Webhook Secret
WEBHOOK_SECRET="whsec_harmony_secret_key_london"

# (Optional) Swappable LLM Enrichment
# OPENAI_API_KEY="sk-..."
# GROQ_API_KEY="gsk_..."
```

---

## Quickstart & Seed

```bash
# 1. Navigate to dashboard directory
cd dashboard

# 2. Install dependencies
npm install

# 3. Apply Prisma database migrations
npx prisma db push

# 4. Seed database with 40 realistic clinic calls, multi-turn transcripts & pain triage
npm run seed

# 5. Start dev server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) and sign in using `admin_harmony_2026`.

---

## Ingestion Webhook API & Example cURL Requests

Hannah Voice Agent feeds the dashboard via 4 webhook endpoints. All endpoints require the header:
`Authorization: Bearer <WEBHOOK_SECRET>`

### 1. Call Started (`POST /api/webhooks/call-started`)
Initializes the call session and links or registers the patient profile.

```bash
curl -X POST http://localhost:3000/api/webhooks/call-started \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer whsec_harmony_secret_key_london" \
  -d '{
    "callId": "call_twilio_987654321",
    "callerPhone": "5195551234",
    "patientFirstName": "Elena",
    "patientLastName": "Rostova"
  }'
```

### 2. Append Transcript Turns (`POST /api/webhooks/transcript`)
Appends agent and caller dialogue turns to the ongoing call.

```bash
curl -X POST http://localhost:3000/api/webhooks/transcript \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer whsec_harmony_secret_key_london" \
  -d '{
    "callId": "call_twilio_987654321",
    "turns": [
      {
        "role": "agent",
        "text": "Hello, Happy Harmony Clinic! I am Hannah. How can I help you today?"
      },
      {
        "role": "caller",
        "text": "Hi Hannah, I have sharp pain in my lower back since yesterday."
      }
    ]
  }'
```

### 3. Record Tool Execution (`POST /api/webhooks/tool-event`)
Logs function calls executed by Hannah (e.g. checking slots, patient lookups).

```bash
curl -X POST http://localhost:3000/api/webhooks/tool-event \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer whsec_harmony_secret_key_london" \
  -d '{
    "callId": "call_twilio_987654321",
    "toolName": "check_availability",
    "arguments": {
      "service": "physiotherapy",
      "date": "2026-10-24"
    },
    "result": {
      "availableSlots": ["2026-10-24T10:00:00Z", "2026-10-24T14:30:00Z"]
    },
    "durationMs": 135,
    "success": true
  }'
```

### 4. Call Ended & AI Enrichment (`POST /api/webhooks/call-ended`)
Finalizes duration, schedules appointments, and runs the LLM enrichment pipeline to extract clinical complaint area, severity rating (1–5), sentiment, and summary.

```bash
curl -X POST http://localhost:3000/api/webhooks/call-ended \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer whsec_harmony_secret_key_london" \
  -d '{
    "callId": "call_twilio_987654321",
    "durationSeconds": 145,
    "status": "completed",
    "appointment": {
      "startsAt": "2026-10-24T14:30:00Z",
      "type": "initial",
      "insuranceDirectBilling": true,
      "status": "booked"
    }
  }'
```
