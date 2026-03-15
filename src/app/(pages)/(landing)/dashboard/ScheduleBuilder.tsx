"use client";

import { useState } from "react";
import WeeklyCalendar from "./WeeklyCalendar";
import type { ScheduleOutput } from "@/app/api/schedule/route";

interface ScheduleBuilderProps {
  userId: string;
}

export default function ScheduleBuilder({ userId }: ScheduleBuilderProps) {
  const [courseInput, setCourseInput] = useState("");
  const [term, setTerm] = useState<"2570" | "2610">("2570");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<ScheduleOutput | null>(null);

  const parseCourses = (input: string): string[] => {
    // Parse "EECS 281, MATH 216, PHYSICS 240" or newline separated
    return input
      .split(/[\n,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]+ \d+/.test(s));
  };

  const buildSchedule = async () => {
    const courseCodes = parseCourses(courseInput);
    if (courseCodes.length === 0) {
      setError("Please enter at least one valid course code, e.g. EECS 281");
      return;
    }

    setLoading(true);
    setError(null);
    setSchedule(null);

    try {
      const resp = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, courseCodes, term }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error ?? `Server error ${resp.status}`);
      }

      const data = await resp.json();
      setSchedule(data.schedule);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Builder form */}
      {!schedule && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-gray-800">📅 Build Your Schedule</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Enter course codes from your plan to see a visual weekly schedule
            </p>
          </div>

          {/* Term selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setTerm("2570")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors
                ${term === "2570"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
            >
              Winter 2026
            </button>
            <button
              onClick={() => setTerm("2610")}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors
                ${term === "2610"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
            >
              Fall 2026
            </button>
          </div>

          {/* Course input */}
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1.5 block">
              Course Codes
            </label>
            <textarea
              value={courseInput}
              onChange={(e) => setCourseInput(e.target.value)}
              placeholder={"EECS 281\nMATH 216\nPHYSICS 240\nTCHNCLCM 300"}
              rows={4}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-300 resize-none"
            />
            <p className="text-[10px] text-gray-400 mt-1">
              One per line or comma separated · e.g. EECS 281, MATH 216
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-500 font-mono">{error}</p>
          )}

          <button
            onClick={buildSchedule}
            disabled={loading || !courseInput.trim()}
            className="w-full rounded-xl bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Building schedule…
              </>
            ) : (
              "Generate Schedule"
            )}
          </button>
        </div>
      )}

      {/* Calendar */}
      {schedule && (
        <WeeklyCalendar
          schedule={schedule}
          onClose={() => {
            setSchedule(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
