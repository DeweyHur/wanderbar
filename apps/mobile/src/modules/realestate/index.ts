import type { ModuleDefinition } from "@/core/modules/types";

/** Real estate: houses seen at open houses, each member's tour records (photos by room, scores, notes), and where each house stands. */
export const realestateModule: ModuleDefinition = {
  id: "realestate",
  namespace: "realestate",
  linkKinds: ["zillow", "redfin", "realtor"],
  categories: [],
};
