import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import {
  CreateWorkspaceResourceBody,
  CreateWorkspaceResourceResponse,
  DeleteWorkspaceResourceParams,
  ListWorkspaceResourcesResponse,
  UpdateWorkspaceResourceBody,
  UpdateWorkspaceResourceParams,
  UpdateWorkspaceResourceResponse,
} from "@workspace/api-zod";
import { db, resourcesTable, tutorsTable } from "@workspace/db";
import { estimateReadMinutes } from "../lib/text";
import { normalizeResourceType } from "../lib/resource-types";
import { normalizeTutorTint } from "../lib/tutor-accents";
import {
  canEdit,
  requireApproved,
  requireWorkspaceAccount as workspaceAccount,
} from "../auth/workspace-access";
import {
  findJoinedResource,
  toResourceResponse,
} from "../presenters/resource-presenter";
import { isPublishableResource } from "../domain/workspace-validation";

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

export default router;