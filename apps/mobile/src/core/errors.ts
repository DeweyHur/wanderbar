import type { TFunction } from "i18next";
import { ApiError } from "./api";

/** Turns an API error code (or a thrown code like "auth.no_id_token") into translated text. */
export function errorText(t: TFunction, e: unknown): string {
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : "unknown";
  return t(`errors.${code}`, { defaultValue: e instanceof ApiError ? t("errors.unknown") : String(code) });
}
