import { boardgameModule } from "@/modules/boardgame";
import { fitnessModule } from "@/modules/fitness";
import { foodModule } from "@/modules/food";
import { realestateModule } from "@/modules/realestate";
import type { ModuleDefinition, ModuleId } from "./types";

const modules: Record<ModuleId, ModuleDefinition> = { food: foodModule, boardgame: boardgameModule, fitness: fitnessModule, realestate: realestateModule };

export const getModule = (id: string): ModuleDefinition | undefined => modules[id as ModuleId];
