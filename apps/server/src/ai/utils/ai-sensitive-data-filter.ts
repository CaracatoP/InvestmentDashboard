const sensitiveKeyPattern = /(password|senha|token|secret|api.?key|authorization|cookie|cpf|cnpj|email|phone|telefone|address|endereco|mongodb|uri|stack|hash)/i;
const maxStringLength = 700;
const maxArrayLength = 80;

export function filterSensitiveData<T>(value: T, depth = 0): T {
  if (depth > 8) return "[truncated]" as T;
  if (typeof value === "string") {
    return (value.length > maxStringLength ? `${value.slice(0, maxStringLength)}...` : value) as T;
  }
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Date) return value.toISOString() as T;

  if (Array.isArray(value)) {
    return value.slice(0, maxArrayLength).map((item) => filterSensitiveData(item, depth + 1)) as T;
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((accumulator, [key, entry]) => {
    if (key.startsWith("_") || sensitiveKeyPattern.test(key)) return accumulator;
    accumulator[key] = filterSensitiveData(entry, depth + 1);
    return accumulator;
  }, {}) as T;
}

export function stringifySafeContext(value: unknown) {
  return JSON.stringify(filterSensitiveData(value), null, 2);
}
