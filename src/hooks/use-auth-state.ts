import { User } from "../generated/prisma/client";
import { auth } from "../lib/auth/server";
import { headers } from "next/headers";

export type AuthState = {} & (
  | {
      user: User;
      signedIn: true;
    }
  | {
      user: null;
      signedIn: false;
    }
);

export async function useAuthState() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user ?? null;
  const signedIn = !!session?.user;

  return {
    user,
    signedIn,
  } as AuthState;
}

export async function useUser() {
  const { user } = await useAuthState();
  return user!;
}
