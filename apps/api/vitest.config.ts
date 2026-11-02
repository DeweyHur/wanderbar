import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Each test file boots in-memory Postgres (PGlite); one file at a time keeps memory low.
  test: { include: ["test/**/*.test.ts"], fileParallelism: false },
});
