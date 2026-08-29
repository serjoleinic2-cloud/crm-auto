export function safeFolderName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim();
}
