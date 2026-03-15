import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
    // Make sure it uses the env variable, NOT a hardcoded "http://localhost:3000"
    baseURL: process.env.NEXT_PUBLIC_BASE_URL 
})