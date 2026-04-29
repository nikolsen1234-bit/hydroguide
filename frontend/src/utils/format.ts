export function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("nn-NO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  }).format(value);
}

function normalizeLocationPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatLocationLabel(location: string): string {
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return location.trim();
  }

  const seen = new Set<string>();
  const uniqueParts: string[] = [];

  parts.forEach((part) => {
    const key = normalizeLocationPart(part);
    if (seen.has(key)) return;
    seen.add(key);
    uniqueParts.push(part);
  });

  return uniqueParts.join(", ");
}
