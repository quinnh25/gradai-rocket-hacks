"use client";

import { useState, useEffect } from "react";
import WeeklyCalendar from "./WeeklyCalendar";
import type { ScheduleOutput } from "@/app/api/schedule/route";

interface SavedSchedule {
  id: string;
  title: string;
  termLabel: string;
  totalCredits: number;
  createdAt: string;
}

interface SchedulePanelProps {
  userId: string;
  schedule: ScheduleOutput | null;
  onSchedule: (s: ScheduleOutput | null) => void;
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

export default function SchedulePanel({ userId, schedule, onSchedule }: SchedulePanelProps) {
  const [saved, setSaved] = useState<SavedSchedule[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    loadSaved();
  }, [userId]);

  // Auto-save whenever a new schedule arrives from the AI
  useEffect(() => {
    if (schedule) {
      saveSchedule(schedule);
    }
  }, [schedule]);

  const loadSaved = async () => {
    try {
      const resp = await fetch(`/api/schedules?userId=${userId}`);
      if (resp.ok) {
        const data = await resp.json();
        setSaved(data.schedules ?? []);
      }
    } catch { /* silent */ }
    finally { setLoadingSaved(false); }
  };

  const saveSchedule = async (s: ScheduleOutput) => {
    setSavingCurrent(true);
    try {
      const resp = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, schedule: s }),
      });
      if (resp.ok) {
        const { id, title } = await resp.json();
        setActiveId(id);
        setSaved((prev) => [
          { id, title, termLabel: s.termLabel, totalCredits: s.totalCredits, createdAt: new Date().toISOString() },
          ...prev,
        ]);
      }
    } catch { /* silent */ }
    finally { setSavingCurrent(false); }
  };

  const selectSaved = async (id: string) => {
    if (id === activeId) return;
    try {
      const resp = await fetch(`/api/schedules/${id}`);
      if (resp.ok) {
        const data = await resp.json();
        setActiveId(id);
        onSchedule(data.schedule);
      }
    } catch { /* silent */ }
  };

  const deleteSaved = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      setSaved((prev) => prev.filter((s) => s.id !== id));
      if (activeId === id) {
        setActiveId(null);
        onSchedule(null);
      }
    } finally { setDeletingId(null); }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-800">📅 Weekly Schedule</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {schedule
              ? `${schedule.termLabel} · ${schedule.totalCredits} credits · conflict-free${savingCurrent ? " · saving…" : ""}`
              : "Ask GradAI to build your schedule in the chat"}
          </p>
        </div>
        <button
          onClick={() => setSidebarOpen((o) => !o)}
          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1 transition-colors"
          title="Toggle saved schedules"
        >
          {sidebarOpen ? "Hide Saved" : "Saved"}
          {saved.length > 0 && (
            <span className="ml-1 bg-blue-100 text-blue-600 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
              {saved.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex overflow-hidden">
        {/* Saved schedules sidebar */}
        {sidebarOpen && (
          <div className="w-44 flex-shrink-0 border-r border-gray-100 bg-gray-50 flex flex-col">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-2">
              Saved Schedules
            </p>
            <div className="flex-1 overflow-y-auto pb-2">
              {loadingSaved ? (
                <div className="flex justify-center pt-6">
                  <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
                </div>
              ) : saved.length === 0 ? (
                <p className="text-[10px] text-gray-400 text-center px-3 pt-4">
                  No saved schedules yet
                </p>
              ) : (
                saved.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => selectSaved(s.id)}
                    className={`group relative mx-2 mb-1 rounded-lg px-2.5 py-2 cursor-pointer transition-colors
                      ${activeId === s.id ? "bg-blue-50 border border-blue-100" : "hover:bg-gray-100"}`}
                  >
                    <p className="text-[11px] font-semibold text-gray-700 truncate pr-4">
                      {s.termLabel}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {s.totalCredits} cr · {timeAgo(s.createdAt)}
                    </p>
                    <button
                      onClick={(e) => deleteSaved(s.id, e)}
                      className="absolute right-1.5 top-1.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all text-[10px]"
                    >
                      {deletingId === s.id ? "…" : "✕"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Calendar or empty state */}
        <div className="flex-1 min-w-0">
          {schedule ? (
            <WeeklyCalendar schedule={schedule} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-xl mb-3">📅</div>
              <p className="text-sm font-medium text-gray-600">No schedule yet</p>
              <p className="text-xs text-gray-400 mt-1 max-w-48">
                Ask GradAI: <span className="italic">"Build my Fall 2026 schedule, no classes before 9am"</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
