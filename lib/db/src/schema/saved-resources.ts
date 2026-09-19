import {
  integer,
  pgTable,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { resourcesTable } from "./resources";
import { workspaceAccountsTable } from "./workspace-accounts";

export const savedResourcesTable = pgTable(
  "saved_resources",
  {
    accountId: integer("account_id")
      .notNull()
      .references(() => workspaceAccountsTable.id, { onDelete: "cascade" }),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => resourcesTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.resourceId] })],
);

export const insertSavedResourceSchema = createInsertSchema(
  savedResourcesTable,
).omit({
  createdAt: true,
});
export type InsertSavedResource = z.infer<typeof insertSavedResourceSchema>;
export type SavedResourceRow = typeof savedResourcesTable.$inferSelect;