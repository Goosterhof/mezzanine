import vueParser from "vue-eslint-parser";
import tsParser from "@typescript-eslint/parser";
import vuePlugin from "eslint-plugin-vue";
import tsPlugin from "@typescript-eslint/eslint-plugin";

// The Workbench's flat config — minimal but honest.
// Vue + TS + the rules that pay rent. We do not ship a 200-rule monolith
// here; the lab's other gadgets have shown that the rules that matter are
// the ones that catch real classes of bugs (no-unused-vars, no-explicit-any
// in TS, vue/multi-word-component-names off because we use single words like
// `App` and `TopBar`).

export default [
  {
    ignores: ["dist/**", "src-tauri/target/**", "src-tauri/gen/**", "node_modules/**"],
  },
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",
        extraFileExtensions: [".vue"],
      },
    },
    plugins: {
      vue: vuePlugin,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...vuePlugin.configs["flat/recommended"].rules,
      "vue/multi-word-component-names": "off",
      "vue/no-multiple-template-root": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
