import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/out/**", "**/coverage/**", "**/release/**", "pnpm-lock.yaml"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.{mjs,js}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["apps/desktop/scripts/e2e.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  prettier,
);
