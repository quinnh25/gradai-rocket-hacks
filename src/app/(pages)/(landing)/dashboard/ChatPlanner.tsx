"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ScheduleOutput } from "@/app/api/schedule/route";
import type { GradPlanOutput } from "./types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Chat {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

interface GeminiMessage {
  role: "user" | "model";
  parts: { text: string }[];
}

function toGeminiHistory(messages: Message[]): GeminiMessage[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function extractJson<T>(content: string, tag: string): T | null {
  const match = content.match(new RegExp("```" + tag + "\\n([\\s\\S]*?)\\n```"));
  if (!match) return null;
  try { return JSON.parse(match[1]) as T; } catch { return null; }
}

function stripJsonBlocks(content: string): string {
  return content
    .replace(/```schedule-json\n[\s\S]*?\n```/g, "")
    .replace(/```gradplan-json\n[\s\S]*?\n```/g, "")
    .trim();
}

const SUGGESTED_PROMPTS = [
  "What should I take next semester?",
  "Plan my remaining semesters until graduation",
  "How close am I to finishing my degree?",
  "What EECS electives do you recommend?",
];

interface ChatPlannerProps {
  userId: string;
  onScheduleData: (data: { weeklySchedule?: ScheduleOutput; gradPlan?: GradPlanOutput }) => void;
}

export default function ChatPlanner({ userId, onScheduleData }: ChatPlannerProps) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadChats(); }, [userId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const loadChats = async () => {
    try {
      const resp = await fetch(`/api/chats?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        setChats(data.chats ?? []);
      }
    } catch { /* silent */ }
    finally { setLoadingChats(false); }
  };

  const selectChat = async (chatId: string) => {
    if (chatId === activeChatId) return;
    setLoadingMessages(true);
    setActiveChatId(chatId);
    setMessages([]);
    setError(null);
    try {
      const resp = await fetch(`/api/chats/${chatId}`);
      if (resp.ok) {
        const data = await resp.json();
        const msgs: Message[] = data.messages ?? [];
        setMessages(msgs);
        // Restore last schedule data from this chat
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role === "assistant") {
            const grad = extractJson<GradPlanOutput>(msgs[i].content, "gradplan-json");
            if (grad) { onScheduleData({ gradPlan: grad }); break; }
          }
        }
      }
    } catch { setError("Failed to load chat."); }
    finally { setLoadingMessages(false); }
  };

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setInput("");
    setError(null);
  };

  const deleteChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(chatId);
    try {
      await fetch(`/api/chats/${chatId}`, { method: "DELETE" });
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) startNewChat();
    } finally { setDeletingId(null); }
  };

  const send = useCallback(async (text?: string) => {
    const messageText = text ?? input.trim();
    if (!messageText || loading) return;

    const userMessage: Message = { role: "user", content: messageText };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const resp = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          message: messageText,
          history: toGeminiHistory(messages),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error ?? `Server error ${resp.status}`);
      }

      // Handle both reply text and optional schedule data returned by build_schedule tool
      const data = await resp.json() as {
        reply: string;
        schedule?: ScheduleOutput;
      };
      const { reply } = data;

      // If build_schedule tool ran, update the weekly calendar panel
      if (data.schedule) {
        onScheduleData({ weeklySchedule: data.schedule });
      }

      // Also check for gradplan-json embedded in the reply text
      const grad = extractJson<GradPlanOutput>(reply, "gradplan-json");
      if (grad) {
        onScheduleData({ gradPlan: grad });
      }

      const finalMessages = [...newMessages, { role: "assistant" as const, content: reply }];
      setMessages(finalMessages);

      const title = messageText.slice(0, 60) + (messageText.length > 60 ? "…" : "");

      if (!activeChatId) {
        const createResp = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, title, messages: finalMessages }),
        });
        if (createResp.ok) {
          const { id } = await createResp.json();
          setActiveChatId(id);
          setChats((prev) => [
            { id, title, updatedAt: new Date().toISOString(), messageCount: finalMessages.length },
            ...prev,
          ]);
        }
      } else {
        await fetch(`/api/chats/${activeChatId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: finalMessages }),
        });
        setChats((prev) =>
          prev.map((c) =>
            c.id === activeChatId
              ? { ...c, updatedAt: new Date().toISOString(), messageCount: finalMessages.length }
              : c
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, userId, activeChatId, onScheduleData]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ── */}
      <div className={`flex flex-col border-r border-gray-100 bg-gray-50 transition-all duration-200 overflow-hidden flex-shrink-0 ${sidebarOpen ? "w-56" : "w-0"}`}>
        {sidebarOpen && (
          <>
            <div className="p-3 border-b border-gray-100">
              <button
                onClick={startNewChat}
                className="w-full flex items-center gap-2 rounded-lg bg-blue-600 text-white px-3 py-2 text-xs font-semibold hover:bg-blue-700 transition-colors"
              >
                <span className="text-base leading-none">+</span>
                New Chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {loadingChats ? (
                <div className="flex items-center justify-center py-8">
                  <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
                </div>
              ) : chats.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8 px-3">No saved chats yet</p>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => selectChat(chat.id)}
                    className={`group relative mx-2 mb-1 rounded-lg px-3 py-2 cursor-pointer transition-colors
                      ${activeChatId === chat.id ? "bg-blue-50 border border-blue-100" : "hover:bg-gray-100"}`}
                  >
                    <p className="text-xs font-medium text-gray-700 truncate pr-5">{chat.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(chat.updatedAt)} · {chat.messageCount} msgs</p>
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all text-xs"
                    >
                      {deletingId === chat.id ? "…" : "✕"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Main ── */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="text-gray-400 hover:text-gray-600 transition-colors text-sm"
          >
            {sidebarOpen ? "◀" : "▶"}
          </button>
          <span className="text-xs text-gray-400 font-medium">
            {activeChatId ? chats.find((c) => c.id === activeChatId)?.title ?? "Chat" : "New Chat"}
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loadingMessages ? (
            <div className="flex items-center justify-center h-full gap-2 text-gray-400 text-sm">
              <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
              Loading chat…
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8">
              <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-2xl">🎓</div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Ask GradAI anything</p>
                <p className="text-xs text-gray-400 mt-1">
                  I can check requirements, suggest courses, and build your schedule automatically.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => send(prompt)}
                    className="text-xs bg-gray-100 hover:bg-blue-50 hover:text-blue-700 text-gray-600 border border-gray-200 hover:border-blue-200 rounded-full px-3 py-1.5 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold mr-2 mt-1 flex-shrink-0">
                    G
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm
                  ${m.role === "user"
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none
                      prose-headings:font-bold prose-headings:text-gray-800
                      prose-p:leading-relaxed prose-p:my-1
                      prose-ul:my-1 prose-li:my-0.5
                      prose-table:text-xs prose-table:border-collapse
                      prose-th:bg-gray-200 prose-th:px-2 prose-th:py-1 prose-th:border prose-th:border-gray-300
                      prose-td:px-2 prose-td:py-1 prose-td:border prose-td:border-gray-300
                      prose-code:bg-gray-200 prose-code:px-1 prose-code:rounded
                      prose-strong:text-gray-900">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {stripJsonBlocks(m.content)}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold mr-2 mt-1 flex-shrink-0">G</div>
              <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-center text-xs text-red-500 font-mono">{error}</p>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your schedule, requirements, or courses…"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 max-h-32"
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${target.scrollHeight}px`;
              }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="rounded-xl bg-blue-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              Send
            </button>
          </div>
          <p className="text-[10px] text-gray-300 text-center mt-2">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
