/** Web: the session lives in an httpOnly cookie set by the server; JS never sees the token. */
export const sessionStore = {
  mode: "cookie" as "bearer" | "cookie",
  load: async (): Promise<string | null> => null,
  save: async (_token: string | null) => {},
};
