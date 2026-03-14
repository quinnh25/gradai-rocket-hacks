import { initTRPC } from "@trpc/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import superjson from "superjson";

export async function createTrpcContext() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return {
    user: session?.user
      ? {
          id: session.user.id,
          email: session.user.email,
        }
      : null,
    signedIn: !!session?.user,
  };
}

type Context = Awaited<ReturnType<typeof createTrpcContext>>;
const t = initTRPC.context<Context>().create({
  transformer: superjson,
});
export const publicProcedure = t.procedure;
export const router = t.router;
