import {
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tutorsTable } from "./tutors";

export type ResourceSectionRow = {
  id: string;
  heading: string;
  body: string;
};

export const resourceStatus = pgEnum("resource_status", [
  "draft",
  "published",
]);

export const resourcesTable = pgTable("resources", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  tutorId: integer("tutor_id")
    .notNull()
    .references(() => tutorsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  level: text("level").notNull(),
  type: text("type").notNull(),
  readMinutes: integer("read_minutes").notNull(),
  excerpt: text("excerpt").notNull(),
  body: text("body").notNull(),
  sections: jsonb("sections").$type<ResourceSectionRow[]>().notNull().default([]),
  publishedAt: date("published_at", { mode: "string" }).notNull(),
  tint: text("tint").notNull(),
  status: resourceStatus("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertResourceSchema = createInsertSchema(resourcesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertResource = z.infer<typeof insertResourceSchema>;
export type ResourceRow = typeof resourcesTable.$inferSelect;