export interface SupabaseConfig {
  url?: string;
  anonKey?: string;
}

export function createSupabaseReadyClient(config: SupabaseConfig) {
  const configured = Boolean(config.url && config.anonKey);
  return {
    configured,
    async syncLocalSession() {
      if (!configured) {
        return { skipped: true, reason: "supabase_not_configured" };
      }
      return { skipped: true, reason: "supabase_adapter_placeholder" };
    }
  };
}
