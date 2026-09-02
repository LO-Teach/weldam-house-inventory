import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Weldam House:
    // `astryx theme build` output. Regenerate it with `npm run theme:build`,
    // never hand-edit it, and do not lint it — the emitted .d.ts uses a triple
    // slash reference to pull in the custom Badge variants, which is the
    // supported mechanism for module augmentation and not ours to change.
    "src/theme/built/**",
    ".work/**",
  ]),
]);

export default eslintConfig;
