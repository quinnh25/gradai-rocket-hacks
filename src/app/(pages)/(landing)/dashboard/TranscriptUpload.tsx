"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface Course {
  subject: string;
  number: string;
  semester: string;
}

interface ParseResult {
  courses: Course[];
  saved: boolean;
}

interface SavedTranscript {
  id: string;
  label: string;
  savedAt: string;
  courseCount: number;
  courses: Course[];
}

interface TranscriptEntry {
  course_code: string;
  credits: number;
  term: string;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function entriesToCourses(entries: TranscriptEntry[]): Course[] {
  return entries.map((e) => {
    const parts = e.course_code.split(" ");
    return {
      subject: parts[0] ?? "",
      number: parts.slice(1).join(" ") ?? "",
      semester: e.term ?? "Unknown",
    };
  });
}

function groupBySemester(courses: Course[]): Record<string, Course[]> {
  return courses.reduce<Record<string, Course[]>>((acc, c) => {
    if (!acc[c.semester]) acc[c.semester] = [];
    acc[c.semester].push(c);
    return acc;
  }, {});
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function TranscriptUpload({ userId }: { userId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Multiple transcripts
  const [savedTranscripts, setSavedTranscripts] = useState<SavedTranscript[]>([]);
  const [activeTranscript, setActiveTranscript] = useState<SavedTranscript | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Load existing transcripts on mount
  useEffect(() => {
    async function load() {
      try {
        const resp = await fetch(`/api/student?userId=${userId}`);
        if (resp.ok) {
          const data = await resp.json();
          if (data.exists && data.transcript?.length > 0) {
            const courses = entriesToCourses(data.transcript);
            const transcript: SavedTranscript = {
              id: "current",
              label: data.transcriptLabel ?? "My Transcript",
              savedAt: data.updatedAt ?? new Date().toISOString(),
              courseCount: courses.length,
              courses,
            };
            setSavedTranscripts([transcript]);
            setActiveTranscript(transcript);
          } else {
            setShowUpload(true);
          }
        }
      } catch {
        setShowUpload(true);
      } finally {
        setLoadingExisting(false);
      }
    }
    load();
  }, [userId]);

  const handleFile = useCallback((f: File) => {
    if (f.type === "application/pdf") {
      setFile(f);
      setError(null);
      setStatus(null);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const parse = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setStatus("Reading PDF…");

    try {
      const base64 = await toBase64(file);
      setStatus("Analyzing transcript…");

      const resp = await fetch("/api/parse-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64, userId }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error ?? `Server error ${resp.status}`);
      }

      const parsed: ParseResult = await resp.json();

      const newTranscript: SavedTranscript = {
        id: "current",
        label: file.name.replace(/\.pdf$/i, ""),
        savedAt: new Date().toISOString(),
        courseCount: parsed.courses.length,
        courses: parsed.courses,
      };

      setSavedTranscripts([newTranscript]);
      setActiveTranscript(newTranscript);
      setShowUpload(false);
      setFile(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
      setStatus(null);
    }
  };

  if (loadingExisting) {
    return (
      <div className="flex items-center justify-center py-6 gap-2 text-gray-400 text-xs">
        <span className="w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-500 animate-spin" />
        Loading transcript…
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Saved transcript selector */}
      {savedTranscripts.length > 0 && !showUpload && activeTranscript && (
        <div className="space-y-2">
          {/* Active transcript header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-700">
                ✅ {activeTranscript.courseCount} courses loaded
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {activeTranscript.label} · saved {timeAgo(activeTranscript.savedAt)}
              </p>
            </div>
            <button
              onClick={() => setShowUpload(true)}
              className="text-xs text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-50 transition-colors"
            >
              + New
            </button>
          </div>

          {/* Course preview grouped by semester */}
          <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
            {Object.entries(groupBySemester(activeTranscript.courses)).map(
              ([semester, courses]) => (
                <div key={semester}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    {semester}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {courses.map((c) => (
                      <span
                        key={`${c.subject}-${c.number}`}
                        className="text-xs bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 font-mono"
                      >
                        {c.subject} {c.number}
                      </span>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Upload UI */}
      {showUpload && (
        <div className="space-y-2">
          {savedTranscripts.length > 0 && (
            <button
              onClick={() => setShowUpload(false)}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              ← Back to saved transcript
            </button>
          )}

          <div
            className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
              ${dragging
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
              }`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
            <div className="flex flex-col items-center gap-1.5 pointer-events-none">
              <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-base">
                📄
              </div>
              {file ? (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <p className="text-xs font-medium text-gray-700">{file.name}</p>
                </div>
              ) : (
                <>
                  <p className="text-xs font-semibold text-gray-700">Drop transcript here</p>
                  <p className="text-[10px] text-gray-400">or click to browse · PDF only</p>
                </>
              )}
            </div>
          </div>

          <button
            disabled={!file || loading}
            onClick={parse}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {status}
              </>
            ) : (
              "Upload & Parse Transcript"
            )}
          </button>

          <p className="text-center text-[10px] text-gray-400">
            🔒 Processed securely · never stored permanently
          </p>

          {error && (
            <p className="text-center text-xs text-red-500 font-mono break-all">{error}</p>
          )}
        </div>
      )}

      {/* No transcript yet */}
      {!showUpload && savedTranscripts.length === 0 && (
        <button
          onClick={() => setShowUpload(true)}
          className="w-full border-2 border-dashed border-gray-200 rounded-xl p-4 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
        >
          + Upload your transcript to get started
        </button>
      )}
    </div>
  );
}
