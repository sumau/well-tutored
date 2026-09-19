import {
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tutorAvailability = pgEnum("tutor_availability", [
  "accepting",
  "limited",
  "unavailable",
]);

export const tutorProfileStatus = pgEnum("tutor_profile_status", [
  "draft",
  "published",
  "archived",
]);

export type TeachingPoint = {
  title: string;
  body: string;
};

export const tutorsTable = pgTable("tutors", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  profileStatus: tutorProfileStatus("profile_status")
    .notNull()
    .default("published"),
  name: text("name").notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
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
  availability: tutorAvailability("availability").notNull().default("accepting"),
  tint: text("tint").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  tintUnique: uniqueIndex("tutors_tint_unique").on(table.tint),
}));

export const insertTutorSchema = createInsertSchema(tutorsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTutor = z.infer<typeof insertTutorSchema>;
export type TutorRow = typeof tutorsTable.$inferSelect;