// supabaseClient.js — cliente único Supabase (Auth estable para GitHub Pages + PKCE)

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// === DATOS DE TU PROYECTO (CORREGIDOS) ===
const SUPABASE_URL = "https://tuquyruyyizzccxrvafc.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1cX" +
  "5cnV5eWl6emNjeHJ2YWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MTY5NjgsImV4cCI6" +
  "MjA4MzI5Mjk2OH0.mTsLI_LQC9ccI7Yoc8UL7coGqQlab8NTp3ItFnX7nnE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // PKCE para SPA (GitHub Pages)
    flowType: "pkce",

    // Persistir sesión
    persistSession: true,
    storage: window.localStorage,

    // Refresh automático
    autoRefreshToken: true,

    // MUY IMPORTANTE: la URL la manejamos en app.js
    detectSessionInUrl: false,
  },
});
