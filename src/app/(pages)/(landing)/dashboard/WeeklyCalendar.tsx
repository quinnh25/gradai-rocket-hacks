"use client";

import { useState } from "react";
import type { ScheduleOutput, ScheduledCourse } from "@/app/api/schedule/route";

interface WeeklyCalendarProps {
  schedule: ScheduleOutput;
  onClose?: () => void;
}

const DAYS = ["Mo", "Tu", "We", "Th", "Fr"];
const DAY_LABELS: Record<string, string> = {
  Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri",
};

// Hours to display: 8am - 9pm
const START_HOUR = 8;
const END_HOUR = 21;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const PIXELS_PER_HOUR = 60;

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function formatHour(hour: number): string {
  if (hour === 12) return "12 PM";
  if (hour > 12) return `${hour - 12} PM`;
  return `${hour} AM`;
}

interface CalendarBlock {
  course: ScheduledCourse;
  sectionType: string;
  startMinutes: number;
  endMinutes: number;
  location: string;
  instructor: string;
}

export default function WeeklyCalendar({ schedule, onClose }: WeeklyCalendarProps) {
  const [hoveredBlock, setHoveredBlock] = useState<{
    course: ScheduledCourse;
    sectionType: string;
    location: string;
    instructor: string;
  } | null>(null);

  // Build a map of day → blocks
  const dayBlocks: Record<string, CalendarBlock[]> = {
    Mo: [], Tu: [], We: [], Th: [], Fr: [],
  };

  for (const course of schedule.courses) {
    for (const section of course.sections) {
      for (const meeting of section.meetings) {
        const parsed = {
          startMinutes: timeToMinutes(meeting.startTime),
          endMinutes: timeToMinutes(meeting.endTime),
        };
        for (const day of meeting.days) {
          if (dayBlocks[day]) {
            dayBlocks[day].push({
              course,
              sectionType: section.sectionType,
              startMinutes: parsed.startMinutes,
              endMinutes: parsed.endMinutes,
              location: meeting.location,
              instructor: section.instructor,
            });
          }
        }
      }
    }
  }

  const startMinutes = START_HOUR * 60;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="text-sm font-bold text-gray-800">{schedule.termLabel} Schedule</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {schedule.totalCredits} credits · {schedule.courses.length} courses
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="hidden sm:flex flex-wrap gap-2">
            {schedule.courses.map((c) => (
              <div key={c.courseCode} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <span className="text-[10px] text-gray-600 font-mono">{c.courseCode}</span>
              </div>
            ))}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-sm transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Day headers */}
          <div className="flex border-b border-gray-100">
            <div className="w-14 flex-shrink-0" /> {/* time gutter */}
            {DAYS.map((day) => (
              <div
                key={day}
                className="flex-1 text-center py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide border-l border-gray-100"
              >
                {DAY_LABELS[day]}
              </div>
            ))}
          </div>

          {/* Time grid */}
          <div className="flex" style={{ height: `${TOTAL_HOURS * PIXELS_PER_HOUR}px` }}>
            {/* Time labels */}
            <div className="w-14 flex-shrink-0 relative">
              {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute right-2 text-[9px] text-gray-400 -translate-y-2"
                  style={{ top: `${i * PIXELS_PER_HOUR}px` }}
                >
                  {formatHour(START_HOUR + i)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {DAYS.map((day) => (
              <div
                key={day}
                className="flex-1 relative border-l border-gray-100"
              >
                {/* Hour lines */}
                {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-gray-50"
                    style={{ top: `${i * PIXELS_PER_HOUR}px` }}
                  />
                ))}

                {/* Half-hour lines */}
                {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
                  <div
                    key={`h-${i}`}
                    className="absolute left-0 right-0 border-t border-gray-50 border-dashed"
                    style={{ top: `${i * PIXELS_PER_HOUR + 30}px` }}
                  />
                ))}

                {/* Course blocks */}
                {dayBlocks[day].map((block, idx) => {
                  const top =
                    ((block.startMinutes - startMinutes) / 60) * PIXELS_PER_HOUR;
                  const height =
                    ((block.endMinutes - block.startMinutes) / 60) * PIXELS_PER_HOUR;

                  return (
                    <div
                      key={idx}
                      className="absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 overflow-hidden cursor-pointer transition-opacity hover:opacity-90 shadow-sm"
                      style={{
                        top: `${top}px`,
                        height: `${height - 2}px`,
                        backgroundColor: block.course.color + "22",
                        borderLeft: `3px solid ${block.course.color}`,
                      }}
                      onMouseEnter={() =>
                        setHoveredBlock({
                          course: block.course,
                          sectionType: block.sectionType,
                          location: block.location,
                          instructor: block.instructor,
                        })
                      }
                      onMouseLeave={() => setHoveredBlock(null)}
                    >
                      <p
                        className="text-[10px] font-bold leading-tight truncate"
                        style={{ color: block.course.color }}
                      >
                        {block.course.courseCode}
                      </p>
                      {height > 35 && (
                        <p className="text-[9px] text-gray-500 truncate leading-tight">
                          {block.sectionType}
                        </p>
                      )}
                      {height > 50 && (
                        <p className="text-[9px] text-gray-400 truncate leading-tight">
                          {block.location !== "TBA" ? block.location : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredBlock && (
        <div className="border-t border-gray-100 px-5 py-3 bg-gray-50">
          <div className="flex items-start gap-3">
            <div
              className="w-3 h-3 rounded-sm mt-0.5 flex-shrink-0"
              style={{ backgroundColor: hoveredBlock.course.color }}
            />
            <div>
              <p className="text-xs font-bold text-gray-800">
                {hoveredBlock.course.courseCode} — {hoveredBlock.course.title}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {hoveredBlock.sectionType} · {hoveredBlock.location} · {hoveredBlock.instructor}
              </p>
            </div>
            <p className="ml-auto text-xs text-gray-400">
              {hoveredBlock.course.credits} cr
            </p>
          </div>
        </div>
      )}

      {/* Course list summary */}
      <div className="border-t border-gray-100 px-5 py-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
          Enrolled Courses
        </p>
        <div className="space-y-2">
          {schedule.courses.map((c) => (
            <div key={c.courseCode} className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ backgroundColor: c.color }}
              />
              <span className="text-xs font-mono text-gray-600 w-20 flex-shrink-0">
                {c.courseCode}
              </span>
              <span className="text-xs text-gray-500 flex-1 truncate">{c.title}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">{c.credits} cr</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
