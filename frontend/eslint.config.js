import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config. Pairs with `npm run lint` (and the lint step in
 * .github/workflows/ci.yml). Type-checking lives in `npm run build`
 * (tsc --noEmit); this config focuses on lint rules tsc can't catch
 * on its own — React hook rules, unused vars, fast-refresh-safe exports.
 */
export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Allow `_`-prefixed args/locals to skip the unused-vars check —
      // useful when typing handler signatures that accept ignored params.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // `any` is sometimes the pragmatic choice in glue code; warn rather
      // than error so it shows up in review without blocking CI.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // Tests can use `any` freely and may export non-component helpers.
    files: ["src/tests/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-refresh/only-export-components": "off",
    },
  },
);
