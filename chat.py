import sys
import asyncio
import json
from prompt import get_system_prompt, OPENING_GREETING
from tools import execute_tool
from app import query_brain

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

async def main():
    print("=" * 60)
    print("Happy Harmony Clinic - Receptionist Terminal Simulator")
    print("Talking directly to Liquid AI LFM on your VPS (209.126.1.68)")
    print("Type 'exit' or 'quit' to stop.")
    print("=" * 60 + "\n")

    messages = [{"role": "system", "content": get_system_prompt()}]

    # Hannah speaks first
    print(f"Hannah: {OPENING_GREETING}\n")
    messages.append({"role": "assistant", "content": OPENING_GREETING})

    while True:
        try:
            user_input = input("Caller: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nCall ended.")
            break

        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit"):
            print("Call ended.")
            break

        messages.append({"role": "user", "content": user_input})

        import time
        turn_start = time.time()

        # Update system prompt with dynamically extracted state
        messages[0]["content"] = get_system_prompt(messages=messages)

        # LLM completion loop handling tool calls
        while True:
            t0 = time.time()
            ai_msg = await query_brain(messages)
            llm_ms = (time.time() - t0) * 1000
            messages.append(ai_msg)

            tool_calls = ai_msg.get("tool_calls")
            if not tool_calls:
                reply = ai_msg.get("content", "").strip()
                import re
                reply = re.sub(r'^(Hannah|Assistant):\s*', '', reply, flags=re.IGNORECASE)
                reply = re.sub(r'\[.*?\]', '', reply).strip()
                total_ms = (time.time() - turn_start) * 1000
                if reply:
                    print(f"\nHannah: {reply}  (⏱️ {total_ms/1000:.2f}s latency)\n")
                break

            for tool in tool_calls:
                fn = tool.get("function", {})
                fn_name = fn.get("name")
                try:
                    fn_args = json.loads(fn.get("arguments", "{}"))
                except Exception:
                    fn_args = {}

                print(f"\n[Tool Executing: {fn_name}({json.dumps(fn_args)})]")
                t_tool = time.time()
                result = execute_tool(fn_name, fn_args)
                tool_ms = (time.time() - t_tool) * 1000
                print(f"[Tool Result: {json.dumps(result)} | ⏱️ Webhook: {tool_ms:.0f}ms]")

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool.get("id", "call_1"),
                    "name": fn_name,
                    "content": json.dumps(result)
                })

                if fn_name == "end_after_reception":
                    print("\n[Call Disconnected by Receptionist]")
                    return

if __name__ == "__main__":
    asyncio.run(main())
