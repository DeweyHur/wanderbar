import { boardgameModule } from "@/modules/boardgame";
import { foodModule } from "@/modules/food";
import type { ModuleDefinition, ModuleId } from "./types";

const modules: Record<ModuleId, ModuleDefinition> = { food: foodModule, boardgame: boardgameModule };

export const getModule = (id: string): ModuleDefinition | undefined => modules[id as ModuleId];
