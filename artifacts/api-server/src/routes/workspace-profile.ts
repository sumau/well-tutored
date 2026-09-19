import { Router, type IRouter } from "express";
import { and, eq, ne } from "drizzle-orm";
import {
  DiscardWorkspaceProfileDraftResponse,
  UpdateWorkspaceProfileBody,
  UpdateWorkspaceProfileResponse,
} from "@workspace/api-zod";
import {
  db,
  resourcesTable,
  tutorProfileDraftsTable,
  tutorsTable,
} from "@workspace/db";
import { truncateAtWordBoundary, estimateReadMinutes } from "../lib/text";
import { splitTutorName } from "../lib/tutor-names";
import { publicTutorSlug } from "../lib/tutor-slugs";
import { normalizeTutorTint } from "../lib/tutor-accents";
import {
  requireApproved,
  requireWorkspaceAccount as workspaceAccount,
} from "../auth/workspace-access";
import { isUniqueViolation } from "../services/workspace-account-service";
import {
  applyTutorDraft,
  toTutorResponse,
} from "../presenters/tutor-presenter";
import { isPublishableProfile } from "../domain/workspace-validation";

const router: IRouter = Router();

router.patch("/workspace/profile", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireApproved(account, res)) return;
  if (!account.tutorId) {
    res.status(403).json({ error: "A tutor profile must be assigned first." });
    return;
  }
  const body = UpdateWorkspaceProfileBody.safeParse(req.body);
  if (!body.success) {
    const details = body.error.issues.map((issue) => ({
      path: issue.path.join(".") || "profile",
      message: issue.message,
    }));
    console.warn("Invalid workspace profile update", {
      accountId: account.id,
      details,
    });
    res.status(400).json({
      error: "Please check the profile fields.",
      details,
    });
    return;
  }
  const [existingTutor] = await db
    .select()
    .from(tutorsTable)
    .where(eq(tutorsTable.id, account.tutorId))
    .limit(1);
  if (!existingTutor) {
    res.status(404).json({ error: "Tutor profile not found." });
    return;
  }
  if (existingTutor.profileStatus === "archived") {
    res.status(409).json({
      error: "Restore the tutor profile before editing it.",
    });
    return;
  }
  const [existingDraft] = await db
    .select()
    .from(tutorProfileDraftsTable)
    .where(eq(tutorProfileDraftsTable.tutorId, existingTutor.id))
    .limit(1);
  const editableTutor = applyTutorDraft(existingTutor, existingDraft);

  if (body.data.tint) {
    const otherTutors = await db
      .select({ id: tutorsTable.id, tint: tutorsTable.tint })
      .from(tutorsTable)
      .where(ne(tutorsTable.id, existingTutor.id));
    if (
      otherTutors.some(
        (tutor) => normalizeTutorTint(tutor.tint) === body.data.tint,
      )
    ) {
      res.status(409).json({
        error: "That profile accent is already in use by another tutor.",
      });
      return;
    }
  }

  const {
    rate,
    name: legacyName,
    firstName: requestedFirstName,
    lastName: requestedLastName,
  } = body.data;
  const legacyParts = splitTutorName(legacyName ?? editableTutor.name);
  const nextFirstName =
    requestedFirstName ?? (editableTutor.firstName || legacyParts.firstName);
  const nextLastName =
    requestedLastName ?? (editableTutor.lastName || legacyParts.lastName);
  const nextName =
    [nextFirstName, nextLastName].filter(Boolean).join(" ") ||
    editableTutor.name;
  const nextProfileStatus = body.data.status ?? editableTutor.profileStatus;
  const publishableProfile = {
    firstName: nextFirstName,
    lastName: nextLastName,
    initials: body.data.initials ?? editableTutor.initials,
    subject: body.data.subject ?? editableTutor.subject,
    profileSummary: body.data.profileSummary ?? editableTutor.profileSummary,
    university: body.data.university ?? editableTutor.university,
    qualification: body.data.qualification ?? editableTutor.qualification,
    bio: body.data.bio ?? editableTutor.bio,
    style: body.data.style ?? editableTutor.style,
    teachingIntro: body.data.teachingIntro ?? editableTutor.teachingIntro,
    teachingPoints: body.data.teachingPoints ?? editableTutor.teachingPoints,
    rate: rate == null ? Number(editableTutor.rate) : rate,
    availability: body.data.availability ?? editableTutor.availability,
    tint: body.data.tint ?? normalizeTutorTint(editableTutor.tint),
  };
  if (
    nextProfileStatus === "published" &&
    !isPublishableProfile(publishableProfile)
  ) {
    res.status(400).json({
      error: "Complete the profile before publishing it.",
    });
    return;
  }

  const nextProfile = {
    name: nextName,
    firstName: nextFirstName,
    lastName: nextLastName,
    initials: publishableProfile.initials,
    subject: publishableProfile.subject,
    support: body.data.support ?? editableTutor.support,
    profileSummary: publishableProfile.profileSummary,
    university: publishableProfile.university,
    qualification: publishableProfile.qualification,
    bio: publishableProfile.bio,
    style: publishableProfile.style,
    teachingIntro: truncateAtWordBoundary(publishableProfile.teachingIntro, 200),
    teachingPoints: publishableProfile.teachingPoints,
    rate: publishableProfile.rate,
    availability: publishableProfile.availability,
    tint: publishableProfile.tint,
  };

  let tutor: typeof tutorsTable.$inferSelect;
  try {
    if (nextProfileStatus === "draft") {
      const [draft] = await db
        .insert(tutorProfileDraftsTable)
        .values({
          tutorId: existingTutor.id,
          ...nextProfile,
          rate: String(nextProfile.rate),
        })
        .onConflictDoUpdate({
          target: tutorProfileDraftsTable.tutorId,
          set: {
            ...nextProfile,
            rate: String(nextProfile.rate),
          },
        })
        .returning();
      tutor = applyTutorDraft(existingTutor, draft);
    } else {
      tutor = await db.transaction(async (tx) => {
        const [published] = await tx
          .update(tutorsTable)
          .set({
            ...nextProfile,
            rate: String(nextProfile.rate),
            profileStatus: "published",
          })
          .where(eq(tutorsTable.id, existingTutor.id))
          .returning();
        await tx
          .delete(tutorProfileDraftsTable)
          .where(eq(tutorProfileDraftsTable.tutorId, existingTutor.id));
        return published;
      });
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({
        error: "That profile accent is already in use by another tutor.",
      });
      return;
    }
    throw error;
  }
  const resources = await db
    .select({
      resource: resourcesTable,
      tutor: {
        slug: tutorsTable.slug,
        name: tutorsTable.name,
        tint: tutorsTable.tint,
      },
    })
    .from(resourcesTable)
    .innerJoin(tutorsTable, eq(resourcesTable.tutorId, tutorsTable.id))
    .where(
      and(
        eq(resourcesTable.tutorId, tutor.id),
        eq(resourcesTable.status, "published"),
      ),
    );
  res.json(
    UpdateWorkspaceProfileResponse.parse({
      ...toTutorResponse(
        tutor,
        resources.map(({ resource, tutor: author }) => ({
          ...resource,
          tutorSlug: author.slug,
          tutorName: author.name,
          tutorTint: normalizeTutorTint(author.tint),
          tint: normalizeTutorTint(author.tint),
          readMinutes: estimateReadMinutes(resource.body, resource.sections),
        })),
        nextProfileStatus === "draft"
          ? publicTutorSlug(existingTutor.name)
          : publicTutorSlug(tutor.name),
      ),
    }),
  );
});

router.delete("/workspace/profile/draft", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireApproved(account, res)) return;
  if (!account.tutorId) {
    res.status(403).json({ error: "A tutor profile must be assigned first." });
    return;
  }

  const [tutor] = await db
    .select()
    .from(tutorsTable)
    .where(eq(tutorsTable.id, account.tutorId))
    .limit(1);
  if (!tutor) {
    res.status(404).json({ error: "Tutor profile not found." });
    return;
  }
  if (tutor.profileStatus !== "published") {
    res.status(409).json({
      error: "There is no published profile to restore.",
    });
    return;
  }

  await db
    .delete(tutorProfileDraftsTable)
    .where(eq(tutorProfileDraftsTable.tutorId, tutor.id));

  const resources = await db
    .select({
      resource: resourcesTable,
      author: {
        slug: tutorsTable.slug,
        name: tutorsTable.name,
        tint: tutorsTable.tint,
      },
    })
    .from(resourcesTable)
    .innerJoin(tutorsTable, eq(resourcesTable.tutorId, tutorsTable.id))
    .where(
      and(
        eq(resourcesTable.tutorId, tutor.id),
        eq(resourcesTable.status, "published"),
      ),
    );

  res.json(
    DiscardWorkspaceProfileDraftResponse.parse(
      toTutorResponse(
        tutor,
        resources.map(({ resource, author }) => ({
          ...resource,
          tutorSlug: author.slug,
          tutorName: author.name,
          tutorTint: normalizeTutorTint(author.tint),
          tint: normalizeTutorTint(author.tint),
          readMinutes: estimateReadMinutes(resource.body, resource.sections),
        })),
      ),
    ),
  );
});

export default router;