import js from "@eslint/js";
import hooks from "eslint-plugin-react-hooks";
import refresh from "eslint-plugin-react-refresh";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/src/api/schema.d.ts",
      "**/target/**",
      "**/.local/**",
      "**/output/**",
      "**/coverage/**",
      "**/.playwright-cli/**",
      "**/.{claude,codex,agents,opencode,pi,cursor}/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    plugins: { "simple-import-sort": simpleImportSort },
    rules: { curly: ["error", "all"], "simple-import-sort/imports": "error", "simple-import-sort/exports": "error" },
  },
  { files: ["**/*.{js,mjs,cjs}", "**/vite.config.ts"], languageOptions: { globals: globals.node } },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": hooks, "react-refresh": refresh },
    rules: { ...hooks.configs.recommended.rules, "react-refresh/only-export-components": "warn" },
  },
);
