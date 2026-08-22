import { createClient } from "@supabase/supabase-js";

// Cloud mirror + multi-device sync target only (spec Part B §3, §5). expo-sqlite
// is the source of truth; nothing here blocks a local write.
//
// SECURITY (spec Part A §5.2 / CLAUDE.md): only the Supabase anon/public key
// ever goes in EXPO_PUBLIC_* env vars / the built APK. The service-role key
// must NEVER be referenced from this app — privileged operations stay in
// Edd's hands (Supabase dashboard / a separate server-side tool), never here.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. " +
      "The app still works fully offline (expo-sqlite is the source of truth); " +
      "cloud backup/sync will simply stay pending until these are configured. " +
      "See .env.example."
  );
}

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key"
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
