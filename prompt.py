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
   EXISTING patient: phone only, then run Vapi-Patient-Lookup and welcome them back.
3. complaint: "What pain, injury, or stiffness brings you in today?"
4. After the complaint, give ONE short empathy phrase, then ask for their preferred day and time.
5. When they name a day/time, confirm the calendar date and call tool vapi-check-availability. Never ask for phone number here.
6. insurance: "Will you be using direct billing insurance?"
7. When slot is confirmed, call tool Vapi-save-appointment, then confirm it in one warm sentence.
8. When they are finished, say: "Thank you for choosing Happy Harmony! Take care and have a wonderful day!" and call end_after_reception.

RULES:
- COLLECTED below is already known. NEVER ask for those items again, not even to confirm.
- Each turn, you MUST ask for NEXT_STEP. Do not skip ahead or ask for later steps!
- Acknowledge a name or phone by saying it naturally once, without asking "is that right?".
- Requests outside hours (Sundays, after 6 PM): decline politely and offer an open time.
- Tool calling: When checking availability, you MUST call vapi-check-availability. When booking, you MUST call Vapi-save-appointment. Never invent or fake tool results in plain text!
- Never speak tool names aloud in dialogue to caller.
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
    "last_name": "Ask for their last name.",
    "phone": "Ask for their callback phone number.",
    "complaint": 'Ask: "What pain, injury, or stiffness brings you in today?"',
    "preferred_time": "Confirm the calendar date and call tool vapi-check-availability.",
    "insurance": 'Ask: "Will you be using direct billing insurance?"',
    "CONFIRM_AND_BOOK": "Call tool Vapi-save-appointment to save booking, then confirm in one warm sentence."
}


def extract_state(messages: list) -> dict:
    state = {}
    caller_msgs = [m.get("content", "") for m in messages if m.get("role") == "user" and isinstance(m.get("content"), str)]
    asst_msgs = [m.get("content", "") for m in messages if m.get("role") == "assistant" and isinstance(m.get("content"), str)]
    full_user = " ".join(caller_msgs).lower()

    if "new patient" in full_user:
        state["patient_type"] = "new"
    elif any(k in full_user for k in ["existing", "visited before", "been here"]):
        state["patient_type"] = "existing"

    phone_match = re.search(r'\b\d{7,15}\b', full_user)
    if phone_match:
        state["phone"] = phone_match.group(0)

    for i, a_msg in enumerate(asst_msgs):
        a_low = a_msg.lower()
        if i < len(caller_msgs):
            u_text = caller_msgs[i].strip()
            if "first name" in a_low and not state.get("first_name"):
                name = re.sub(r'^(yes\s+)?(it\'?s\s+|my name is\s+)?', '', u_text, flags=re.IGNORECASE).strip()
                if name and len(name.split()) <= 2:
                    state["first_name"] = name.capitalize()
            if "last name" in a_low and not state.get("last_name"):
                name = re.sub(r'^(it\'?s\s+|my last name is\s+)?', '', u_text, flags=re.IGNORECASE).strip()
                if name and len(name.split()) <= 2:
                    state["last_name"] = name.capitalize()

    if any(k in full_user for k in ["pain", "hurt", "injury", "stiff", "back", "neck", "shoulder", "knee", "spine", "ache", "sore"]):
        state["complaint"] = "reported"

    if state.get("complaint") and any(k in full_user for k in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "tomorrow", "today", "pm", "am", "o'clock"]):
        state["preferred_time"] = "selected"

    for a_msg in asst_msgs:
        if "direct billing" in a_msg.lower() or "insurance" in a_msg.lower():
            state["insurance"] = "discussed"
            break

    return state


def get_system_prompt(state: dict | None = None, messages: list | None = None) -> str:
    if state is None and messages is not None:
        state = extract_state(messages)
    state = state or {}
    now = datetime.now(zoneinfo.ZoneInfo("America/Toronto"))
    collected = {k: v for k, v in state.items() if v} or "nothing yet"
    next_key = next((f for f in ORDER if not state.get(f)), "CONFIRM_AND_BOOK")
    next_step = STEP_DESCRIPTIONS.get(next_key, next_key)

    return (SYSTEM_PROMPT_TEMPLATE
            .replace("{current_date}", now.strftime("%A, %B %d, %Y"))
            .replace("{current_time}", now.strftime("%I:%M %p"))
            .replace("{collected}", str(collected))
            .replace("{next_step}", next_step))
