import re
import zoneinfo
from datetime import datetime

SYSTEM_PROMPT_TEMPLATE = """You are Hannah, the warm receptionist at Happy Harmony Physiotherapy & Spine Rehabilitation Clinic in London, Ontario.
Today is {current_date} ({current_time}, America/Toronto).
Hours: Mon-Fri 10 AM-6 PM, Sat 10 AM-2 PM, closed Sunday.
Pricing: Initial Assessment $85, Follow-up $65.

VOICE STYLE:
One short, natural sentence per turn, under 15 words. No lists, markdown, or emojis. Ask only ONE thing per turn.

BOOKING FLOW (follow in order, skipping anything in COLLECTED):
1. patient_type: "Are you a new patient, or have you visited before?"
2. NEW patient: first_name, then last_name, then phone.
   EXISTING patient: phone only, then run the patient lookup silently and welcome them back.
3. complaint: "What pain, injury, or stiffness brings you in today?"
4. After the complaint, give ONE short empathy phrase, then ask for their preferred day and time.
5. When they name a day, say the day and full calendar date, then check availability silently. Never ask for a phone number here.
6. insurance: "Will you be using direct billing insurance?"
7. When they confirm a slot, save the appointment silently, then confirm it in one warm sentence.
8. When they are finished, say: "Thank you for choosing Happy Harmony! Take care and have a wonderful day!" and end the call.

RULES:
- COLLECTED below is already known. NEVER ask for those items again, not even to confirm.
- Each turn, ask only for NEXT_STEP. If the caller replies vaguely ("ok", "mhm", "sure"), briefly acknowledge and ask NEXT_STEP.
- Acknowledge a name or phone by saying it naturally once, without asking "is that right?".
- Requests outside hours (Sundays, after 6 PM): decline politely and offer an open time.
- Use a tool only when the caller has given a specific day AND time. Never invent tool results in plain text.
- Never speak tool names aloud. Never diagnose or prescribe. Never invent availability.
- Never output brackets or placeholders. Use the caller's real words.

COLLECTED: {collected}
NEXT_STEP: {next_step}
"""

OPENING_GREETING = (
    "Hello, thank you for calling Happy Harmony Physiotherapy and Spine "
    "Rehabilitation Clinic! My name is Hannah. How may I help you today?"
)

ORDER = ["patient_type", "first_name", "last_name", "phone",
         "complaint", "preferred_time", "insurance"]

STEP_DESCRIPTIONS = {
    "patient_type": 'Ask: "Are you a new patient, or have you visited before?"',
    "first_name": "Ask for their first name.",
    "last_name": "Thank them by first name, then ask for their last name.",
    "phone": "Ask for their callback phone number.",
    "complaint": 'Ask: "What pain, injury, or stiffness brings you in today?"',
    "preferred_time": "Say one short empathy phrase, then ask what day and time they prefer.",
    "insurance": "Ask if they will use direct billing insurance.",
    "CONFIRM_AND_BOOK": "Confirm the booking details and save the appointment.",
}

VAGUE = {"ok", "okay", "mhm", "sure", "yes", "yeah", "hmm", "hey", "hi"}


def next_field(state: dict) -> str:
    order = ["patient_type", "phone", "complaint", "preferred_time", "insurance"] if state.get("patient_type") == "existing" else ORDER
    return next((f for f in order if not state.get(f)), "CONFIRM_AND_BOOK")


def extract_name(text: str) -> str | None:
    t = re.sub(r"(?i)\b(i am|i'm|my name is|it's|its|this is|name is)\b", "", text)
    words = re.findall(r"[A-Za-z'-]+", t)
    return words[0].capitalize() if words else None


def valid_phone(text: str) -> str | None:
    d = re.sub(r"\D", "", text)
    if len(d) == 10 and d[0] not in "01":          # Canadian number
        return d
    if len(d) == 11 and d.startswith("1"):
        return d[1:]
    if len(d) == 11 and d.startswith("03"):        # PK number, for testing
        return d
    return None


def update_state(state: dict, text: str) -> str:
    """Returns a retry note if the input was rejected, else ''."""
    nxt = next_field(state)
    low = text.lower().strip()

    if nxt == "patient_type":
        if "new" in low:
            state["patient_type"] = "new"
        elif any(w in low for w in ("before", "existing", "returning", "been")):
            state["patient_type"] = "existing"
    elif nxt in ("first_name", "last_name"):
        name = extract_name(text)
        if name and name.lower() not in VAGUE:
            state[nxt] = name
    elif nxt == "phone":
        phone = valid_phone(text)
        if phone:
            state["phone"] = phone
        else:
            return "The number was incomplete. Politely ask them to say the full number again."
    elif nxt == "complaint":
        if low not in VAGUE and len(text.split()) >= 2:
            state["complaint"] = text.strip()
    elif nxt == "preferred_time":
        pass  # filled by availability tool result
    elif nxt == "insurance":
        if any(w in low for w in ("yes", "no", "yeah", "nope", "insurance", "direct")):
            state["insurance"] = text.strip()
    return ""


def get_system_prompt(state: dict | None = None, retry_note: str = "") -> str:
    state = state or {}
    now = datetime.now(zoneinfo.ZoneInfo("America/Toronto"))
    collected = {k: v for k, v in state.items() if v} or "nothing yet"
    nxt = next_field(state)
    instruction = STEP_DESCRIPTIONS[nxt] + (" " + retry_note if retry_note else "")
    return (SYSTEM_PROMPT_TEMPLATE
            .replace("{current_date}", now.strftime("%A, %B %d, %Y"))
            .replace("{current_time}", now.strftime("%I:%M %p"))
            .replace("{collected}", str(collected))
            .replace("{next_step}", instruction))
