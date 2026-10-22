import json
from prompt import get_system_prompt, OPENING_GREETING, ORDER
from tools import execute_tool, TOOL_DEFINITIONS, BOOKED_SLOTS, SAVED_APPOINTMENTS, get_active_tools
from fastapi.testclient import TestClient
from app import app

def test_prompt_generation_default():
    prompt = get_system_prompt()
    assert "America/Toronto" in prompt
    assert "Hannah" in prompt
    assert "Happy Harmony Physiotherapy" in prompt
    assert "COLLECTED: nothing yet" in prompt
    assert "NEXT_STEP: Ask: \"Are you a new patient" in prompt
    assert len(OPENING_GREETING) > 10

def test_prompt_generation_with_state():
    state = {
        "patient_type": "new",
        "first_name": "Mahad"
    }
    prompt = get_system_prompt(state)
    assert "'patient_type': 'new'" in prompt
    assert "'first_name': 'Mahad'" in prompt
    assert "last name" in prompt.lower()

    full_state = {k: "done" for k in ORDER}
    full_prompt = get_system_prompt(full_state)
    assert "Vapi-save-appointment" in full_prompt

def test_tool_definitions():
    tool_names = [t["function"]["name"] for t in TOOL_DEFINITIONS]
    assert "vapi-check-availability" in tool_names
    assert "Vapi-Patient-Lookup" in tool_names
    assert "Vapi-save-appointment" in tool_names
    assert "end_after_reception" in tool_names

def test_get_active_tools():
    # Empty message: no tools
    assert len(get_active_tools([])) == 0

    # User mentions phone digits: lookup active
    tools_phone = get_active_tools([{"role": "user", "content": "my phone is 03302817162"}])
    assert any(t["function"]["name"] == "Vapi-Patient-Lookup" for t in tools_phone)

    # User mentions scheduling a day or time: availability active
    tools_avail = get_active_tools([{"role": "user", "content": "free slots on wednesday"}])
    assert any(t["function"]["name"] == "vapi-check-availability" for t in tools_avail)

    # User confirms: save active
    tools_save = get_active_tools([{"role": "user", "content": "yes that slot works"}])
    assert any(t["function"]["name"] == "Vapi-save-appointment" for t in tools_save)

    # User says goodbye: end active
    tools_end = get_active_tools([{"role": "user", "content": "thank you bye"}])
    assert any(t["function"]["name"] == "end_after_reception" for t in tools_end)

def test_tools_execution():
    # 1. Availability check (supports both live n8n and mock fallback)
    avail_res = execute_tool("vapi-check-availability", {"appointment_date": "2026-10-21", "appointment_time": "10:00 AM"})
    assert "results" in avail_res or avail_res.get("status") == "available"

    # 2. Patient lookup (supports both live n8n and mock fallback)
    lookup_res = execute_tool("Vapi-Patient-Lookup", {"phone": "+1 (548) 391-4156"})
    assert "results" in lookup_res or "found" in lookup_res or "patient" in lookup_res

    # 3. Save appointment
    save_res = execute_tool("Vapi-save-appointment", {
        "patient_name": "Jane Doe",
        "phone": "15483914156",
        "area_of_concern": "Lower back pain",
        "appointment_day": "Wednesday",
        "appointment_date": "2026-10-21",
        "appointment_time": "10:00 AM",
        "insurance_company": "Sun Life"
    })
    assert "results" in save_res or save_res.get("status") == "success"

    # 4. End call
    end_res = execute_tool("end_after_reception", {})
    assert end_res["status"] == "call_ended"

def test_api_routes():
    client = TestClient(app)
    # 1. Health check
    res = client.get("/")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    # 2. Simulator HTML page
    sim_res = client.get("/simulator")
    assert sim_res.status_code == 200
    assert "Hannah Voice AI Simulator" in sim_res.text

    # 3. Incoming call TwiML
    twiml_res = client.post("/incoming-call")
    assert twiml_res.status_code == 200
    assert "<Stream" in twiml_res.text
    assert "/media-stream" in twiml_res.text

if __name__ == "__main__":
    test_prompt_generation_default()
    test_prompt_generation_with_state()
    test_tool_definitions()
    test_get_active_tools()
    test_tools_execution()
    test_api_routes()
    print("All verification tests passed successfully!")
