import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/prisma"; // Make sure this file exists!

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "mongodb",
  }),
  socialProviders: {
    google: {
      clientId: process.env.UMICH_CLIENT_ID as string,
      clientSecret: process.env.UMICH_CLIENT_SECRET as string,
    },
  },
  
  // --- WHAT CHANGED ---
  // 1. Checks for both common URL variable names so it won't fail
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_BASE_URL,
  
  // 2. ADDED THIS: Required for production so your cookies are encrypted securely!
  secret: process.env.BETTER_AUTH_SECRET, 
  // --------------------

  trustedOrigins: ["https://gradai-rocket-hacks.vercel.app"],
  advanced: {
    database: {
      generateId: false, 
    },
  },
});