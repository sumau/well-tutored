import { Router, type IRouter } from "express";
import { and, asc, count, eq, ne } from "drizzle-orm";
import {
  CreateWorkspaceResourceBody,
  CreateWorkspaceResourceResponse,
  CreateWorkspaceTutorBody,
  CreateWorkspaceTutorResponse,
  ArchiveWorkspaceTutorParams,
  ArchiveWorkspaceTutorResponse,
  DeleteWorkspaceResourceParams,
  DeleteWorkspaceTutorParams,
  DiscardWorkspaceProfileDraftResponse,
  GetWorkspaceSessionResponse,
  ListWorkspaceAccountsResponse,
  ListWorkspaceResourcesResponse,
  ListWorkspaceTutorsResponse,
  UpdateWorkspaceAccountBody,
  UpdateWorkspaceAccountParams,
  UpdateWorkspaceAccountResponse,
  UpdateWorkspaceResourceBody,
  UpdateWorkspaceResourceParams,
  UpdateWorkspaceResourceResponse,
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
import { splitTutorName } from "../lib/tutor-names";
import { publicTutorSlug } from "../lib/tutor-slugs";
import { normalizeTutorTint } from "../lib/tutor-accents";
import { normalizeResourceType } from "../lib/resource-types";
import {
  canEdit,
  requireApproved,
  requireOwner,
  requireWorkspaceAccount as workspaceAccount,
} from "../auth/workspace-access";
import {
  availableTutorAccents,
  isUniqueViolation,
  uniqueTutorSlug,
  tutorInitials,
} from "../services/workspace-account-service";
import {
  findJoinedResource,
  toResourceResponse,
} from "../presenters/resource-presenter";
import {
  applyTutorDraft,
  findWorkspaceTutor,
  toTutorResponse,
} from "../presenters/tutor-presenter";
import {
  isPublishableProfile,
  isPublishableResource,
} from "../domain/workspace-validation";

const router: IRouter = Router();

function slugify(title: string) {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "resource"}-${Date.now().toString(36).slice(-6)}`;
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
  const editableTutor = tutor ? await findWorkspaceTutor(tutor) : undefined;

  res.json(
    GetWorkspaceSessionResponse.parse({
      id: account.id,
      role: account.role,
      email: account.email,
      displayName: account.displayName,
      availableTutorAccents: await availableTutorAccents(account.tutorId),
      tutor: editableTutor
        ? toTutorResponse(
            editableTutor,
            [],
            publicTutorSlug(tutor?.name ?? editableTutor.name),
          )
        : null,
    }),
  );
});

router.get(["/workspace/resources", "/workspace/articles"], async (req, res): Promise<void> => {
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
    ListWorkspaceResourcesResponse.parse(
      rows.map((row) => toResourceResponse(row.resource, row.tutor)),
    ),
  );
});

router.post(["/workspace/resources", "/workspace/articles"], async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireApproved(account, res)) return;
  if (!account.tutorId) {
    res.status(403).json({ error: "A tutor profile must be assigned first." });
    return;
  }
  const body = CreateWorkspaceResourceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Please check the resource fields." });
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
    .json(CreateWorkspaceResourceResponse.parse(toResourceResponse(resource, tutor)));
});

router.patch(["/workspace/resources/:id", "/workspace/articles/:id"], async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireApproved(account, res)) return;
  const params = UpdateWorkspaceResourceParams.safeParse(req.params);
  const body = UpdateWorkspaceResourceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Please check the resource fields." });
    return;
  }
  const current = await findJoinedResource(params.data.id);
  if (!current) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  if (!canEdit(account, current.resource.tutorId)) {
    res.status(403).json({ error: "You cannot edit this resource." });
    return;
  }
  if (body.data.status === "published") {
    const publishableResource = {
      title: body.data.title ?? current.resource.title,
      subject: body.data.subject ?? current.resource.subject,
      level: body.data.level ?? current.resource.level,
      type: body.data.type ?? normalizeResourceType(current.resource.type),
      excerpt: body.data.excerpt ?? current.resource.excerpt,
      body: body.data.body ?? current.resource.body,
      sections: body.data.sections ?? current.resource.sections,
    };
    if (!isPublishableResource(publishableResource)) {
      res.status(400).json({
        error: "Complete the resource before publishing it.",
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
      UpdateWorkspaceResourceResponse.parse(
        toResourceResponse(updated, current.tutor),
    ),
  );
});

router.delete(["/workspace/resources/:id", "/workspace/articles/:id"], async (req, res): Promise<void> => {
  const account = await workspaceAccount(req, res);
  if (!account || !requireApproved(account, res)) return;
  const params = DeleteWorkspaceResourceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid resource." });
    return;
  }
  const current = await findJoinedResource(params.data.id);
  if (!current) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }
  if (!canEdit(account, current.resource.tutorId)) {
    res.status(403).json({ error: "You cannot delete this resource." });
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
        toTutorResponse(
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
    CreateWorkspaceTutorResponse.parse(toTutorResponse(tutor)),
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

  res.json(ArchiveWorkspaceTutorResponse.parse(toTutorResponse(archived)));
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

  res.json(RestoreWorkspaceTutorResponse.parse(toTutorResponse(restored)));
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