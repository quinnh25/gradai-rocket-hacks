"use client";

import { useState } from "react";
import WeeklyCalendar from "./WeeklyCalendar";
import type { ScheduleOutput } from "@/app/api/schedule/route";

interface SchedulePanelProps {
  userId: string;
  schedule: ScheduleOutput | null;
  onSchedule: (s: ScheduleOutput) => void;
}

export default function SchedulePanel({ userId, schedule, onSchedule }: SchedulePanelProps) {
  const [term, setTerm] = useState<"2570" | "2610">("2570");
  const [targetCredits, setTargetCredits] = useState(15);
  const [avoidMornings, setAvoidMornings] = useState(false);
  const [freeFridays, setFreeFridays] = useState(false);
  const [maxWorkload, setMaxWorkload] = useState(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          term,
          targetCredits,
          preferences: {
            avoidMornings,
            freeFridays,
            maxWorkloadPercent: maxWorkload < 100 ? maxWorkload : undefined,
          },
        }),
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
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-800">📅 Weekly Schedule</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {schedule
              ? `${schedule.termLabel} · ${schedule.totalCredits} credits · conflict-free`
              : "Auto-built from your requirements"}
          </p>
        </div>
        {schedule && (
          <button
            onClick={() => onSchedule(null!)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="px-5 py-4 border-b border-gray-100 space-y-3">
        {/* Term */}
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

        {/* Credits slider */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs text-gray-500 font-medium">Target Credits</label>
            <span className="text-xs font-bold text-blue-600">{targetCredits}</span>
          </div>
          <input
            type="range" min={12} max={19} value={targetCredits}
            onChange={(e) => setTargetCredits(parseInt(e.target.value))}
            className="w-full accent-blue-600"
          />
        </div>

        {/* Workload slider */}
        <div>
          <div className="flex justify-between mb-1">
            <label className="text-xs text-gray-500 font-medium">Max Workload Per Course</label>
            <span className="text-xs font-bold text-blue-600">
              {maxWorkload === 100 ? "Any" : `${maxWorkload}%`}
            </span>
          </div>
          <input
            type="range" min={20} max={100} step={10} value={maxWorkload}
            onChange={(e) => setMaxWorkload(parseInt(e.target.value))}
            className="w-full accent-blue-600"
          />
        </div>

        {/* Preference toggles */}
        <div className="flex gap-3">
          <button
            onClick={() => setAvoidMornings((v) => !v)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${avoidMornings ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-white text-gray-500 border-gray-200 hover:border-amber-200"}`}
          >
            🌅 No Early Classes
          </button>
          <button
            onClick={() => setFreeFridays((v) => !v)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors
              ${freeFridays ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-white text-gray-500 border-gray-200 hover:border-emerald-200"}`}
          >
            🎉 Free Fridays
          </button>
        </div>

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

      {/* Calendar */}
      {schedule ? (
        <WeeklyCalendar schedule={schedule} />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-xl mb-3">📅</div>
          <p className="text-sm font-medium text-gray-600">No schedule yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Configure your preferences above and click Build
          </p>
        </div>
      )}
    </div>
  );
}
