import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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
      
      {/* Profile badge — top right */}
      <div className="fixed top-4 right-4">
        <div className="flex items-center gap-2 bg-green-500/20 border border-green-500 text-green-700 px-4 py-2 rounded-full">
          {user.image ? (
            <img
              src={user.image}
              alt="Profile"
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-xs font-bold">
              {user.name?.[0] ?? "?"}
            </div>
          )}
          <span className="text-sm font-medium">{user.email}</span>
        </div>
      </div>

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
          Welcome, {user.name?.split(' ')[0]}!
        </h1>
        
        <p className="text-gray-500 mb-2 font-medium">
          {user.email}
        </p>

        <p className="text-sm text-green-600 bg-green-50 rounded-full py-1 px-3 inline-block mb-8 border border-green-200">
          ✅ Secure session active
        </p>

        <div className="bg-gray-50 rounded-xl p-5 text-left mb-8 border border-gray-200">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
            Hackathon Next Steps
          </h2>
          <ul className="space-y-3 text-gray-600 text-sm">
            <li className="flex items-center line-through opacity-60">
              <span className="mr-2">🎉</span> Celebrate fixing auth
            </li>
            <li className="flex items-center line-through opacity-60">
              <span className="mr-2">👤</span> Fetch user data (Name & Avatar)
            </li>
            <li className="flex items-center text-black font-semibold">
              <span className="mr-2">🤖</span> Connect the AI Model (Next up!)
            </li>
          </ul>
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