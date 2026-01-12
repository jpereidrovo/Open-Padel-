// supabaseApi.js — API única para Open Padel (Supabase)
// Auth robusto + Players + Sessions/Results guardado seguro (sin UNIQUE) + History delete

import { supabase } from "./supabaseClient.js";

export const GROUP_CODE = "open-padel";

function cleanDate(d) {
  return String(d || "").slice(0, 10);
}

// ---------------- AUTH ----------------
export async function getSessionUser() {
  // Si volvemos del OAuth con ?code=..., intercambiar (por si hubo race)
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (code) {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) console.warn("exchangeCodeForSession error:", error);

      url.searchParams.delete("code");
      url.searchParams.delete("state");
      window.history.replaceState({}, document.title, url.toString());
    } catch (e) {
      console.warn("exchangeCodeForSession throw:", e);
    }
  }

  // 1) sesión local
  try {
    const { data: s1, error: e1 } = await supabase.auth.getSession();
    if (e1) console.warn("getSession error:", e1);
    if (s1?.session?.user) return s1.session.user;
  } catch (e) {
    console.warn("getSession throw:", e);
  }

  // 2) fallback
  try {
    const { data: u, error: e2 } = await supabase.auth.getUser();
    if (e2) return null;
    return u?.user || null;
  } catch (e) {
    console.warn("getUser throw:", e);
    return null;
  }
}

export async function requireSession() {
  const user = await getSessionUser();
  if (!user) throw new Error("No hay sesión. Inicia sesión con Google.");
  return user;
}

export async function signInWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { access_type: "offline", prompt: "consent" }
    }
  });

  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ---------------- PLAYERS ----------------
export async function listPlayers() {
  await requireSession();

  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function upsertPlayer(player) {
  await requireSession();

  const payload = {
    id: player.id,
    name: String(player.name || "").trim(),
    side: player.side === "R" ? "R" : "D",
    rating: Number(player.rating),
    group_code: GROUP_CODE,
    updated_at: new Date().toISOString()
  };

  if (!payload.id) delete payload.id;

  const { error } = await supabase
    .from("players")
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
}

export async function deletePlayer(id) {
  await requireSession();

  const { error } = await supabase
    .from("players")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("id", id);

  if (error) throw error;
}

export async function deleteAllPlayers() {
  await requireSession();

  const { error } = await supabase
    .from("players")
    .delete()
    .eq("group_code", GROUP_CODE);

  if (error) throw error;
}

// ---------------- SESSIONS (Equipos) ----------------
// ✅ Guardado seguro: UPDATE por key; si no actualiza nada -> INSERT
// ✅ No falla si hay duplicados (actualiza todos los que existan)
export async function saveTeamsToHistory(session_date, totalPlayers, teamA, teamB) {
  await requireSession();

  const date = cleanDate(session_date);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    totalPlayers: Number(totalPlayers || 0),
    team_a: teamA || [],
    team_b: teamB || [],
    updated_at: new Date().toISOString()
  };

  // 1) intentar UPDATE primero
  const { data: upd, error: e1 } = await supabase
    .from("sessions")
    .update(payload)
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .select("id"); // para saber si actualizó algo

  if (e1) throw e1;

  if (Array.isArray(upd) && upd.length > 0) {
    // actualizado (1 o múltiples duplicados)
    return;
  }

  // 2) si no existía, INSERT
  const { error: e2 } = await supabase
    .from("sessions")
    .insert(payload);

  if (e2) throw e2;
}

// ---------------- RESULTS (Turnos + Summary) ----------------
// ✅ Igual: UPDATE por key; si no actualiza -> INSERT
export async function saveResultsToHistory(session_date, turns, scores, summary) {
  await requireSession();

  const date = cleanDate(session_date);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    turns: turns || [],
    scores: scores || {},
    summary: summary || {},
    updated_at: new Date().toISOString()
  };

  const { data: upd, error: e1 } = await supabase
    .from("results")
    .update(payload)
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .select("id");

  if (e1) throw e1;

  if (Array.isArray(upd) && upd.length > 0) {
    return;
  }

  const { error: e2 } = await supabase
    .from("results")
    .insert(payload);

  if (e2) throw e2;
}

// ---------------- HISTORY ----------------
export async function listHistoryDates() {
  await requireSession();

  const { data, error } = await supabase
    .from("sessions")
    .select("session_date")
    .eq("group_code", GROUP_CODE)
    .order("session_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getHistoryDetail(session_date) {
  await requireSession();

  const date = cleanDate(session_date);

  // Si hay duplicados, agarramos el más “nuevo”
  const { data: sessions, error: e1 } = await supabase
    .from("sessions")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (e1) throw e1;

  const session = sessions?.[0] || null;

  const { data: resultsRows, error: e2 } = await supabase
    .from("results")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (e2) throw e2;

  const results = resultsRows?.[0] || null;

  return { session, results };
}

// ✅ BORRAR COMPLETO: borra TODOS los duplicados de esa fecha
export async function deleteHistoryDate(session_date) {
  await requireSession();

  const date = cleanDate(session_date);

  const { error: e1 } = await supabase
    .from("results")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date);
  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("sessions")
    .delete()
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date);
  if (e2) throw e2;
}
