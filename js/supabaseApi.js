// supabaseClient.js — Cliente único de Supabase para Open Padel (GitHub Pages friendly)

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// 🔹 DATOS DE TU PROYECTO
export const SUPABASE_URL = "https://tuquyruyyizzccxrvafc.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1cXV5cnV5eWl6emNjeHJ2YWZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MTY5NjgsImV4cCI6MjA4MzI5Mjk2OH0.mTsLI_LQC9ccI7Yoc8UL7coGqQlab8NTp3ItFnX7nnE";

// Validación simple para evitar errores silenciosos
if (!/^https?:\/\/.+/i.test(SUPABASE_URL)) {
  throw new Error("SUPABASE_URL inválida. Debe iniciar con https://");
}
if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.length < 40) {
  throw new Error("SUPABASE_ANON_KEY inválida o vacía.");
}

// Crear cliente Supabase (configuración recomendada para OAuth en SPA)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce"
  }
});

console.log("✅ Supabase client inicializado correctamente");
