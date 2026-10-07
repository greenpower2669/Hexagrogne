import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
export const isNative = Capacitor.isNativePlatform();
export async function downloadJson(filename: string, value: unknown): Promise<void> {
  const data = JSON.stringify(value, null, 2);
  if (isNative) {
    try {
      const saved = await Filesystem.writeFile({path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8});
      await Share.share({title: filename, files: [saved.uri], dialogTitle: 'Exporter Hexagrogne'});
    } catch (error) {
      window.alert(`Export non terminé : ${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }
  const blob = new Blob([data], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
