import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Flat ESLint configuration (ESLint 10 / typescript-eslint 8).
// See docs/naming-conventions.md for the prefix rules and their exceptions.
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "coverage/**",
      ".direnv/**",
      ".cache/**",
      "bun.lock",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  // The flat-config file itself is not part of the TS project: lint it without type information.
  {
    files: ["eslint.config.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },

  {
    languageOptions: {
      parserOptions: {
        // eslint.config.js lives outside the TS project; let the default project cover it.
        projectService: { allowDefaultProject: ["eslint.config.js"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // External data must be validated, never typed as `any` (spec §5.1, §13).
      "@typescript-eslint/no-explicit-any": "error",

      // Parameters follow the p_ convention; intentionally-unused identifiers use a leading underscore.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^p_|^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // Floating async calls (e.g. fire-and-forget refresh) must be explicitly `void`-handled.
      "@typescript-eslint/no-floating-promises": "error",

      // Naming convention, enforced where practical (spec §13):
      // module-scope function-like bindings must be f_/fh_ (runtime/helper functions)
      // or PascalCase (Solid components / JSX, an imposed exception per OpenCode docs).
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Program > VariableDeclaration > VariableDeclarator:not([id.name=/^(f_|fh_|[A-Z])/])[init.type='ArrowFunctionExpression'], Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator:not([id.name=/^(f_|fh_|[A-Z])/])[init.type='ArrowFunctionExpression']",
          message:
            "Module-scope function bindings must use the f_ or fh_ prefix (PascalCase is allowed only for Solid/JSX components). See docs/naming-conventions.md.",
        },
        {
          selector:
            "Program > VariableDeclaration > VariableDeclarator:not([id.name=/^(f_|fh_|[A-Z])/])[init.type='FunctionExpression'], Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator:not([id.name=/^(f_|fh_|[A-Z])/])[init.type='FunctionExpression']",
          message:
            "Module-scope function bindings must use the f_ or fh_ prefix (PascalCase is allowed only for Solid/JSX components). See docs/naming-conventions.md.",
        },
        {
          selector:
            "FunctionDeclaration:not([id.name=/^(f_|fh_|[A-Z])/])",
          message:
            "Function declarations must use the f_ or fh_ prefix (PascalCase is allowed only for Solid/JSX components). See docs/naming-conventions.md.",
        },
      ],
    },
  },
);
