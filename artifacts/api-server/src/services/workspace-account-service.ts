import { clerkClient } from "@clerk/express";
import { and, asc, count, eq, ilike } from "drizzle-orm";
import {
  db,
  tutorsTable,
  workspaceAccountsTable,
} from "@workspace/db";
import { splitTutorName } from "../lib/tutor-names";
import { tutorSlugBase } from "../lib/tutor-slugs";
import {
  APPROVED_TUTOR_ACCENTS,
  normalizeTutorTint,
} from "../lib/tutor-accents";
import { applyTutorDraft } from "../presenters/tutor-presenter";

export type WorkspaceAccount = typeof workspaceAccountsTable.$inferSelect;

export async function findOrProvisionFromClerkUser(
  userId: string,
): Promise<WorkspaceAccount | null> {
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.emailAddresses.find(
    (item) => item.id === user.primaryEmailAddressId,
  );
  const email = primaryEmail?.emailAddress ?? "";

  const [existing] = await db
    .select()
    .from(workspaceAccountsTable)
    .where(eq(workspaceAccountsTable.clerkUserId, userId))
    .limit(1);

  if (existing) {
    if (
      primaryEmail?.verification?.status === "verified" &&
      email !== existing.email
    ) {
      const [updated] = await db
        .update(workspaceAccountsTable)
        .set({ email })
        .where(eq(workspaceAccountsTable.id, existing.id))
        .returning();
      return ensureTutorDraft(updated ?? existing);
    }
    return ensureTutorDraft(existing);
  }

  if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
    return null;
  }

  const [existingByEmail] = await db
    .select()
    .from(workspaceAccountsTable)
    .where(ilike(workspaceAccountsTable.email, email))
    .orderBy(asc(workspaceAccountsTable.id))
    .limit(1);
  if (existingByEmail) {
    return ensureTutorDraft(existingByEmail);
  }

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || email;

  const created = await db.transaction(async (tx) => {
    const [createdByAnotherRequest] = await tx
      .select()
      .from(workspaceAccountsTable)
      .where(eq(workspaceAccountsTable.clerkUserId, userId))
      .limit(1);
    if (createdByAnotherRequest) return createdByAnotherRequest;

    const [createdByAnotherEmail] = await tx
      .select()
      .from(workspaceAccountsTable)
      .where(ilike(workspaceAccountsTable.email, email))
      .orderBy(asc(workspaceAccountsTable.id))
      .limit(1);
    if (createdByAnotherEmail) return createdByAnotherEmail;

    const [createdAccount] = await tx
      .insert(workspaceAccountsTable)
      .values({
        clerkUserId: userId,
        email,
        displayName,
        role: "pending",
      })
      .returning();
    return createdAccount;
  });
  return ensureTutorDraft(created);
}

export async function availableTutorAccents(tutorId: number | null) {
  const tutors = await db
    .select({ id: tutorsTable.id, tint: tutorsTable.tint })
    .from(tutorsTable);
  const currentTint = tutorId == null
    ? null
    : tutors.find((tutor) => tutor.id === tutorId)?.tint;
  const usedByOthers = new Set(
    tutors
      .filter((tutor) => tutor.id !== tutorId)
      .map((tutor) => normalizeTutorTint(tutor.tint)),
  );

  return APPROVED_TUTOR_ACCENTS.filter(
    (accent) =>
      !usedByOthers.has(accent) ||
      (currentTint != null && normalizeTutorTint(currentTint) === accent),
  );
}

export async function uniqueTutorSlug(name: string) {
  const base = tutorSlugBase(name);
  const tutors = await db
    .select({ name: tutorsTable.name, slug: tutorsTable.slug })
    .from(tutorsTable);
  const usedSlugs = new Set(
    tutors.flatMap((tutor) => [tutor.slug, tutorSlugBase(tutor.name)]),
  );

  let candidate = base;
  let suffix = 2;
  while (usedSlugs.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function tutorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1
    ? parts
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
    : name.trim().slice(0, 2)
  ).toUpperCase();
}

export async function ensureTutorDraft(
  account: WorkspaceAccount,
): Promise<WorkspaceAccount> {
  if (account.role !== "tutor" || account.tutorId != null) return account;

  const [defaultTint] = await availableTutorAccents(null);
  if (!defaultTint) return account;

  const displayName = account.displayName.trim() || account.email;
  const { firstName, lastName } = splitTutorName(displayName);
  const name = [firstName, lastName].filter(Boolean).join(" ") || displayName;
  const tutorSlug = await uniqueTutorSlug(name);
  const [{ value: tutorCount }] = await db
    .select({ value: count() })
    .from(tutorsTable);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(workspaceAccountsTable)
      .where(eq(workspaceAccountsTable.id, account.id))
      .limit(1);
    if (!current || current.role !== "tutor" || current.tutorId != null) {
      return current ?? account;
    }

    const [tutor] = await tx
      .insert(tutorsTable)
      .values({
        name,
        firstName,
        lastName,
        initials: tutorInitials(name),
        subject: "",
        support: "",
        university: "",
        qualification: "",
        bio: "",
        style: "",
        profileSummary: "",
        teachingIntro: "",
        teachingPoints: [],
        rate: "0",
        availability: "unavailable",
        tint: defaultTint,
        profileStatus: "draft",
        slug: tutorSlug,
        sortOrder: Number(tutorCount),
      })
      .returning();

    const [updated] = await tx
      .update(workspaceAccountsTable)
      .set({ tutorId: tutor.id })
      .where(eq(workspaceAccountsTable.id, current.id))
      .returning();
    return updated ?? current;
  });
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}