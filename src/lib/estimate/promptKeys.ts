// The PromptOverride row keys — plain strings, importable from the client
// (the loader beside this file reads the db and cannot be).
export const OVERRIDE_KEYS = {
  master: "master",
  system: "system",
  procedureRules: "procedure-rules",
  preamble: (specialtyId: string) => `specialty:${specialtyId}:preamble`,
  procedure: (specialtyId: string) => `specialty:${specialtyId}:procedure`,
  /** A part of the REMODEL ESTIMATING METHOD (read, kitchen, bathroom, interior, chains, rules). */
  remodel: (part: string) => `remodel:${part}`,
} as const;
