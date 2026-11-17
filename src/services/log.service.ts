// The ring holds operation metadata only; never store subprocess stderr/request bodies.
export class LogService {
  private events: string[] = [];
  add(message: string) { this.events.push(`${new Date().toISOString()} ${message}`); this.events = this.events.slice(-500); }
  tail(lines: number) { return this.events.slice(-lines); }
}
export function redact(text: string, config: unknown, extra: string[] = []): string {
  const secrets = new Set(extra.filter(Boolean));
  function visit(value: unknown, sensitive = false) {
    if (typeof value === 'string' && sensitive && value) secrets.add(value);
    if (value && typeof value === 'object') for (const [key, child] of Object.entries(value))
      visit(child, sensitive || /api.?key|token|password|secret|authorization|headers/i.test(key));
  }
  visit(config);
  let result = text;
  for (const secret of [...secrets].sort((a,b) => b.length - a.length)) {
    result = result.split(JSON.stringify(secret).slice(1, -1)).join('[REDACTED]');
    result = result.split(secret).join('[REDACTED]');
  }
  return result.replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:api[_-]?key|token|password|secret|authorization)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,}]+)/gi, '$1[REDACTED]')
    .replace(/\b(?:sk-|or_|omni_)[A-Za-z0-9_-]{8,}/g, '[REDACTED]');
}
