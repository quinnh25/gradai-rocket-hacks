import { appRouter } from "./router";
import { createTrpcContext } from "./trpc";

export async function createTrpcServer() {
  return appRouter.createCaller(await createTrpcContext());
}
