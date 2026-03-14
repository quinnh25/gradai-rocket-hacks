import { initTRPC } from "@trpc/server";
import superjson from "superjson";

export async function createTrpcContext() {
  return {};
}

type Context = Awaited<ReturnType<typeof createTrpcContext>>;
const t = initTRPC.context<Context>().create({
  transformer: superjson,
});
export const publicProcedure = t.procedure;
export const router = t.router;
