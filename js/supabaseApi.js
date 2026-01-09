export async function saveResultsToHistory(session_date, turns, scores, summary) {
  await requireSession();

  // Asegura formato YYYY-MM-DD para columna DATE
  const date = String(session_date).slice(0, 10);

  const payload = {
    group_code: GROUP_CODE,
    session_date: date,
    turns,
    scores,
    summary,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from("results")
    .upsert(payload, { onConflict: "group_code,session_date" });

  if (error) throw error;
}
