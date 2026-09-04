import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "tsconfig.tsbuildinfo",
      "prisma/migrations/**",
      "**/*.css",
      // Generated Prisma client + one-off report scripts for the legacy importer.
      "scripts/migrate-v2/.generated/**",
      "scripts/migrate-v2/reports/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];
