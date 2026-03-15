import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProfileBadge from "./profile-badge";
import TranscriptUpload from "./Transcriptupload";

export default async function Dashboard() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/");
  }

  const user = session.user;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <ProfileBadge email={user.email} image={user.image} name={user.name} />
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
        {user.image ? (
          <img
            src={user.image}
            alt={`${user.name}'s profile picture`}
            className="mx-auto h-20 w-20 rounded-full border-4 border-green-100 mb-6 shadow-sm"
          />
        ) : (
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
          Welcome, {user.name?.split(" ")[0]}!
        </h1>
        <p className="text-gray-500 mb-2 font-medium">{user.email}</p>
        <p className="text-sm text-green-600 bg-green-50 rounded-full py-1 px-3 inline-block mb-8 border border-green-200">
          ✅ Secure session active
        </p>

        {/* Transcript upload */}
        <div className="bg-gray-50 rounded-xl p-5 text-left mb-4 border border-gray-200">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
            Upload Your Transcript
          </h2>
          <TranscriptUpload />
        </div>

        <Link
          href="/"
          className="inline-flex justify-center w-full rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-gray-800 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}