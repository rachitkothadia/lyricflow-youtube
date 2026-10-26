/** kuromoji only requires path.join. Preserve extension/HTTP URL schemes in its browser build. */
export function join(...parts: string[]): string {
  const first = parts[0] ?? "";
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(first)) {
    return new URL(parts.slice(1).map(value => value.replace(/^\/+|\/+$/g, "")).join("/"), first.replace(/\/?$/, "/")).href;
  }
  return parts.filter(Boolean).join("/").replace(/\/{2,}/g, "/");
}
