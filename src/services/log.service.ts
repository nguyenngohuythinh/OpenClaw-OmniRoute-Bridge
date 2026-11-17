// The ring holds operation metadata only; never store subprocess stderr/request bodies.
export class LogService {
  private events: string[] = [];
  add(message: string) { this.events.push(`${new Date().toISOString()} ${message}`); this.events = this.events.slice(-500); }
  tail(lines: number) { return this.events.slice(-lines); }
}
export function collectSecrets(config: unknown): Set<string> {
  const secrets = new Set<string>();
  function visit(value: unknown, sensitive = false) {
    if (typeof value === 'string' && sensitive && value) secrets.add(value);
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value))
      visit(child, sensitive || /api.?key|token|password|secret|authorization|headers|credential|cookie|private.?key|access.?key/i.test(key));
  }
  visit(config); return secrets;
}
export function redact(text: string, config: unknown, extra: string[] = []): string {
  const secrets = new Set([...collectSecrets(config), ...extra.filter(Boolean)]);
  function sanitize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) =>
      [key, /api.?key|token|password|secret|authorization|headers|credential|cookie|private.?key|access.?key/i.test(key) ? '[REDACTED]' : sanitize(child)]));
    return value;
  }
  let result = text.split('\n').map(line => {
    try { return JSON.stringify(sanitize(JSON.parse(line))); } catch { return line; }
  }).join('\n');
  for (const secret of [...secrets].sort((a,b) => b.length - a.length)) {
    result = result.split(JSON.stringify(secret).slice(1, -1)).join('[REDACTED]');
    result = result.split(secret).join('[REDACTED]');
  }
  return result.replace(/(Bearer|Basic)\s+[^\s"',}]+/gi, '$1 [REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/((?:api[_-]?key|token|password|secret|authorization|credential(?:s)?|cookie|access[_-]?key)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,}]+)/gi, '$1[REDACTED]')
    .replace(/\b(?:sk-|or_|omni_)[A-Za-z0-9_-]{8,}/g, '[REDACTED]');
}
