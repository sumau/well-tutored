import { eq } from "drizzle-orm";
import {
  db,
  resourcesTable,
  tutorsTable,
} from "@workspace/db";
import { estimateReadMinutes } from "../lib/text";
import { normalizeResourceType } from "../lib/resource-types";
import { normalizeTutorTint } from "../lib/tutor-accents";

export function toResourceResponse(
  resource: typeof resourcesTable.$inferSelect,
  tutor: Pick<typeof tutorsTable.$inferSelect, "name" | "tint">,
) {
  return {
    id: resource.id,
    slug: resource.slug,
    tutorId: resource.tutorId,
    tutorName: tutor.name,
    title: resource.title,
    subject: resource.subject,
    level: resource.level,
    type: normalizeResourceType(resource.type),
    readMinutes: estimateReadMinutes(resource.body, resource.sections),
    excerpt: resource.excerpt,
    body: resource.body,
    sections: resource.sections,
    publishedAt: resource.publishedAt,
    tint: normalizeTutorTint(tutor.tint),
    status: resource.status,
  };
}

export async function findJoinedResource(id: number) {
  const [row] = await db
    .select({
      resource: resourcesTable,
      tutor: {
        name: tutorsTable.name,
        tint: tutorsTable.tint,
      },
    })
    .from(resourcesTable)
    .innerJoin(tutorsTable, eq(resourcesTable.tutorId, tutorsTable.id))
    .where(eq(resourcesTable.id, id))
    .limit(1);
  return row;
}