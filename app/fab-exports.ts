/** Immutable Fab exports staged into the APK from a pinned GitHub commit at build time. */
export const FAB_EXPORT_FILES = {
  ai: "FabHexaGrogne-IA-ligue-cycle-1341.json",
  corpus: "FabHexaBrain-V2-corpus-2026-10-08.json",
  human: "FabHexaGrogne-victoires-humaines-2026-10-08.json",
} as const;

export type FabExportKind = keyof typeof FAB_EXPORT_FILES;

export function validateFabExport(kind: FabExportKind, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("L'export Fab n'est pas un objet JSON valide.");
  }
  const data = value as Record<string, unknown>;
  if (kind === "ai") {
    const league = data.selfPlayLeague as Record<string, unknown> | undefined;
    if (
      data.schema !== "fabhexagrogne-ai-pack" ||
      data.version !== 9 ||
      data.gameVersion !== "3.1.1-t3" ||
      data.architectureId !== "fabhexabrain-v3-hybrid-r15-hexconv32-32-48" ||
      league?.cycle !== 1341 ||
      !data.modules
    ) throw new Error("Le pack IA Fab T3 est incompatible.");
  } else if (kind === "corpus") {
    if (
      data.schema !== "fabhexabrain" ||
      data.version !== 2 ||
      data.rulesVersion !== 15 ||
      data.architectureId !== "fabhexabrain-v2-policy-value6-hex11-r15" ||
      !Array.isArray(data.samples)
    ) throw new Error("Le corpus Fab V2 n'est pas compatible avec les règles v15.");
  } else {
    const encoding = data.encoding as Record<string, unknown> | undefined;
    if (
      data.schema !== "fabhexagrogne-human-victories" ||
      data.version !== 1 ||
      encoding?.boardRadius !== 5 ||
      !Array.isArray(data.games)
    ) throw new Error("Les victoires humaines Fab ne sont pas compatibles.");
  }
}

export async function loadBundledFabExport(
  kind: FabExportKind,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const result = await fetcher("/fab-exports/" + FAB_EXPORT_FILES[kind]);
  if (!result.ok) throw new Error("Export Fab absent de l'APK : " + FAB_EXPORT_FILES[kind]);
  const value: unknown = await result.json();
  validateFabExport(kind, value);
  return value;
}
