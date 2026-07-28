import { createHash } from "crypto";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = stable((value as Record<string, unknown>)[key]);
        return accumulator;
      }, {});
  }
  return value;
}

export function buildContextHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
