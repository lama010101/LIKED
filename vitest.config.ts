import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "e2e/**", ".next/**", "extension/**"],
    environment: "node",
    globals: false,
  },
});
