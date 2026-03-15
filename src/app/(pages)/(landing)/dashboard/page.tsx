import Link from "next/link";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
        
        {/* Success Checkmark */}
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">
          You made it in!
        </h1>
        
        <p className="text-gray-500 mb-8">
          The database is connected, Google OAuth is working, and your secure session is active.
        </p>

        <div className="bg-gray-50 rounded-xl p-5 text-left mb-8 border border-gray-200">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
            Hackathon Next Steps
          </h2>
          <ul className="space-y-2 text-gray-600 text-sm">
            <li className="flex items-center">
              <span className="mr-2">🎉</span> Celebrate fixing auth
            </li>
            <li className="flex items-center">
              <span className="mr-2">👤</span> Fetch user data (Name & Avatar)
            </li>
            <li className="flex items-center">
              <span className="mr-2">🤖</span> Connect the AI Model
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