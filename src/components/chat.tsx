"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ToolActivity {
  tool: string;
  timestamp: number;
}

const TOOL_LABELS: Record<string, string> = {
  list_contacts: "Listing contacts",
  get_contact: "Looking up contact",
  create_contact: "Creating contact",
  update_contact: "Updating contact",
  delete_contact: "Deleting contact",
  enrich_contact: "Enriching from LinkedIn",
  list_templates: "Listing templates",
  create_template: "Creating template",
  update_template: "Updating template",
  delete_template: "Deleting template",
  list_campaigns: "Listing campaigns",
  create_campaign: "Creating campaign",
  get_campaign: "Looking up campaign",
  update_campaign: "Updating campaign",
  delete_campaign: "Deleting campaign",
  generate_campaign_drafts: "Generating campaign drafts",
  list_drafts: "Listing drafts",
  get_draft: "Looking up draft",
  update_draft: "Updating draft",
  delete_draft: "Deleting draft",
  send_email: "Sending email",
  get_email_threads: "Fetching email threads",
};

export default function Chat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolActivity, setToolActivity] = useState<ToolActivity | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolActivity]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setToolActivity(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed (${res.status})`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let assistantText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "text") {
              assistantText += event.text;
              setMessages([
                ...newMessages,
                { role: "assistant", content: assistantText },
              ]);
              setToolActivity(null);
            } else if (event.type === "tool_call") {
              setToolActivity({
                tool: event.tool,
                timestamp: Date.now(),
              });
            } else if (event.type === "done") {
              setToolActivity(null);
            } else if (event.type === "error") {
              assistantText += `\n\nError: ${event.error}`;
              setMessages([
                ...newMessages,
                { role: "assistant", content: assistantText },
              ]);
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }

      if (!assistantText) {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: "Done! (No additional message)",
          },
        ]);
      }
    } catch (error) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: `Sorry, something went wrong: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ]);
    }

    setLoading(false);
    setToolActivity(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg transition-transform hover:scale-105 hover:bg-zinc-800"
        aria-label="Open chat"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex w-[420px] flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl"
      style={{ height: "min(600px, calc(100vh - 48px))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="text-sm font-semibold">EmailBotemis Assistant</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Close chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 mb-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-zinc-700 mb-1">How can I help?</p>
            <p className="text-xs text-zinc-400 max-w-[280px]">
              I can manage your contacts, campaigns, templates, and drafts. Try &quot;List my contacts&quot; or &quot;Create a campaign called Winter Outreach&quot;.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-800"
              }`}
            >
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && toolActivity && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-xl bg-zinc-50 border border-zinc-100 px-3.5 py-2.5 text-sm text-zinc-500">
              <div className="h-3.5 w-3.5 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
              {TOOL_LABELS[toolActivity.tool] || toolActivity.tool}...
            </div>
          </div>
        )}

        {loading && !toolActivity && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3.5 py-2.5">
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-100 px-3 py-3"
      >
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask me anything..."
            disabled={loading}
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            aria-label="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
