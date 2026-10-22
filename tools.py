import os
import json
import logging
from datetime import datetime
import httpx
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger("voice_agent.tools")

# In-memory storage for appointments and mock patient records
PATIENT_DB = {
    "15483914156": {"name": "Jane Doe", "phone": "15483914156", "last_visit": "2026-08-10"},
    "03302817151": {"name": "John Smith", "phone": "03302817151", "last_visit": "2026-09-14"}
}

BOOKED_SLOTS = set()
SAVED_APPOINTMENTS = []

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "vapi-check-availability",
            "description": "Checks clinic availability for an appointment date (and optional time). Call this whenever the caller asks for available slots, free times, or proposes a date or time.",
            "parameters": {
                "type": "object",
                "properties": {
                    "appointment_date": {
                        "type": "string",
                        "description": "Appointment date in YYYY-MM-DD format (resolve relative days like 'Wednesday' against current date)."
                    },
                    "appointment_time": {
                        "type": "string",
                        "description": "Requested time within clinic hours (e.g. '3:00 PM'), or empty string if checking open slots for that day."
                    }
                },
                "required": ["appointment_date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "Vapi-Patient-Lookup",
            "description": "Looks up an existing patient record using their digits-only phone number.",
            "parameters": {
                "type": "object",
                "properties": {
                    "phone": {
                        "type": "string",
                        "description": "Normalized phone number with digits only (no spaces, hyphens, or punctuation)."
                    }
                },
                "required": ["phone"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "Vapi-save-appointment",
            "description": "Saves and confirms the booked appointment for a patient.",
            "parameters": {
                "type": "object",
                "properties": {
                    "patient_name": {"type": "string", "description": "Full name of the patient."},
                    "phone": {"type": "string", "description": "Normalized digits-only callback phone number."},
                    "area_of_concern": {"type": "string", "description": "Brief description of the pain or injury."},
                    "appointment_day": {"type": "string", "description": "Day of the week (e.g. 'Monday', 'Tuesday')."},
                    "appointment_date": {"type": "string", "description": "Date in YYYY-MM-DD format."},
                    "appointment_time": {"type": "string", "description": "Appointment time."},
                    "insurance_company": {"type": "string", "description": "Normalized insurance company name or 'None'."}
                },
                "required": [
                    "patient_name", "phone", "area_of_concern",
                    "appointment_day", "appointment_date", "appointment_time", "insurance_company"
                ]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "end_after_reception",
            "description": "Ends the phone call after the final closing statement has been spoken.",
            "parameters": {
                "type": "object",
                "properties": {}
            }
        }
    }
]

def execute_tool(name: str, args_dict: dict) -> dict:
    """Executes the requested tool and returns the result dictionary."""
    logger.info("Executing tool: %s with args: %s", name, args_dict)

    # 1. Forward to n8n Webhook if configured
    target_url = None
    lookup_url = os.getenv("N8N_LOOKUP_URL", "").strip() or os.getenv("N8N_WEBHOOK_URL", "").strip()
    avail_url = os.getenv("N8N_AVAILABILITY_URL", "").strip() or os.getenv("N8N_WEBHOOK_URL", "").strip()
    save_url = os.getenv("N8N_SAVE_URL", "").strip() or os.getenv("N8N_WEBHOOK_URL", "").strip()

    if name == "Vapi-Patient-Lookup":
        target_url = lookup_url
    elif name == "vapi-check-availability":
        target_url = avail_url
    elif name == "Vapi-save-appointment":
        target_url = save_url

    if target_url:
        try:
            # Send flat fields + parameters object for compatibility with any n8n node
            payload = {
                **args_dict,
                "tool": name,
                "parameters": args_dict
            }
            with httpx.Client(timeout=8.0) as client:
                res = client.post(target_url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                        data = data[0]
                    logger.info("n8n response for %s: %s", name, data)
                    return data
                logger.warning("n8n webhook returned status %s: %s", res.status_code, res.text)
        except Exception as e:
            logger.error("n8n webhook connection failed for %s: %s", name, e)

    # 2. Local Fallback handlers (in-memory mock DB)
    if name == "vapi-check-availability":
        date_str = args_dict.get("appointment_date", "")
        time_str = args_dict.get("appointment_time", "").strip()

        # Check valid day of week
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
            if dt.weekday() == 6:  # Sunday
                return {"status": "unavailable", "reason": "Clinic is closed on Sundays."}
        except ValueError:
            return {"status": "unavailable", "reason": "Invalid date format, must be YYYY-MM-DD."}

        if not time_str:
            return {"status": "available", "appointment_date": date_str, "available_slots": ["10:30 AM", "2:00 PM", "4:30 PM"]}

        slot_key = f"{date_str}@{time_str.lower()}"
        if slot_key in BOOKED_SLOTS:
            return {"status": "unavailable", "reason": "Slot is already booked."}
        
        return {"status": "available", "appointment_date": date_str, "appointment_time": time_str}

    elif name == "Vapi-Patient-Lookup":
        phone = "".join(filter(str.isdigit, args_dict.get("phone", "")))
        patient = PATIENT_DB.get(phone)
        if patient:
            return {"found": True, "patient": patient}
        return {"found": False, "message": "No matching record found for this phone number."}

    elif name == "Vapi-save-appointment":
        date_str = args_dict.get("appointment_date", "")
        time_str = args_dict.get("appointment_time", "").strip()
        slot_key = f"{date_str}@{time_str.lower()}"
        BOOKED_SLOTS.add(slot_key)
        
        booking_record = {
            "id": f"APPT-{len(SAVED_APPOINTMENTS) + 101}",
            "patient_name": args_dict.get("patient_name"),
            "phone": args_dict.get("phone"),
            "area_of_concern": args_dict.get("area_of_concern"),
            "appointment_day": args_dict.get("appointment_day"),
            "appointment_date": date_str,
            "appointment_time": time_str,
            "insurance_company": args_dict.get("insurance_company", "None")
        }
        SAVED_APPOINTMENTS.append(booking_record)
        return {"status": "success", "booking": booking_record}

    elif name == "end_after_reception":
        return {"status": "call_ended", "message": "Call termination acknowledged."}

    return {"status": "error", "message": f"Unknown tool: {name}"}

def get_active_tools(messages: list) -> list:
    """Dynamically exposes tools based on conversational state.
    Prevents models from prematurely calling tools before caller is ready."""
    import re
    caller_messages = [
        m.get("content", "") for m in messages
        if m.get("role") == "user" and isinstance(m.get("content"), str)
    ]
    caller_text = " ".join(caller_messages).lower()
    last_user_msg = caller_messages[-1].lower() if caller_messages else ""

    active = []

    # Patient lookup: available if caller provided phone digits or asks to look up record
    has_phone_digits = bool(re.search(r'\d{3,}', caller_text))
    is_existing = any(k in caller_text for k in ["existing", "visited", "been here", "before", "look up", "lookup"])
    if has_phone_digits or is_existing:
        active.append(TOOL_DEFINITIONS[1])  # Vapi-Patient-Lookup

    # Availability check: available whenever caller asks for a time, day, or slot
    has_time_or_day = any(k in caller_text for k in [
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
        "tomorrow", "today", "am", "pm", "morning", "afternoon", "evening", "o'clock",
        ":", "at 1", "at 2", "at 3", "at 4", "at 5", "at 6", "at 7", "at 8", "at 9", "at 10", "at 11", "at 12",
        "slot", "available", "schedule", "open"
    ])
    if has_time_or_day:
        active.append(TOOL_DEFINITIONS[0])  # vapi-check-availability

    # Save appointment: available once availability was checked OR if caller confirms booking
    avail_checked = any(
        m.get("role") == "tool" and ("availability" in m.get("name", "") or "status" in m.get("content", ""))
        for m in messages
    )
    confirms_booking = any(k in last_user_msg for k in ["yes", "yeah", "yep", "sure", "book", "confirm", "proceed", "okay", "ok", "please do", "done"])
    if avail_checked or confirms_booking:
        active.append(TOOL_DEFINITIONS[2])  # Vapi-save-appointment

    # End call: available when caller indicates they are done or leaving
    if any(k in last_user_msg for k in ["bye", "goodbye", "that's all", "thats all", "no that", "nothing else", "all set", "thanks", "thank you"]):
        active.append(TOOL_DEFINITIONS[3])  # end_after_reception

    return active

