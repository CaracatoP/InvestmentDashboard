export function redactSensitiveText(input: string, secrets: Array<string | undefined> = []) {
  let message = input;

  for (const secret of secrets) {
    if (!secret) continue;
    message = message.split(secret).join("[redacted]");
  }

  return message;
}
