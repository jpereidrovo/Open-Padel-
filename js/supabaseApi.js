import { supabase } from "./supabaseClient.js";

export async function signInWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;

  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });
}
