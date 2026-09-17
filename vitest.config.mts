import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", restoreMocks: true },
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
});
