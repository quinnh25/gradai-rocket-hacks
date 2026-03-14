import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "mongodb",
  }),
  socialProviders: {
    // This tells Better-Auth how to talk to the UMICH/Google login
    google: {
      clientId: process.env.UMICH_CLIENT_ID as string,
      clientSecret: process.env.UMICH_CLIENT_SECRET as string,
    },
  },
  baseURL: process.env.NEXT_PUBLIC_BASE_URL,
  // ⚠️ CRITICAL HACKATHON FIX: 
  // Prevents a known bug where Prisma + MongoDB crash over "ObjectIDs"
  advanced: {
    database: {
      generateId: false, 
    },
  },
});