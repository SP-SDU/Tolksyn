import type { AppSettings } from "@/types/settings";

export function isProviderConfigured(settings: AppSettings): boolean {
  const id = settings.provider.id;
  const mode = settings.provider.authModeByProvider[id] ?? "api";
  const auth = settings.provider.auth[id];

  if (mode === "api") {
    return auth?.type === "api" && Boolean(auth.key.trim());
  }

  return Boolean(
    auth?.type === "oauth" &&
    auth.access.trim() &&
    (auth.expires <= 0 || auth.expires > Date.now()),
  );
}
