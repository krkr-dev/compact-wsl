const GB = 1024 ** 3;
const MB = 1024 ** 2;

export function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    return `${(bytes / GB).toFixed(1)}GB`;
  }
  return `${Math.round(bytes / MB)}MB`;
}

export function bytesToGB(bytes: number): number {
  return bytes / GB;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 最終更新からの日数（切り捨て）。 */
export function daysSince(date: Date, now = new Date()): number {
  return Math.floor((now.getTime() - date.getTime()) / DAY_MS);
}
