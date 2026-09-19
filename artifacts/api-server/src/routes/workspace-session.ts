import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { GetWorkspaceSessionResponse } from "@workspace/api-zod";
import { db, tutorsTable } from "@workspace/db";
import { publicTutorSlug } from "../lib/tutor-slugs";
import {
  availableTutorAccents,
} from "../services/workspace-account-service";
import { requireWorkspaceAccount as workspaceAccount } from "../auth/workspace-access";
import {
  findWorkspaceTutor,
  toTutorResponse,
} from "../presenters/tutor-presenter";

const router: IRouter = Router();

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

export default router;