/**
 * Deterministic JSON serializer.
 *
 * Like JSON.stringify, but object keys are sorted recursively so the same
 * structural value always produces the same string regardless of how the
 * object was constructed. Use this when the output is consumed as a cache
 * key, dedup signature, or similar identity comparison — never when the
 * output is sent over the wire as a request body.
 *
 * Behaviour mirrors JSON.stringify for primitives, undefined-in-array
 * (-> "null") and undefined-in-object (-> key omitted).
 */
export function stableStringify(value) {
  if (value === undefined) {
    return JSON.stringify(value);
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (item === undefined ? "null" : stableStringify(item)))
      .join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const parts = [];
  for (const key of keys) {
    const child = value[key];
    if (child === undefined) {
      continue;
    }
    parts.push(`${JSON.stringify(key)}:${stableStringify(child)}`);
  }
  return `{${parts.join(",")}}`;
}
