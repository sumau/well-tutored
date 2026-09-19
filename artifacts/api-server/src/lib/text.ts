export function truncateAtWordBoundary(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const shortened = trimmed.slice(0, maxLength + 1);
  const boundary = shortened.lastIndexOf(" ");
  return (boundary > 0 ? shortened.slice(0, boundary) : shortened.slice(0, maxLength)).trim();
}

const WORDS_PER_MINUTE = 200;

export function estimateReadMinutes(
  body: string,
  sections: Array<{ heading: string; body: string }> = [],
): number {
  const words = [body, ...sections.flatMap((section) => [section.heading, section.body])]
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}