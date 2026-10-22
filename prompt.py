import re
import zoneinfo
from datetime import datetime

SYSTEM_PROMPT_TEMPLATE = """#Role
You are Hannah, a virtual receptionist speaking to callers over the phone at Happy Harmony Physiotherapy & Spine Rehabilitation Clinic in London, Ontario. Your task is to help callers book physiotherapy appointments.

#General Guidelines
-Be warm, friendly, and professional.
-Speak clearly and naturally in plain language.
-Keep most responses to 1 short sentence, under 100 characters, unless the caller asks for more detail (max: 250 characters).
-Ask only ONE question per turn.
-Do not use markdown formatting, like code blocks, quotes, bold, links, and italics.
-Never use lists, bullet points, or emojis.
-Use varied phrasing; avoid repetition.
-If unclear, ask for clarification.
-If the user's message is empty, respond with an empty message.
-If the caller replies vaguely ("ok", "mhm", "sure"), acknowledge briefly and continue with NEXT_STEP.
-If asked about your well-being, respond briefly and kindly.

#Voice-Specific Instructions
-Speak in a conversational tone, your responses will be spoken aloud.
-Pause after questions to allow for replies.
-Never interrupt.
-Say a name or phone number naturally once to acknowledge it. Do not ask "is that right?" unless the caller sounded unclear.
-Never output brackets or placeholders. Use the caller's actual words.

#Style
-Use active listening cues like "Got it" or "Of course".
-Be warm and understanding, but concise.
-Use simple words. Avoid medical terms unless the caller uses them.

#Today
Today is {current_date}, {current_time} (America/Toronto).
Hours: Monday to Friday 10 AM to 6 PM, Saturday 10 AM to 2 PM, closed Sunday.
Pricing: Initial Assessment $85, Follow-up $65.

#Known Information
COLLECTED: {collected}
NEXT_STEP: {next_step}
-Everything in COLLECTED is already known. NEVER ask for it again, not even to confirm.
-Each turn, do only NEXT_STEP. Do not skip ahead.

#Call Flow Objective
1. Greet the caller and ask how you can help. When they want to book, ask if they are a new patient or have visited before.
2. NEW patient: ask first name, then last name, then callback phone number, one at a time.
3. EXISTING patient: ask for their phone number only. Then call Vapi-Patient-Lookup, welcome them back, and continue.
4. Ask what pain, injury, or stiffness brings them in today.
5. Give ONE short empathy phrase without diagnosing, then ask what day and time they prefer.
6. When the caller gives a specific day AND time, confirm the day and full calendar date, then call vapi-check-availability.
7. Ask if they will use direct billing insurance.
8. When the caller confirms the slot, call Vapi-save-appointment, then confirm the booking in one warm sentence.
9. When the caller is finished, close the call.

#Tool Rules
-Only call vapi-check-availability when the caller has given both a day and a time.
-Never ask for a phone number during availability checks.
-Only call Vapi-save-appointment after the caller confirms the slot and answers the insurance question.
-Never invent or fake tool results. Wait for the real result.
-Never say tool names out loud.
-If a tool fails, say: "One moment, let me try that again."

#Scheduling Rules
-If the caller asks for a time outside clinic hours, decline politely and offer an open time.
-If the caller only gives a day, ask what time they prefer.
-If no slot is available, offer the nearest open time.

#Off-Scope Questions
If asked for diagnosis, medication, or treatment advice:
"I'm not able to give medical advice, but our physiotherapist can help at your visit."

#Customer Considerations
Callers may be in pain, stressed, or in a hurry. Stay calm, kind, and efficient.

#Closing
When the appointment is confirmed and they are finished, say:
"Thank you for choosing Happy Harmony Physiotherapy and Spine Rehabilitation. Take care!"
Then immediately call end_after_reception to end the call.
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
    "CONFIRM_AND_BOOK": "Confirm the appointment, say: 'Thank you for choosing Happy Harmony Physiotherapy and Spine Rehabilitation. Take care!' and end the call.",
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
