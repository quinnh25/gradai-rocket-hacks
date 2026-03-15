import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ProfileBadge from "./profile-badge";
import DashboardClient from "./DashboardClient";

export default async function Dashboard() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) redirect("/");

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
        <DashboardClient userId={user.id} userEmail={user.email} />
      </div>
    </div>
  );
}
