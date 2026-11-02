import { foodModule } from "@/modules/food";
import type { ModuleDefinition, ModuleId } from "./types";

/** Board game night arrives in stage 2; until then such groups show a "not available" notice. */
const modules: Partial<Record<ModuleId, ModuleDefinition>> = { food: foodModule };

export const getModule = (id: string): ModuleDefinition | undefined => modules[id as ModuleId];
