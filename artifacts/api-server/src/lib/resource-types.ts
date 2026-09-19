export const RESOURCE_TYPES = [
  "Study note",
  "Guide",
  "Essay",
  "Revision notes",
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

const legacyResourceTypes: Record<string, ResourceType> = {
  resource: "Study note",
  "study note": "Study note",
  "problem-solving note": "Study note",
  "exam note": "Revision notes",
  "revision note": "Revision notes",
  "revision notes": "Revision notes",
  "study guide": "Guide",
  guide: "Guide",
  "essay guide": "Guide",
  essay: "Essay",
};

export function normalizeResourceType(value: string): ResourceType {
  const normalized = legacyResourceTypes[value.trim().toLowerCase()];
  if (!normalized) {
    throw new Error(`Unsupported resource type: ${value}`);
  }
  return normalized;
}