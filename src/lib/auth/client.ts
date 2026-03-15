import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    // This forces it to use Vercel in production, and localhost on your computer
    baseURL: process.env.NODE_ENV === "development" 
        ? "http://localhost:3000" 
        : "https://gradai-rocket-hacks.vercel.app" 
});