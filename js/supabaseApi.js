// supabaseApi.js
// Funciones de autenticación con Supabase (Google)

import { supabase } from "./supabaseClient.js";

export async function signInWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;

  console.log("🔐 Iniciando login Google, redirect:", redirectTo);

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });

  if (error) {
    console.error("❌ Error login Google:", error);
    throw error;
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
