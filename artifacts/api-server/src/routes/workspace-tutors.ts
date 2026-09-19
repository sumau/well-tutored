import { Router, type IRouter } from "express";
import { asc, count, eq } from "drizzle-orm";
import {
  ArchiveWorkspaceTutorParams,
  ArchiveWorkspaceTutorResponse,
  CreateWorkspaceTutorBody,
  CreateWorkspaceTutorResponse,
  DeleteWorkspaceTutorParams,
  ListWorkspaceTutorsResponse,
  RestoreWorkspaceTutorParams,
  RestoreWorkspaceTutorResponse,
} from "@workspace/api-zod";
import {
  db,
  tutorProfileDraftsTable,
  tutorsTable,
} from "@workspace/db";
import { splitTutorName } from "../lib/tutor-names";
import { publicTutorSlug } from "../lib/tutor-slugs";
import {
  availableTutorAccents,
  uniqueTutorSlug,
  tutorInitials,
} from "../services/workspace-account-service";
import {
  requireOwner,
  requireWorkspaceAccount as workspaceAccount,
} from "../auth/workspace-access";
import { toTutorResponse } from "../presenters/tutor-presenter";

const router: IRouter = Router();

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

export default router;