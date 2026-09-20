import { and, eq } from "drizzle-orm";
import type { Response } from "express";
import { db, tutorsTable } from "@workspace/db";
import { publicTutorSlug } from "./tutor-slugs";

export const PUBLIC_TUTOR_CACHE_CONTROL =
  "public, max-age=30, stale-while-revalidate=60";

export function setPublicTutorCacheHeaders(res: Response) {
  res.set("Cache-Control", PUBLIC_TUTOR_CACHE_CONTROL);
}

export async function findPublishedTutor(slug: string) {
  const [directMatch] = await db
    .select()
    .from(tutorsTable)
    .where(
      and(
        eq(tutorsTable.slug, slug),
        eq(tutorsTable.profileStatus, "published"),
      ),
    )
    .limit(1);

  if (directMatch) return directMatch;

  const publishedTutors = await db
    .select()
    .from(tutorsTable)
    .where(eq(tutorsTable.profileStatus, "published"));

  return publishedTutors.find(
    (tutor) => publicTutorSlug(tutor.name) === slug,
  );
}

export function canReceivePublicEnquiries(
  tutor: Pick<typeof tutorsTable.$inferSelect, "availability">,
) {
  return tutor.availability !== "unavailable";
}