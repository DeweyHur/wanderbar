import { boardgameModule } from "@/modules/boardgame";
import { fitnessModule } from "@/modules/fitness";
import { foodModule } from "@/modules/food";
import type { ModuleDefinition, ModuleId } from "./types";

const modules: Record<ModuleId, ModuleDefinition> = { food: foodModule, boardgame: boardgameModule, fitness: fitnessModule };

export const getModule = (id: string): ModuleDefinition | undefined => modules[id as ModuleId];
