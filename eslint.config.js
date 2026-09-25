import eslint from "@eslint/js";
import importX from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const sourceFiles = ["**/*.{ts,tsx}"];
const testFiles = ["**/*.{test,spec}.{ts,tsx}", "packages/testkit/**/*.ts"];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/.wrangler/**",
      "apps/capacitor/android/**",
      "apps/capacitor/ios/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked.map((config) => ({ ...config, files: sourceFiles })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({ ...config, files: sourceFiles })),
  importX.flatConfigs.recommended,
  importX.flatConfigs.typescript,
  {
    files: sourceFiles,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // Reader's styled Select renders a labelable combobox button.
      "jsx-a11y/label-has-associated-control": ["error", { controlComponents: ["Select"] }],
      ...reactHooks.configs.flat.recommended.rules,
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports", prefer: "type-imports" },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      complexity: ["error", 15],
      curly: ["error", "all"],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "import-x/first": "error",
      "import-x/no-absolute-path": "error",
      "import-x/no-cycle": ["error", { ignoreExternal: true }],
      "import-x/no-duplicates": "error",
      "import-x/no-relative-packages": "error",
      "import-x/no-self-import": "error",
      "import-x/no-useless-path-segments": "error",
      "import-x/order": [
        "error",
        {
          alphabetize: { caseInsensitive: true, order: "asc" },
          groups: ["builtin", "external", "internal", "parent", "sibling", "index", "type"],
          "newlines-between": "always",
        },
      ],
      "no-alert": "error",
      "max-depth": ["error", 4],
      "max-lines": ["error", { max: 260, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 120, skipBlankLines: true, skipComments: true }],
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='sort'][arguments.length=0]",
          message: "Supply an explicit comparator so ordering is intentional.",
        },
      ],
      "no-throw-literal": "error",
      "prefer-const": "error",
    },
    settings: {
      "import-x/resolver": {
        typescript: true,
      },
    },
  },
  {
    files: ["packages/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react/*",
                "electron",
                "@capacitor/*",
                "@mdbase-dev/connect",
                "@embedpdf/*",
                "@readium/*",
                "@codemirror/*",
                "@mdbase-reader/*",
              ],
              message: "The core is framework-free. Depend on a core port instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/connect/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react/*", "electron", "@capacitor/*", "@embedpdf/*", "@readium/*"],
              message: "The Connect adapter must not depend on UI, shells, or renderers.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/reader/src/**/*.{ts,tsx}"],
    ignores: ["apps/reader/src/ConnectedDocument.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mdbase-reader/renderer-*", "@embedpdf/*", "@readium/*"],
              message:
                "Reader workspace code is renderer-neutral. Add renderer integration through ConnectedDocument.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/reader/src/source-workspace-layout.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react/*", "@mdbase-reader/connect", "@mdbase-reader/renderer-*"],
              message: "Workspace layout state must remain a framework-free application model.",
            },
          ],
        },
      ],
    },
  },
  {
    files: testFiles,
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    files: ["**/scripts/**/*.mjs", "*.config.js", "*.config.ts"],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      "import-x/no-named-as-default": "off",
      "import-x/no-named-as-default-member": "off",
      "no-console": "off",
    },
  },
);
