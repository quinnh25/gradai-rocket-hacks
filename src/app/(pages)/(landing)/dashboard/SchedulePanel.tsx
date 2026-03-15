"use client";

import { useState } from "react";
import WeeklyCalendar from "./WeeklyCalendar";
import type { ScheduleOutput } from "@/app/api/schedule/route";

interface SchedulePanelProps {
  userId: string;
  schedule: ScheduleOutput | null;
  onSchedule: (s: ScheduleOutput | null) => void;
}

export default function SchedulePanel({ userId, schedule, onSchedule }: SchedulePanelProps) {
  const [term, setTerm] = useState<"2570" | "2610">("2570");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, term }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Failed to generate schedule");
      onSchedule(data.schedule);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-800">📅 Weekly Schedule</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {schedule
              ? `${schedule.termLabel} · ${schedule.totalCredits} credits · conflict-free`
              : "Tell GradAI your preferences in the chat, then click Build"}
          </p>
        </div>
        {schedule && (
          <button onClick={() => onSchedule(null)} className="text-xs text-gray-400 hover:text-gray-600">
            Clear
          </button>
        )}
      </div>

      {/* Term selector + build button */}
      <div className="px-5 py-4 border-b border-gray-100 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTerm("2570")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors
              ${term === "2570" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}
          >
            Winter 2026
          </button>
          <button
            onClick={() => setTerm("2610")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors
              ${term === "2610" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}
          >
            Fall 2026
          </button>
        </div>

        <p className="text-[10px] text-gray-400 text-center">
          Tell GradAI your preferences (mornings, Fridays, credits, workload) in the chat — it will build your schedule automatically. Or click below to build with defaults.
        </p>

        {error && <p className="text-xs text-red-500 font-mono">{error}</p>}

        <button
          onClick={generate}
          disabled={loading}
          className="w-full rounded-xl bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Building schedule…
            </>
          ) : (
            schedule ? "Regenerate" : "Build My Schedule"
          )}
        </button>
      </div>

      {/* Calendar or empty state */}
      {schedule ? (
        <WeeklyCalendar schedule={schedule} />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-xl mb-3">📅</div>
          <p className="text-sm font-medium text-gray-600">No schedule yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Ask GradAI: <span className="italic">"Build my Fall 2026 schedule, no classes before 9am"</span>
          </p>
        </div>
      )}
    </div>
  );
}
