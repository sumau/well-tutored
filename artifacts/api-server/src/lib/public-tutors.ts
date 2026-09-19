import { and, eq } from "drizzle-orm";
import { db, tutorsTable } from "@workspace/db";
import { publicTutorSlug } from "./tutor-slugs";

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