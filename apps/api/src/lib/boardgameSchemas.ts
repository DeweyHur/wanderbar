import { z } from "zod";
import { GAME_LINK_KINDS } from "./boardgame";

export const LinkSchema = z.object({ kind: z.enum(GAME_LINK_KINDS), url: z.string().max(2000), label: z.string().max(60).nullable().optional() });

export const GameSchema = z.object({
  name: z.string().max(200).optional(),
  memo: z.string().max(4000).optional(),
  links: z.array(LinkSchema).max(20).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
});

export const SeriesSchema = z.object({
  title: z.string().max(80).optional(),
  weekday: z.number().int().optional(),
  time: z.string().max(5).optional(),
  everyWeeks: z.number().int().optional(),
  startDate: z.string().max(10).optional(),
  location: z.string().max(200).optional(),
});

export const NightSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)).optional(),
  date: z.string().max(10).optional(),
  time: z.string().max(5).optional(),
  location: z.string().max(200).optional(),
  note: z.string().max(4000).optional(),
  pickerId: z.string().max(64).nullable().optional(),
});
