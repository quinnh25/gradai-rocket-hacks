"use client";

import { useState } from "react";
import TranscriptUpload from "./TranscriptUpload";
import ChatPlanner from "./ChatPlanner";
import SchedulePanel from "./SchedulePanel";
import type { ScheduleOutput } from "@/app/api/schedule/route";
import type { GradPlanOutput } from "./types";

interface DashboardClientProps {
  userId: string;
  userEmail: string;
}

export default function DashboardClient({ userId, userEmail }: DashboardClientProps) {
  const [weeklySchedule, setWeeklySchedule] = useState<ScheduleOutput | null>(null);
  const [gradPlan, setGradPlan] = useState<GradPlanOutput | null>(null);

  const handleScheduleData = (data: {
    weeklySchedule?: ScheduleOutput;
    gradPlan?: GradPlanOutput;
  }) => {
    if (data.weeklySchedule) setWeeklySchedule(data.weeklySchedule);
    if (data.gradPlan) setGradPlan(data.gradPlan);
  };

  return (
    <div className="space-y-6">
      {/* Top row: transcript + chat */}
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* Left */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
              📄 Your Transcript
            </h2>
            <TranscriptUpload userId={userId} />
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              🎓 Session
            </h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Signed in as</span>
                <span className="text-xs font-medium text-gray-700 truncate max-w-[160px]">{userEmail}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Status</span>
                <span className="text-green-600 bg-green-50 rounded-full px-2 py-0.5 text-xs font-medium border border-green-100">✅ Active</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" style={{ height: "780px" }}>
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">G</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">GradAI Planner</p>
              <p className="text-xs text-gray-400">Powered by Gemini · Knows your transcript &amp; requirements</p>
            </div>
          </div>
          <div style={{ height: "calc(780px - 65px)" }}>
            <ChatPlanner userId={userId} onScheduleData={handleScheduleData} />
          </div>
        </div>
      </div>

      {/* Bottom row: schedule panels */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Weekly schedule — now uses smart SchedulePanel */}
        <SchedulePanel
          userId={userId}
          schedule={weeklySchedule}
          onSchedule={setWeeklySchedule}
        />

        {/* Graduation plan */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-800">🎓 Graduation Plan</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {gradPlan
                  ? `Graduating ${gradPlan.expectedGraduation} · ${gradPlan.totalCreditsRemaining} credits remaining`
                  : "Ask GradAI for your full graduation plan"}
              </p>
            </div>
            {gradPlan && (
              <button onClick={() => setGradPlan(null)} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
            )}
          </div>

          {!gradPlan ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-2xl mb-3">🎓</div>
              <p className="text-sm font-medium text-gray-600">No graduation plan yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Ask GradAI: <span className="italic">"Plan my remaining semesters until graduation"</span>
              </p>
            </div>
          ) : (
            <div className="overflow-auto max-h-[600px]">
              {gradPlan.semesters.map((sem, i) => (
                <div key={i} className="border-b border-gray-50 last:border-0">
                  <div className="px-5 py-2.5 bg-gray-50 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-700">{sem.label}</span>
                    <span className="text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-2 py-0.5">{sem.totalCredits} cr</span>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-5 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-24">Course</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-12">Cr</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Requirement</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sem.courses.map((course, j) => (
                        <tr key={j} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-2 text-xs font-mono font-semibold text-blue-600">{course.code}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{course.credits}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{course.requirement}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{course.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
