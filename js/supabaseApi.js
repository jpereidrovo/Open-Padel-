// supabaseApi.js — API única contra Supabase (Auth + Players + State + Historial)
import { supabase } from "./supabaseClient.js";

export const GROUP_CODE = "open-padel";

// ---------------- AUTH ----------------
export async function signInWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo }
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.user) throw new Error("NO_SESSION");
  return session;
}

// ---------------- PLAYERS ----------------
export async function listPlayers() {
  await requireSession();
  const { data, error } = await supabase
    .from("players")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * upsertPlayer: crea o edita.
 * IMPORTANTE: tu tabla tiene created_at y updated_at NOT NULL.
 * Para evitar errores y mantener consistencia, seteamos updated_at siempre.
 * En insert también enviamos created_at.
 */
export async function upsertPlayer({ id, name, side, rating }) {
  await requireSession();

  const now = new Date().toISOString();

  // payload base
  const payload = {
    group_code: GROUP_CODE,
    name,
    side,
    rating,
    updated_at: now
  };

  // si es nuevo, agregamos created_at (aunque tenga default)
  if (!id) payload.created_at = now;

  // si viene id, se actualiza ese registro
  if (id) payload.id = id;

  const { data, error } = await supabase
    .from("players")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
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

// ---------------- STATE (pool/equipos/turnos en vivo) ----------------
export async function getState() {
  await requireSession();

  const { data, error } = await supabase
    .from("state")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const init = {
      group_code: GROUP_CODE,
      session_date: new Date().toISOString().slice(0, 10),
      total_players: 16,
      pool: [],
      team_a: [],
      team_b: [],
      turns: null,
      scores: null,
      summary: null
    };
    await saveState(init);
    return init;
  }

  return data;
}

export async function saveState(partial) {
  await requireSession();

  const payload = {
    group_code: GROUP_CODE,
    ...partial,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("state")
    .upsert(payload, { onConflict: "group_code" });

  if (error) throw error;
}

// ---------------- HISTORIAL (sessions/results) ----------------
export async function saveTeamsToHistory(session_date, totalPlayers, team_a, team_b) {
  await requireSession();

  const payload = {
    group_code: GROUP_CODE,
    session_date,
    totalPlayers,
    team_a,
    team_b
  };

  const { error } = await supabase
    .from("sessions")
    .upsert(payload, { onConflict: "group_code,session_date" });

  if (error) throw error;
}

export async function saveResultsToHistory(session_date, turns, scores, summary) {
  await requireSession();

  const payload = {
    group_code: GROUP_CODE,
    session_date,
    turns,
    scores,
    summary
  };

  const { error } = await supabase
    .from("results")
    .upsert(payload, { onConflict: "group_code,session_date" });

  if (error) throw error;
}

export async function listHistoryDates() {
  await requireSession();

  const { data, error } = await supabase
    .from("sessions")
    .select("session_date, updated_at, created_at")
    .eq("group_code", GROUP_CODE)
    .order("session_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getHistoryDetail(session_date) {
  await requireSession();

  const { data: sess, error: e1 } = await supabase
    .from("sessions")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", session_date)
    .maybeSingle();
  if (e1) throw e1;

  const { data: res, error: e2 } = await supabase
    .from("results")
    .select("*")
    .eq("group_code", GROUP_CODE)
    .eq("session_date", session_date)
    .maybeSingle();
  if (e2) throw e2;

  return { session: sess || null, results: res || null };
}
