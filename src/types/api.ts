export class ApiError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}
export function required(value: unknown, field: string, multiline = false): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192 || (multiline ? /[\0]/ : /[\r\n\0]/).test(value))
    throw new ApiError('INVALID_INPUT', `${field} must be a nonempty string of at most 8192 characters with no forbidden control characters.`);
  return value.trim();
}
export function jsonOutput(text: string): any {
  try { return JSON.parse(text); } catch { throw new ApiError('CLI_OUTPUT_INVALID', 'OpenClaw returned invalid JSON. Check CLI compatibility.', 502); }
}
