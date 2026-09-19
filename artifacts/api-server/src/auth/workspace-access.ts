import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import {
  findOrProvisionFromClerkUser,
  type WorkspaceAccount,
} from "../services/workspace-account-service";

export async function requireWorkspaceAccount(
  req: Request,
  res: Response,
): Promise<WorkspaceAccount | null> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const account = await findOrProvisionFromClerkUser(userId);
  if (!account) {
    res.status(403).json({
      error: "Workspace access requires a verified email address.",
    });
    return null;
  }
  return account;
}

export function requireApproved(
  account: WorkspaceAccount,
  res: Response,
): boolean {
  if (account.role === "pending") {
    res.status(403).json({ error: "Your workspace account is awaiting approval." });
    return false;
  }
  return true;
}

export function requireOwner(
  account: WorkspaceAccount,
  res: Response,
): boolean {
  if (account.role !== "owner") {
    res.status(403).json({ error: "Owner access required." });
    return false;
  }
  return true;
}

export function canEdit(account: WorkspaceAccount, tutorId: number) {
  return account.role === "owner" || account.tutorId === tutorId;
}