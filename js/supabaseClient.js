// supabaseClient.js — Cliente único de Supabase para Open Padel (sesión estable)

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://tuquyruyyizzccxrvafc.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1cXV5cnV5eWl6emNjeHJ2YWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MTY5NjgsImV4cCI6MjA4MzI5Mjk2OH0.mTsLI_LQC9ccI7Yoc8UL7coGqQlab8NTp3ItFnX7nnE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
    storageKey: "openpadel-auth",
    storage: window.localStorage
  }
})

console.log("✅ Supabase client inicializado");
