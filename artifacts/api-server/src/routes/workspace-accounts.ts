import { Router, type IRouter } from "express";
import { and, asc, eq, ne } from "drizzle-orm";
import {
  ListWorkspaceAccountsResponse,
  UpdateWorkspaceAccountBody,
  UpdateWorkspaceAccountParams,
  UpdateWorkspaceAccountResponse,
} from "@workspace/api-zod";
import {
  db,
  tutorsTable,
  workspaceAccountsTable,
} from "@workspace/db";
import {
  requireOwner,
  requireWorkspaceAccount as workspaceAccount,
} from "../auth/workspace-access";

const router: IRouter = Router();

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