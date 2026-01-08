import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const supabase = createClient(
  "TU_PROJECT_URL",
  "TU_ANON_PUBLIC_KEY"
);
