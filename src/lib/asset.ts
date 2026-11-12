// Where the app is served from ("/" locally, "/<repo>/" on GitHub Pages). Files in public/ are addressed through this.
export const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
