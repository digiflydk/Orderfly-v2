export function isMissingServerAction(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to find server action|server action\s+["'][^"']+["']\s+was not found on the server/i.test(message);
}
