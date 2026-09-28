// Substitui src/lib/supabase.js na prévia (sem rede, sem sessão).
const vazio = () => ({ data: null, error: null })
export const supabase = {
  storage: { from: () => ({ createSignedUrl: async () => vazio(), upload: async () => vazio() }) },
  auth: { getSession: async () => ({ data: { session: null } }) },
}
