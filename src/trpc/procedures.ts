import { TRPCError } from "@trpc/server";
import { publicProcedure } from "./trpc";

export const authorizedProcedure = publicProcedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.signedIn) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
    });
  }

  return opts.next({
    ctx,
  });
});
