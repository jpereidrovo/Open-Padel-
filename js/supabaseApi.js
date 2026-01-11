// supabaseApi.js — API única para Supabase (auth + players + history)
// Copiar/pegar completo. No editar nombres de exports.

import { supabase } from "./supabaseClient.js";

export const GROUP_CODE = "open-padel";

/* --------------------- HELPERS --------------------- */

function toISODate(d) {
  return String(d || "").slice(0, 10); // YYYY-MM-DD
}

export async function requireSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data?.session;
  if (!session) throw new Error("No hay sesión. Inicia sesión con Google.");
  return session;
}

/* --------------------- AUTH --------------------- */

export async function signInWithGoogle() {
  // GitHub Pages: mantener origin + pathname del repo
  const redirectTo = window.location.origin + window.location.pathname;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { prompt: "select_account" }
    }
  });

  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSessionUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data?.user || null;
}

/* --------------------- PLAYERS --------------------- */
/*
Tabla esperada: public.players
- id uuid (default gen_random_uuid())
- name text not null
- side text not null  ('D' o 'R')
- rating numeric(3,1) o integer (si aún no migraste)
- group_code text default 'open-padel'
*/

export async function listPlayers() {
  await requireSession();

  const { data, error } = await supabase
    .from("players")
    .select("id,name,side,rating,created_at,updated_at,group_code")
    .eq("group_code", GROUP_CODE)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function upsertPlayer(player) {
  await requireSession();

  const payload = {
    group_code: GROUP_CODE,
    id: player?.id || undefined, // si no hay id, supabase genera
    name: String(player?.name || "").trim(),
    side: player?.side === "R" ? "R" : "D",
    // rating puede ser decimal (0.5) si migraste la tabla
    rating: Number(player?.rating ?? 5),
    updated_at: new Date().toISOString()
  };

  if (!payload.name) throw new Error("Nombre vacío.");
  if (payload.rating < 0 || payload.rating > 10) throw new Error("Rating fuera de rango (0-10).");

  const { error } = await supabase.from("players").upsert(payload);
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

/* --------------------- HISTORY: SESSIONS (Equipos) --------------------- */
/*
Tabla esperada: public.sessions
- group_code text
- session_date date
- totalPlayers integer
- team_a jsonb
- team_b jsonb
UNIQUE (group_code, session_date)
*/

export async function saveTeamsToHistory(session_date, totalPlayers, team_a, team_b) {
  await requireSession();

  const date = toISODate(session_date);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    totalPlayers: Number(totalPlayers || 0),
    team_a: team_a || [],
    team_b: team_b || [],
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("sessions")
    .upsert(payload, { onConflict: "group_code,session_date" });

  if (error) throw error;
}

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

/* --------------------- HISTORY: RESULTS (Turnos + resumen) --------------------- */
/*
Tabla esperada: public.results
- group_code text
- session_date date
- turns jsonb
- scores jsonb (opcional)
- summary jsonb
UNIQUE (group_code, session_date)
*/

export async function saveResultsToHistory(session_date, turns, scores, summary) {
  await requireSession();

  const date = toISODate(session_date);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    turns: turns || null,
    scores: scores || null,
    summary: summary || null,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("results")
    .upsert(payload, { onConflict: "group_code,session_date" });

  if (error) throw error;
}

export async function getHistoryDetail(session_date) {
  await requireSession();

  const date = toISODate(session_date);

  const { data: sessionRow, error: e1 } = await supabase
    .from("sessions")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .maybeSingle();

  if (e1) throw e1;

  const { data: resultsRow, error: e2 } = await supabase
    .from("results")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", date)
    .maybeSingle();

  if (e2) throw e2;

  return { session: sessionRow || null, results: resultsRow || null };
}
