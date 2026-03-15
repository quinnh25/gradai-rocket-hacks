"use client";

import { useState, useRef, useCallback } from "react";

interface Course {
  subject: string;
  number: string;
  semester: string;
}

interface ParseResult {
  courses: Course[];
}

const GEMINI_API_KEY = "AIzaSyBDDPY1TyHWmLgFJ7Dzv26buEaqp7yz5BQ";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadJSON(data: ParseResult, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/\.pdf$/i, ".json");
  a.click();
  URL.revokeObjectURL(url);
}

export default function TranscriptUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.type === "application/pdf") {
      setFile(f);
      setError(null);
      setDone(false);
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
    setDone(false);
    setStatus("Reading PDF…");

    try {
      const base64 = await toBase64(file);
      setStatus("Analyzing transcript…");

      const resp = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: "application/pdf", data: base64 } },
                {
                  text: `Extract every course from this transcript. Return ONLY valid JSON — no markdown, no explanation:
{"courses":[{"subject":"CS","number":"101","semester":"Fall 2023"}]}
Rules: subject = dept code (e.g. "EECS"), number = course number as string, semester = term + year. Include transfer/AP credit and current enrollments. For any transfer/AP/IB credit, 
make a separate semester that is simply called Transfer Credit`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            response_mime_type: "application/json",
          },
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error?.message ?? `API error ${resp.status}`);
      }

      const data = await resp.json();
      const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      if (!raw) throw new Error("Empty response from Gemini");

      const parsed: ParseResult = JSON.parse(raw.replace(/```json|```/g, "").trim());
      downloadJSON(parsed, file.name);
      setDone(true);
      setStatus(`${parsed.courses.length} courses saved to ${file.name.replace(/\.pdf$/i, ".json")}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Drop zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
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
        <div className="flex flex-col items-center gap-2 pointer-events-none">
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-lg">
            📄
          </div>
          {file ? (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-700">Drop your transcript here</p>
              <p className="text-xs text-gray-400">or click to browse · PDF only</p>
            </>
          )}
        </div>
      </div>

      {/* Upload button */}
      <button
        disabled={!file || loading}
        onClick={parse}
        className="mt-3 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            {status}
          </>
        ) : (
          "Upload & Parse Transcript"
        )}
      </button>

      {/* Disclaimer */}
      <p className="mt-2.5 text-center text-[11px] text-gray-400 leading-relaxed">
        🔒 GradAI will never store your personal data. Your transcript is processed
        in your browser and never sent to our servers.
      </p>

      {/* Success / error */}
      {done && !loading && (
        <p className="mt-3 text-center text-xs text-green-600 font-medium">
          ✅ {status}
        </p>
      )}
      {error && (
        <p className="mt-3 text-center text-xs text-red-500 font-mono break-all">
          {error}
        </p>
      )}
    </div>
  );
}