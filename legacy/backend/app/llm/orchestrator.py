import json
import os
import re
from typing import AsyncIterator

import httpx
from sqlmodel import Session

from app.llm.prompts import SYSTEM_PROMPT
from app.llm.tools import TOOL_SCHEMAS, execute_tool

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MAX_ROUNDS = 20


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


async def run_recommendation_stream(
    messages: list[dict],
    model: str,
    session: Session,
) -> AsyncIterator[str]:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        yield _sse({"type": "error", "message": "OPENROUTER_API_KEY not configured"})
        return

    full_messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}] + list(messages)

    for round_num in range(MAX_ROUNDS):
        # Buffers for this round
        accumulated_text = ""
        tool_call_buffers: dict[int, dict] = {}
        finish_reason: str | None = None

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "messages": full_messages,
                        "tools": TOOL_SCHEMAS,
                        "stream": True,
                    },
                ) as resp:
                    if resp.status_code != 200:
                        body = await resp.aread()
                        yield _sse({
                            "type": "error",
                            "message": f"OpenRouter returned {resp.status_code}: {body[:200].decode('utf-8', errors='replace')}",
                        })
                        return

                    # Read the streaming SSE response
                    line_buffer = ""
                    async for chunk in resp.aiter_text():
                        line_buffer += chunk
                        # Process complete SSE events (delimited by \n\n)
                        while "\n\n" in line_buffer:
                            event_block, line_buffer = line_buffer.split("\n\n", 1)
                            for line in event_block.splitlines():
                                if not line.startswith("data: "):
                                    continue
                                data_str = line[6:].strip()
                                if data_str == "[DONE]":
                                    break
                                try:
                                    payload = json.loads(data_str)
                                except json.JSONDecodeError:
                                    continue

                                choice = (payload.get("choices") or [{}])[0]
                                delta = choice.get("delta") or {}
                                fr = choice.get("finish_reason")
                                if fr:
                                    finish_reason = fr

                                # Text content — forward immediately
                                content = delta.get("content")
                                if content:
                                    accumulated_text += content
                                    yield _sse({"type": "text_delta", "delta": content})

                                # Tool calls — accumulate fragments
                                for tc_delta in delta.get("tool_calls") or []:
                                    idx = tc_delta.get("index", 0)
                                    if idx not in tool_call_buffers:
                                        tool_call_buffers[idx] = {
                                            "id": tc_delta.get("id", ""),
                                            "type": "function",
                                            "function": {
                                                "name": (tc_delta.get("function") or {}).get("name", ""),
                                                "arguments": "",
                                            },
                                        }
                                    else:
                                        if tc_delta.get("id"):
                                            tool_call_buffers[idx]["id"] = tc_delta["id"]
                                        fn = tc_delta.get("function") or {}
                                        if fn.get("name"):
                                            tool_call_buffers[idx]["function"]["name"] = fn["name"]
                                    fn = tc_delta.get("function") or {}
                                    tool_call_buffers[idx]["function"]["arguments"] += fn.get("arguments", "")

        except httpx.RequestError as exc:
            yield _sse({"type": "error", "message": f"Request failed: {exc}"})
            return

        # --- Process end of this round ---

        if finish_reason == "tool_calls" and tool_call_buffers:
            # Emit tool_call events and execute each tool
            tool_calls_list = [tool_call_buffers[i] for i in sorted(tool_call_buffers)]

            for tc in tool_calls_list:
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    fn_args = {}
                yield _sse({"type": "tool_call", "name": fn_name, "args": fn_args})

            # Append assistant message with tool_calls
            full_messages.append({
                "role": "assistant",
                "content": accumulated_text or None,
                "tool_calls": tool_calls_list,
            })

            # Execute tools and append results
            for tc in tool_calls_list:
                fn_name = tc["function"]["name"]
                try:
                    fn_args = json.loads(tc["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    fn_args = {}
                result = await execute_tool(fn_name, fn_args, session)
                full_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })

            # Continue to next round
            continue

        # finish_reason == "stop" (or stream ended without tool calls)
        # Extract recipe_ids from the accumulated text
        match = re.search(r'\{"recipe_ids"\s*:\s*\[([^\]]*)\]\s*\}', accumulated_text)
        if match:
            try:
                parsed = json.loads(match.group(0))
                ids = [int(i) for i in parsed.get("recipe_ids", [])]
                if ids:
                    yield _sse({"type": "recipe_ids", "ids": ids})
            except (json.JSONDecodeError, ValueError):
                pass

        yield _sse({"type": "done"})
        return

    # Exceeded MAX_ROUNDS without a stop
    yield _sse({"type": "error", "message": "Exceeded maximum tool-call rounds. Please try again."})
