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

      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Welcome back, {user.name?.split(" ")[0]}
          </h1>
          <p className="text-gray-500 mt-1">Let&apos;s plan your path to graduation.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
          {/* Left column */}
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">
                📄 Your Transcript
              </h2>
              <TranscriptUpload userId={user.id} />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                🎓 Session
              </h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Signed in as</span>
                  <span className="text-xs font-medium text-gray-700 truncate max-w-[160px]">
                    {user.email}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Status</span>
                  <span className="text-green-600 bg-green-50 rounded-full px-2 py-0.5 text-xs font-medium border border-green-100">
                    ✅ Active
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Chat */}
          <div
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
            style={{ height: "780px" }}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
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
            <div style={{ height: "calc(780px - 65px)" }}>
              <ChatPlanner userId={user.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
