import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tutorsTable } from "./tutors";

export const enquiriesTable = pgTable("enquiries", {
  id: serial("id").primaryKey(),
  tutorId: integer("tutor_id")
    .notNull()
    .references(() => tutorsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  studentName: text("student_name").notNull(),
  studentAge: text("student_age").notNull(),
  subjectLevel: text("subject_level").notNull(),
  message: text("message").notNull(),
  deliveryStatus: text("delivery_status").notNull().default("stored"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEnquirySchema = createInsertSchema(enquiriesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEnquiry = z.infer<typeof insertEnquirySchema>;
export type EnquiryRow = typeof enquiriesTable.$inferSelect;