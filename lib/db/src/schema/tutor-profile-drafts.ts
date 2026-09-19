import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  tutorAvailability,
  tutorsTable,
  type TeachingPoint,
} from "./tutors";

export const tutorProfileDraftsTable = pgTable(
  "tutor_profile_drafts",
  {
    id: serial("id").primaryKey(),
    tutorId: integer("tutor_id")
      .notNull()
      .references(() => tutorsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    initials: text("initials").notNull(),
    subject: text("subject").notNull(),
    support: text("support").notNull().default(""),
    profileSummary: text("profile_summary").notNull().default(""),
    university: text("university").notNull(),
    qualification: text("qualification").notNull(),
    bio: text("bio").notNull(),
    style: text("style").notNull(),
    teachingIntro: text("teaching_intro").notNull().default(""),
    teachingPoints: jsonb("teaching_points")
      .$type<TeachingPoint[]>()
      .notNull()
      .default([]),
    rate: numeric("rate", { precision: 8, scale: 2 }).notNull(),
    availability: tutorAvailability("availability").notNull(),
    tint: text("tint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    tutorUnique: uniqueIndex("tutor_profile_drafts_tutor_unique").on(table.tutorId),
  }),
);

export const insertTutorProfileDraftSchema = createInsertSchema(
  tutorProfileDraftsTable,
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTutorProfileDraft = z.infer<
  typeof insertTutorProfileDraftSchema
>;
export type TutorProfileDraftRow = typeof tutorProfileDraftsTable.$inferSelect;