import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProfileBadge from "./profile-badge";
import TranscriptUpload from "./TranscriptUpload";
import ChatPlanner from "./ChatPlanner";

export default async function Dashboard() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  const user = session.user;

  return (
    <div className="min-h-screen bg-gray-50">
      <ProfileBadge email={user.email} image={user.image} name={user.name} />

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Welcome back, {user.name?.split(" ")[0]}
          </h1>
          <p className="text-gray-500 mt-1">
            Let&apos;s plan your path to graduation.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
          {/* ── Left column: transcript upload ── */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
                📄 Your Transcript
              </h2>
              <TranscriptUpload userId={user.id} />
            </div>

            {/* Status card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
                🎓 Session
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Signed in as</span>
                  <span className="font-medium text-gray-700 truncate max-w-[160px]">
                    {user.email}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Status</span>
                  <span className="text-green-600 bg-green-50 rounded-full px-2 py-0.5 text-xs font-medium border border-green-100">
                    ✅ Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right column: AI chat planner ── */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
               style={{ height: "680px" }}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">
                G
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">GradAI Planner</p>
                <p className="text-xs text-gray-400">
                  Powered by Gemini · Knows your transcript &amp; requirements
                </p>
              </div>
            </div>
            <div style={{ height: "calc(680px - 65px)" }}>
              <ChatPlanner userId={user.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
