export type ModuleId = "food" | "boardgame" | "fitness";

/**
 * What a module plugs into the shared core. Stage 1 fills in only what exists so far; item and event
 * types, rating scale, share parsers, recommendation rules and tabs are added as milestones land.
 */
export interface ModuleDefinition {
  id: ModuleId;
  /** i18n namespace; "<namespace>:name" is the module's display name. */
  namespace: string;
  /** External link kinds items of this module can carry. */
  linkKinds: readonly string[];
  /** Category keys, translated as "<namespace>:category.<key>". Stored as keys, never as text. */
  categories: readonly string[];
}
