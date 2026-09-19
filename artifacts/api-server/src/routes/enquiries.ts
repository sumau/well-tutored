import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  CreateEnquiryBody,
  CreateEnquiryResponse,
} from "@workspace/api-zod";
import { db, enquiriesTable, tutorsTable } from "@workspace/db";

const router: IRouter = Router();
const simpleEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/enquiries", async (req, res): Promise<void> => {
  const parsed = CreateEnquiryBody.safeParse(req.body);
  if (!parsed.success || !simpleEmail.test(req.body?.email ?? "")) {
    res.status(400).json({ error: "Please check the enquiry details." });
    return;
  }

  const [tutor] = await db
    .select({ id: tutorsTable.id, name: tutorsTable.name })
    .from(tutorsTable)
    .where(eq(tutorsTable.slug, parsed.data.tutorSlug))
    .limit(1);

  if (!tutor) {
    res.status(400).json({ error: "Please select an available tutor." });
    return;
  }

  const [enquiry] = await db
    .insert(enquiriesTable)
    .values({
      tutorId: tutor.id,
      name: parsed.data.name,
      email: parsed.data.email,
      studentName: parsed.data.studentName,
      studentAge: parsed.data.studentAge,
      subjectLevel: parsed.data.subjectLevel,
      message: parsed.data.message,
      deliveryStatus: "stored",
    })
    .returning({
      id: enquiriesTable.id,
      createdAt: enquiriesTable.createdAt,
    });

  req.log.info(
    { enquiryId: enquiry.id, tutorId: tutor.id },
    "Named tutor enquiry stored",
  );

  res.status(201).json(
    CreateEnquiryResponse.parse({
      id: enquiry.id,
      tutorName: tutor.name,
      receivedAt: enquiry.createdAt.toISOString(),
    }),
  );
});

export default router;