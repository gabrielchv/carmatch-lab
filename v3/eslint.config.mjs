import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler heuristics (set-state-in-effect, immutability,
    // preserve-manual-memoization) flag the client-side fetch-on-mount
    // pattern used by the v0 components. They are advisory for this codebase
    // and do not indicate a runtime defect, but they would otherwise drown
    // out real errors — so they are warnings here, not disabled.
    // Migrating these screens to server components removes the pattern
    // entirely; tracked in the v1 notes.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
