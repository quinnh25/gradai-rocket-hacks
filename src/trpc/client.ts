import { createTRPCProxyClient, httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";
import { appRouter } from "./router";

export const trpcClient = createTRPCProxyClient<typeof appRouter>({
  links: [
    httpBatchLink({ url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/trpc` }),
    loggerLink({
      enabled: (opts) => true,
    }),
  ],
  transformer: superjson,
});
