import {
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tutorsTable } from "./tutors";

export const workspaceAccountRole = pgEnum("studio_account_role", [
  "owner",
  "tutor",
  "pending",
]);

export const workspaceAccountsTable = pgTable("workspace_accounts", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: workspaceAccountRole("role").notNull().default("pending"),
  tutorId: integer("tutor_id")
    .unique()
    .references(() => tutorsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertWorkspaceAccountSchema = createInsertSchema(
  workspaceAccountsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWorkspaceAccount = z.infer<typeof insertWorkspaceAccountSchema>;
export type WorkspaceAccountRow = typeof workspaceAccountsTable.$inferSelect;