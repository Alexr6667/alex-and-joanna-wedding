"use client";

import { createAuthClient } from "@neondatabase/auth/next";

// Talks to this app's /api/auth proxy, never to Neon directly.
export const authClient = createAuthClient();
