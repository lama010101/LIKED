import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // P0-09 (PLAN-V2-002 §7.2 item 9): no hard-coded user-visible strings in
  // the new v2 directories — every UI string goes through next-intl.
  {
    files: [
      "app/inbox/**",
      "app/r/**",
      "app/s/**",
      "app/settings/**",
      "app/delete-account/**",
      "components/v2/**",
    ],
    rules: {
      "react/jsx-no-literals": ["error", { noStrings: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-source scripts and edge functions:
    "scripts/**",
    "supabase/functions/**",
    // Chrome extension build output (lint the source in extension/src instead):
    "extension/dist/**",
    "extension/node_modules/**",
    "temp_*.js",
  ]),
]);

export default eslintConfig;
