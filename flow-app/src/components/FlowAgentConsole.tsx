"use client";

import { useEffect, useRef, useState } from "react";
import {
  AgentCommand,
  COMMAND_COST,
  useFlow,
} from "@/store";

/** Parse a chat line into an agent command. */
export function parseCommand(input: string, ids: string[]): AgentCommand {
  const t = input.trim();
  const lower = t.toLowerCase();
  if (/^group\b/.test(lower)) {
    const m = lower.match(/^group\s+(?:into|as)\s+(.+)$/);
    return {
      op: "group",
      args: m ? t.slice(t.toLowerCase().indexOf(m[1])) : "",
      ids,
    };
  }
  if (/^sort/.test(lower)) {
    const m = lower.match(/^sort\s+(?:by\s+)?(.+)$/);
    return { op: "sort", args: m?.[1] ?? "", ids };
  }
  if (/^rename/.test(lower)) {
    const m = lower.match(/^rename\s+(?:to\s+)?(.+)$/);
    return { op: "rename", args: m ? t.slice(t.toLowerCase().indexOf(m[1])) : "", ids };
  }
  if (/^archive\b/.test(lower)) return { op: "archive", args: "", ids };
  if (/^(unarchive|restore)\b/.test(lower)) return { op: "unarchive", args: "", ids };
  return { op: "noop", args: t, ids };
}

export default function FlowAgentConsole({ mobile = false }: { mobile?: boolean }) {
  const messages = useFlow((s) => s.agentMessages);
  const selectedIds = useFlow((s) => s.selectedIds);
  const cards = useFlow((s) => s.cards);
  const confirmGate = useFlow((s) => s.confirmGate);
  const credits = useFlow((s) => s.credits);
  const pushAgentMessage = useFlow((s) => s.pushAgentMessage);
  const executeAgent = useFlow((s) => s.executeAgent);
  const confirmAgent = useFlow((s) => s.confirmAgent);
  const cancelAgent = useFlow((s) => s.cancelAgent);

  const [input, setInput] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages.length]);

  const attachSelection = () =>
    setAttached((a) => [...new Set([...a, ...selectedIds])]);

  const submit = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const ids = attached.length ? attached : selectedIds;
    const cmd = parseCommand(text, ids);
    setAttached([]);
    pushAgentMessage({ role: "user", text, credits: 0 });
    const cost = COMMAND_COST[cmd.op];
    if (confirmGate && cmd.op !== "noop" && cost > 0) {
      pushAgentMessage({
        role: "agent",
        text: `Ready to run \u201c${cmd.op}\u201d on ${cmd.ids.length || "the current"} selection — cost ${cost} cr. Confirm?`,
        credits: 0,
        pending: cmd,
      });
    } else {
      const result = executeAgent(cmd);
      if (cost > 0) useFlow.setState((s) => ({ credits: s.credits - cost }));
      pushAgentMessage({ role: "agent", text: result, credits: -cost });
    }
  };

  const attachedCards = cards.filter((c) => attached.includes(c.id));

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel" role="complementary" aria-label="Flow agent console">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Flow Agent
        </h2>
        <span className="rounded-full border border-edge px-2 py-0.5 text-[10px] text-zinc-500">
          {credits} cr
        </span>
      </div>

      {/* chat log */}
      <div ref={logRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" aria-live="polite">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[92%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-accent/20 text-zinc-100"
                : "bg-raise text-zinc-300"
            }`}
          >
            <p>{m.text}</p>
            <div className="mt-1 flex items-center gap-2">
              {m.credits !== 0 && (
                <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-accent2">
                  {m.credits} cr
                </span>
              )}
              {m.pending && (
                <span className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => confirmAgent(m.id)}
                    className={`rounded bg-accent px-2 py-1 text-[10px] font-medium text-white ${mobile ? "min-h-[32px]" : ""}`}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelAgent(m.id)}
                    className={`rounded border border-edge px-2 py-1 text-[10px] text-zinc-400 ${mobile ? "min-h-[32px]" : ""}`}
                  >
                    Cancel
                  </button>
                </span>
              )}
              {m.executed === false && (
                <span className="text-[10px] text-zinc-600">cancelled</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* attach chips */}
      {attachedCards.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-edge px-3 pt-2">
          {attachedCards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setAttached((a) => a.filter((id) => id !== c.id))}
              className="flex items-center gap-1 rounded-full bg-raise px-2 py-1 text-[10px] text-zinc-300 hover:bg-faint"
              aria-label={`Remove attachment ${c.prompt}`}
            >
              <span className="max-w-[120px] truncate">{c.prompt}</span>✕
            </button>
          ))}
        </div>
      )}

      {/* input */}
      <div className="border-t border-edge p-2">
        <div className="mb-1.5 flex gap-1.5">
          <button
            type="button"
            onClick={attachSelection}
            disabled={!selectedIds.length}
            className="rounded-md border border-edge px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200 disabled:opacity-40"
          >
            + Attach selection ({selectedIds.length})
          </button>
          <span className="ml-auto self-center text-[10px] text-zinc-600">
            {confirmGate ? "confirm-gated" : "autonomous"}
          </span>
        </div>
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder='Try "group", "sort by duration", "archive"…'
            aria-label="Agent command input"
            className="min-w-0 flex-1 rounded-md border border-edge bg-ink px-2.5 py-2 text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-accent"
          />
          <button
            type="button"
            onClick={submit}
            aria-label="Send command"
            className={`rounded-md bg-accent px-3 text-xs font-medium text-white ${mobile ? "min-h-[48px] min-w-[48px]" : ""}`}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
