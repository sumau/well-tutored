export const APPROVED_TUTOR_ACCENTS = [
  "#D98F7F",
  "#D8B267",
  "#B5A1CC",
  "#83B7B0",
  "#9DBB83",
  "#8EA8CE",
  "#C98B9B",
  "#A88DBD",
  "#7FA6A0",
  "#8B9FC2",
  "#D08C76",
  "#C2A06E",
  "#B48C9E",
  "#8C8FB5",
  "#73A9A1",
  "#8FAE7E",
  "#A997C7",
  "#7899B5",
  "#C18A9A",
  "#9C9A72",
] as const;

const legacyAccentMap: Record<string, (typeof APPROVED_TUTOR_ACCENTS)[number]> = {
  "#E7C5B5": "#D98F7F",
  "#E0D1B8": "#D8B267",
  "#D8CDE0": "#B5A1CC",
  "#C9D9D5": "#83B7B0",
  "#C7D5C5": "#9DBB83",
  "#E9E0D5": "#8EA8CE",
  "#D5E0D5": "#8EA8CE",
};

const approvedAccentSet = new Set<string>(APPROVED_TUTOR_ACCENTS);

export function normalizeTutorTint(tint: string | null | undefined): string {
  const normalized = tint?.toUpperCase();
  return normalized && approvedAccentSet.has(normalized)
    ? normalized
    : (normalized && legacyAccentMap[normalized]) || "#8EA8CE";
}