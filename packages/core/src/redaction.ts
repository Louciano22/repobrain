const SECRET_KEY_HINTS = [
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "password",
  "refresh_token",
  "secret",
  "token"
];

const SECRET_VALUE_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{10,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{10,}\b/g,
  /\bghp_[A-Za-z0-9_]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\b[A-Za-z0-9+/]{32,}={0,2}\b/g
];

export function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase().replaceAll("-", "_");
  return SECRET_KEY_HINTS.some((hint) => normalized.includes(hint));
}

export function redactText(input: string): string {
  return SECRET_VALUE_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, "[REDACTED_SECRET]"),
    input
  );
}

export function redactRecord<T extends Record<string, unknown>>(input: T): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (isSecretKey(key)) {
      output[key] = "[REDACTED_SECRET]";
    } else if (typeof value === "string") {
      output[key] = redactText(value);
    } else {
      output[key] = value;
    }
  }

  return output;
}
