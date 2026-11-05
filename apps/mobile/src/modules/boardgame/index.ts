import type { ModuleDefinition } from "@/core/modules/types";

/** Board game night: regular meetups, who picks, the queue, 10-point ratings, the leaderboard. */
export const boardgameModule: ModuleDefinition = {
  id: "boardgame",
  namespace: "boardgame",
  linkKinds: ["bgg", "bga", "tts", "rulebook", "video", "other"],
  categories: [],
};
