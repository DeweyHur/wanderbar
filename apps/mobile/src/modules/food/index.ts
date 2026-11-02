import { FOOD_CATEGORIES } from "@wanderbar/route";
import type { ModuleDefinition } from "@/core/modules/types";

/** Food & day-route module (stage 1). Screens, share parsers and rules get added milestone by milestone. */
export const foodModule: ModuleDefinition = {
  id: "food",
  namespace: "food",
  linkKinds: ["yelp", "gmaps"],
  categories: FOOD_CATEGORIES,
};
