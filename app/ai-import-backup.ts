/** Prevent an AI import unless an intact rollback snapshot can be recovered. */
interface StorageWriter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function ensureAiImportBackup(
  storage: StorageWriter,
  key: string,
  snapshot: unknown,
): boolean {
  try {
    const alreadyStored = storage.getItem(key);
    if (alreadyStored !== null) {
      // Never replace an older backup with the state after a previous import.
      const old: unknown = JSON.parse(alreadyStored);
      if (!old || typeof old !== "object") return false;
      const parsed = old as Record<string, unknown>;
      return parsed.schema === "fabhexagrogne-ai-import-backup" &&
        parsed.version === 2 &&
        Boolean(parsed.memory) &&
        Boolean(parsed.league) &&
        Boolean(parsed.hybridBrain);
    }
    const serialized = JSON.stringify(snapshot);
    storage.setItem(key, serialized);
    return storage.getItem(key) === serialized;
  } catch {
    return false;
  }
}
