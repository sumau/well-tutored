import { Router, type IRouter, type Request, type Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, count, eq, ilike, ne } from "drizzle-orm";
import {
  CreateWorkspaceArticleBody,
  CreateWorkspaceArticleResponse,
  CreateWorkspaceTutorBody,
  CreateWorkspaceTutorResponse,
  ArchiveWorkspaceTutorParams,
  ArchiveWorkspaceTutorResponse,
  DeleteWorkspaceArticleParams,
  DeleteWorkspaceTutorParams,
  DiscardWorkspaceProfileDraftResponse,
  GetWorkspaceSessionResponse,
  ListWorkspaceAccountsResponse,
  ListWorkspaceArticlesResponse,
  ListWorkspaceTutorsResponse,
  UpdateWorkspaceAccountBody,
  UpdateWorkspaceAccountParams,
  UpdateWorkspaceAccountResponse,
  UpdateWorkspaceArticleBody,
  UpdateWorkspaceArticleParams,
  UpdateWorkspaceArticleResponse,
  UpdateWorkspaceProfileBody,
  UpdateWorkspaceProfileResponse,
  RestoreWorkspaceTutorParams,
  RestoreWorkspaceTutorResponse,
} from "@workspace/api-zod";
import {
  db,
  resourcesTable,
  tutorProfileDraftsTable,
  workspaceAccountsTable,
  tutorsTable,
} from "@workspace/db";
import { estimateReadMinutes, truncateAtWordBoundary } from "../lib/text";
import { splitTutorName, tutorNameFields } from "../lib/tutor-names";
import { publicTutorSlug, tutorSlugBase } from "../lib/tutor-slugs";
import {
  APPROVED_TUTOR_ACCENTS,
  normalizeTutorTint,
} from "../lib/tutor-accents";
import { normalizeResourceType } from "../lib/resource-types";

const router: IRouter = Router();
type Account = typeof workspaceAccountsTable.$inferSelect;

function isPublishableArticle(article: {
  title: string;
  subject: string;
  level: string;
  type: string;
  excerpt: string;
  body: string;
  sections: Array<{ id: string; heading: string; body: string }>;
}) {
  return (
    article.title.trim().length >= 3 &&
    article.subject.trim().length >= 1 &&
    article.level.trim().length >= 1 &&
    ["Study note", "Guide", "Essay", "Revision notes"].includes(article.type) &&
    article.excerpt.trim().length >= 10 &&
    article.body.trim().length >= 20 &&
    article.sections.every(
      (section) =>
        section.id.trim().length >= 1 &&
        section.heading.trim().length >= 2 &&
        section.body.trim().length >= 10,
    )
  );
}

function isPublishableProfile(profile: {
  firstName: string;
  lastName: string;
  initials: string;
  subject: string;
  profileSummary: string;
  university: string;
  qualification: string;
  bio: string;
  style: string;
  teachingIntro: string;
  teachingPoints: Array<{ title: string; body: string }>;
  rate: number;
  availability: string;
  tint: string;
}) {
  return (
    profile.firstName.trim().length >= 1 &&
    profile.lastName.trim().length >= 1 &&
    profile.initials.trim().length >= 1 &&
    profile.initials.trim().length <= 4 &&
    profile.subject.trim().length >= 2 &&
    profile.profileSummary.trim().length <= 200 &&
    profile.university.trim().length >= 2 &&
    profile.qualification.trim().length >= 2 &&
    profile.bio.trim().length >= 20 &&
    profile.style.trim().length >= 2 &&
    profile.teachingIntro.trim().length >= 20 &&
    profile.teachingIntro.trim().length <= 200 &&
    profile.teachingPoints.length === 3 &&
    profile.teachingPoints.every(
      (point) =>
        point.title.trim().length >= 2 &&
        point.body.trim().length >= 10,
    ) &&
    profile.rate >= 0 &&
    ["accepting", "limited", "unavailable"].includes(profile.availability) &&
    APPROVED_TUTOR_ACCENTS.includes(
      profile.tint as (typeof APPROVED_TUTOR_ACCENTS)[number],
    )
  );
}

async function workspaceAccount(req: Request, res: Response): Promise<Account | null> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

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
    res.status(403).json({
      error:
        "Workspace access requires a verified email address.",
    });
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

    const [created] = await tx
        .insert(workspaceAccountsTable)
      .values({
        clerkUserId: userId,
        email,
        displayName,
        role: "pending",
      })
      .returning();
    return created;
  });
  return ensureTutorDraft(created);
}

function requireApproved(account: Account, res: Response): boolean {
  if (account.role === "pending") {
    res.status(403).json({ error: "Your workspace account is awaiting approval." });
    return false;
  }
  return true;
}

function requireOwner(account: Account, res: Response): boolean {
  if (account.role !== "owner") {
    res.status(403).json({ error: "Owner access required." });
    return false;
  }
  return true;
}

function articleResponse(
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

async function joinedArticle(id: number) {
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

function canEdit(account: Account, tutorId: number) {
  return account.role === "owner" || account.tutorId === tutorId;
}

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "article"}-${Date.now().toString(36).slice(-6)}`;
}

function tutorInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1
    ? parts
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
    : name.trim().slice(0, 2)
  ).toUpperCase();
}

function tutorResponse(
  tutor: typeof tutorsTable.$inferSelect,
  resources: unknown[] = [],
  slug = publicTutorSlug(tutor.name),
) {
  return {
    ...tutor,
    ...tutorNameFields(tutor),
    tint: normalizeTutorTint(tutor.tint),
    teachingIntro: truncateAtWordBoundary(tutor.teachingIntro, 200),
    slug,
    rate: Number(tutor.rate),
    resources,
  };
}

function applyTutorDraft(
  tutor: typeof tutorsTable.$inferSelect,
  draft: typeof tutorProfileDraftsTable.$inferSelect | undefined,
) {
  if (!draft) return tutor;
  return {
    ...tutor,
    name: draft.name,
    firstName: draft.firstName,
    lastName: draft.lastName,
    initials: draft.initials,
    subject: draft.subject,
    support: draft.support,
    profileSummary: draft.profileSummary,
    university: draft.university,
    qualification: draft.qualification,
    bio: draft.bio,
    style: draft.style,
    teachingIntro: draft.teachingIntro,
    teachingPoints: draft.teachingPoints,
    rate: draft.rate,
    availability: draft.availability,
    tint: draft.tint,
    profileStatus:
      tutor.profileStatus === "archived" ? ("archived" as const) : ("draft" as const),
  };
}

async function workspaceTutor(tutor: typeof tutorsTable.$inferSelect) {
  const [draft] = await db
    .select()
    .from(tutorProfileDraftsTable)
    .where(eq(tutorProfileDraftsTable.tutorId, tutor.id))
    .limit(1);
  return applyTutorDraft(tutor, draft);
}

async function uniqueTutorSlug(name: string) {
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

async function availableTutorAccents(tutorId: number | null) {
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

async function ensureTutorDraft(account: Account): Promise<Account> {
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

router.get("/workspace/me", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account) return;

  const [tutor] = account.tutorId
    ? await db
        .select()
        .from(tutorsTable)
        .where(eq(tutorsTable.id, account.tutorId))
        .limit(1)
    : [];
  const editableTutor = tutor ? await workspaceTutor(tutor) : undefined;

  res.json(
    GetWorkspaceSessionResponse.parse({
      id: account.id,
      role: account.role,
      email: account.email,
      displayName: account.displayName,
      availableTutorAccents: await availableTutorAccents(account.tutorId),
      tutor: editableTutor
        ? tutorResponse(
            editableTutor,
            [],
            publicTutorSlug(tutor?.name ?? editableTutor.name),
          )
        : null,
    }),
  );
});

router.get("/workspace/articles", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireApproved(account, res)) return;

  const rows = await db
    .select({
      resource: resourcesTable,
      tutor: {
        name: tutorsTable.name,
        tint: tutorsTable.tint,
      },
    })
    .from(resourcesTable)
    .innerJoin(tutorsTable, eq(resourcesTable.tutorId, tutorsTable.id))
    .where(account.tutorId ? eq(resourcesTable.tutorId, account.tutorId) : undefined)
    .orderBy(asc(resourcesTable.id));
  res.json(
    ListWorkspaceArticlesResponse.parse(
      rows.map((row) => articleResponse(row.resource, row.tutor)),
    ),
  );
});

router.post("/workspace/articles", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireApproved(account, res)) return;
  if (!account.tutorId) {
    res.status(403).json({ error: "A tutor profile must be assigned first." });
    return;
  }
  const body = CreateWorkspaceArticleBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Please check the article fields." });
    return;
  }
  const [tutor] = await db
    .select({ name: tutorsTable.name, tint: tutorsTable.tint })
    .from(tutorsTable)
    .where(eq(tutorsTable.id, account.tutorId))
    .limit(1);
  if (!tutor) {
    res.status(404).json({ error: "Tutor profile not found." });
    return;
  }
  const [resource] = await db
    .insert(resourcesTable)
    .values({
      title: body.data.title,
      subject: body.data.subject ?? "",
      level: body.data.level ?? "",
      type: body.data.type ?? "Study note",
      excerpt: body.data.excerpt ?? "",
      body: body.data.body ?? "",
      sections: body.data.sections ?? [],
      slug: slugify(body.data.title),
      tutorId: account.tutorId,
      readMinutes: estimateReadMinutes(body.data.body ?? "", body.data.sections ?? []),
      tint: normalizeTutorTint(tutor.tint),
      publishedAt: new Date().toISOString().slice(0, 10),
      status: "draft",
    })
    .returning();
  res
    .status(201)
    .json(CreateWorkspaceArticleResponse.parse(articleResponse(resource, tutor)));
});

router.patch("/workspace/articles/:id", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireApproved(account, res)) return;
  const params = UpdateWorkspaceArticleParams.safeParse(req.params);
  const body = UpdateWorkspaceArticleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Please check the article fields." });
    return;
  }
  const current = await joinedArticle(params.data.id);
  if (!current) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  if (!canEdit(account, current.resource.tutorId)) {
    res.status(403).json({ error: "You cannot edit this article." });
    return;
  }
  if (body.data.status === "published") {
    const publishableArticle = {
      title: body.data.title ?? current.resource.title,
      subject: body.data.subject ?? current.resource.subject,
      level: body.data.level ?? current.resource.level,
      type: body.data.type ?? normalizeResourceType(current.resource.type),
      excerpt: body.data.excerpt ?? current.resource.excerpt,
      body: body.data.body ?? current.resource.body,
      sections: body.data.sections ?? current.resource.sections,
    };
    if (!isPublishableArticle(publishableArticle)) {
      res.status(400).json({
        error: "Complete the article before publishing it.",
      });
      return;
    }
  }
  const nextBody = body.data.body ?? current.resource.body;
  const nextSections = body.data.sections ?? current.resource.sections;
  const [updated] = await db
    .update(resourcesTable)
    .set({
      ...body.data,
      readMinutes: estimateReadMinutes(nextBody, nextSections),
      tint: normalizeTutorTint(current.tutor.tint),
      ...(body.data.status === "published"
        ? { publishedAt: new Date().toISOString().slice(0, 10) }
        : {}),
    })
    .where(eq(resourcesTable.id, params.data.id))
    .returning();
  res.json(
    UpdateWorkspaceArticleResponse.parse(
      articleResponse(updated, current.tutor),
    ),
  );
});

router.delete("/workspace/articles/:id", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireApproved(account, res)) return;
  const params = DeleteWorkspaceArticleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid article." });
    return;
  }
  const current = await joinedArticle(params.data.id);
  if (!current) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  if (!canEdit(account, current.resource.tutorId)) {
    res.status(403).json({ error: "You cannot delete this article." });
    return;
  }
  await db.delete(resourcesTable).where(eq(resourcesTable.id, params.data.id));
  res.sendStatus(204);
});

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
      ...tutorResponse(
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
      tutorResponse(
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

router.get("/workspace/tutors", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireOwner(account, res)) return;

  const tutors = await db
    .select()
    .from(tutorsTable)
    .orderBy(asc(tutorsTable.sortOrder));
  const drafts = await db.select().from(tutorProfileDraftsTable);
  const draftsByTutorId = new Map(drafts.map((draft) => [draft.tutorId, draft]));
  res.json(
    ListWorkspaceTutorsResponse.parse(
      tutors.map((tutor) =>
        tutorResponse(
            tutor,
          [],
          publicTutorSlug(tutor.name),
        ),
      ),
    ),
  );
});

router.post("/workspace/tutors", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireOwner(account, res)) return;

  const body = CreateWorkspaceTutorBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Please check the tutor profile fields." });
    return;
  }

  const [{ value: tutorCount }] = await db
    .select({ value: count() })
    .from(tutorsTable);
  const { firstName, lastName } = splitTutorName(body.data.name);
  const [defaultTint] = await availableTutorAccents(null);
  if (!defaultTint) {
    res.status(409).json({
      error: "All approved profile accents are already assigned.",
    });
    return;
  }
  const [tutor] = await db
    .insert(tutorsTable)
    .values({
      name: body.data.name,
      firstName,
      lastName,
      initials: tutorInitials(body.data.name),
      subject: "",
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
      slug: await uniqueTutorSlug(body.data.name),
      sortOrder: Number(tutorCount),
    })
    .returning();

  res.status(201).json(
    CreateWorkspaceTutorResponse.parse(tutorResponse(tutor)),
  );
});

router.post("/workspace/tutors/:id", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireOwner(account, res)) return;

  const params = ArchiveWorkspaceTutorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid tutor profile." });
    return;
  }

  const [tutor] = await db
    .select()
    .from(tutorsTable)
    .where(eq(tutorsTable.id, params.data.id))
    .limit(1);
  if (!tutor) {
    res.status(404).json({ error: "Tutor profile not found." });
    return;
  }

  const [archived] = await db
    .update(tutorsTable)
    .set({ profileStatus: "archived" })
    .where(eq(tutorsTable.id, params.data.id))
    .returning();

  res.json(ArchiveWorkspaceTutorResponse.parse(tutorResponse(archived)));
});

router.put("/workspace/tutors/:id", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireOwner(account, res)) return;

  const params = RestoreWorkspaceTutorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid tutor profile." });
    return;
  }

  const [tutor] = await db
    .select()
    .from(tutorsTable)
    .where(eq(tutorsTable.id, params.data.id))
    .limit(1);
  if (!tutor) {
    res.status(404).json({ error: "Tutor profile not found." });
    return;
  }

  const [restored] = await db
    .update(tutorsTable)
    .set({ profileStatus: "draft" })
    .where(eq(tutorsTable.id, params.data.id))
    .returning();

  res.json(RestoreWorkspaceTutorResponse.parse(tutorResponse(restored)));
});

router.delete("/workspace/tutors/:id", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireOwner(account, res)) return;

  const params = DeleteWorkspaceTutorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid tutor profile." });
    return;
  }

  const [deleted] = await db
    .delete(tutorsTable)
    .where(eq(tutorsTable.id, params.data.id))
    .returning({ id: tutorsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Tutor profile not found." });
    return;
  }

  res.sendStatus(204);
});

router.get("/workspace/accounts", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireOwner(account, res)) return;
  const rows = await db
    .select({
      account: workspaceAccountsTable,
      tutorName: tutorsTable.name,
      tutorProfileStatus: tutorsTable.profileStatus,
    })
    .from(workspaceAccountsTable)
    .leftJoin(tutorsTable, eq(workspaceAccountsTable.tutorId, tutorsTable.id))
    .orderBy(asc(workspaceAccountsTable.id));
  res.json(
    ListWorkspaceAccountsResponse.parse(
      rows.map(({
        account: item,
        tutorName,
        tutorProfileStatus,
      }) => ({
        id: item.id,
        role: item.role,
        email: item.email,
        displayName: item.displayName,
        tutorId: item.tutorId,
        tutorName,
        tutorProfileStatus,
      })),
    ),
  );
});

router.delete("/workspace/accounts/:id", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireOwner(account, res)) return;

  const params = UpdateWorkspaceAccountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid Workspace account." });
    return;
  }

  const [target] = await db
    .select()
    .from(workspaceAccountsTable)
    .where(eq(workspaceAccountsTable.id, params.data.id))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Workspace account not found." });
    return;
  }
  if (target.role === "owner") {
    res.status(400).json({ error: "The owner account cannot be deleted." });
    return;
  }

  await db
    .delete(workspaceAccountsTable)
    .where(eq(workspaceAccountsTable.id, params.data.id));
  res.sendStatus(204);
});

router.patch("/workspace/accounts/:id", async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireOwner(account, res)) return;
  const params = UpdateWorkspaceAccountParams.safeParse(req.params);
  const body = UpdateWorkspaceAccountBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Please check the account assignment." });
    return;
  }
  const [target] = await db
    .select()
    .from(workspaceAccountsTable)
    .where(eq(workspaceAccountsTable.id, params.data.id))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Workspace account not found." });
    return;
  }
  if (target.role === "owner" && body.data.role !== "owner") {
    res.status(400).json({ error: "The owner account must remain an owner." });
    return;
  }
  if (target.role !== "owner" && body.data.role === "owner") {
    res.status(400).json({ error: "Only the existing owner account can have the owner role." });
    return;
  }
  if (body.data.role === "pending" && body.data.tutorId != null) {
    res.status(400).json({ error: "Pending accounts cannot have a tutor profile." });
    return;
  }
  if (body.data.tutorId != null) {
    const [tutor] = await db
      .select({ id: tutorsTable.id })
      .from(tutorsTable)
      .where(eq(tutorsTable.id, body.data.tutorId))
      .limit(1);
    if (!tutor) {
      res.status(400).json({ error: "Tutor profile not found." });
      return;
    }

    const [assignedAccount] = await db
      .select({ id: workspaceAccountsTable.id })
      .from(workspaceAccountsTable)
      .where(
        and(
          eq(workspaceAccountsTable.tutorId, body.data.tutorId),
          ne(workspaceAccountsTable.id, params.data.id),
        ),
      )
      .limit(1);
    if (assignedAccount) {
      res.status(400).json({ error: "That tutor profile is already assigned to another account." });
      return;
    }
  }

  const [updated] = await db
    .update(workspaceAccountsTable)
    .set({
      role: body.data.role,
      tutorId: body.data.tutorId ?? null,
    })
    .where(eq(workspaceAccountsTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Workspace account not found." });
    return;
  }
  const [tutor] = updated.tutorId
    ? await db
        .select({
          name: tutorsTable.name,
          profileStatus: tutorsTable.profileStatus,
        })
        .from(tutorsTable)
        .where(eq(tutorsTable.id, updated.tutorId))
    : [];
  res.json(
    UpdateWorkspaceAccountResponse.parse({
      id: updated.id,
      role: updated.role,
      email: updated.email,
      displayName: updated.displayName,
      tutorId: updated.tutorId,
      tutorName: tutor?.name ?? null,
      tutorProfileStatus: tutor?.profileStatus ?? null,
    }),
  );
});

export default router;