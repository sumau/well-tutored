import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  resourcesTable,
  tutorsTable,
  type ResourceSectionRow,
} from "@workspace/db";
import { normalizeResourceType } from "./resource-types";

const tutorSeeds = [
  {
    slug: "maya-shah",
    name: "Maya Shah",
    firstName: "Maya",
    lastName: "Shah",
    initials: "MS",
    subject: "English Literature & essay writing",
    university: "University of Cambridge",
    qualification: "First-class BA (Hons), English",
    bio: "A Cambridge-educated English tutor who helps students turn half-formed thoughts into arguments they can stand behind.",
    style: "Warm, conversational, detail-led",
    profileSummary:
      "Maya helps GCSE and A-level English students turn half-formed ideas into clear, confident arguments they can make their own.",
    teachingIntro:
      "Sessions are built around conversation. Maya asks careful questions, follows the interesting thread, and helps students turn a half-formed thought into an argument they can stand behind.",
    teachingPoints: [
      {
        title: "Start with why",
        body: "Before reaching for a structure, Maya wants to know what you noticed, and why it stayed with you.",
      },
      {
        title: "Make it yours",
        body: "There are no model paragraphs to copy. She helps you build language that sounds like you at your most clear.",
      },
      {
        title: "Edit kindly",
        body: "Feedback is specific and usable: one sentence, one choice, one small next step at a time.",
      },
    ],
    rate: "45",
    availability: "accepting" as const,
    tint: "#D98F7F",
    sortOrder: 1,
  },
  {
    slug: "sophie-williams",
    name: "Sophie Williams",
    firstName: "Sophie",
    lastName: "Williams",
    initials: "SW",
    subject: "Mathematics & Chemistry",
    university: "University of Oxford",
    qualification: "MChem, Chemistry",
    bio: "An Oxford-educated tutor who makes difficult problems feel structured, patient and possible.",
    style: "Methodical, calm, example-led",
    profileSummary:
      "Sophie helps GCSE and A-level students make sense of maths and chemistry by making difficult ideas feel manageable and connected.",
    teachingIntro:
      "Sessions are calm, structured and practical. Sophie breaks difficult problems into steps, then gives students space to test their own reasoning and build confidence.",
    teachingPoints: [
      {
        title: "Find the first step",
        body: "Sophie helps you identify the information you already have before deciding which method fits the problem.",
      },
      {
        title: "Think it through",
        body: "You will explain each step in your own words, so the method becomes something you understand rather than a pattern you memorise.",
      },
      {
        title: "Practise with purpose",
        body: "Each example has a job: strengthen a foundation, expose a gap, or prepare you for the next challenge.",
      },
    ],
    rate: "50",
    availability: "limited" as const,
    tint: "#D8B267",
    sortOrder: 2,
  },
  {
    slug: "amina-patel",
    name: "Amina Patel",
    firstName: "Amina",
    lastName: "Patel",
    initials: "AP",
    subject: "Biology & Psychology",
    university: "University of Edinburgh",
    qualification: "BSc (Hons), Neuroscience",
    bio: "An Edinburgh-educated tutor who helps students connect the detail of science with the bigger picture.",
    style: "Encouraging, visual, curious",
    profileSummary:
      "Amina helps GCSE and A-level students connect complex biology and psychology ideas through clear explanations and memorable examples.",
    teachingIntro:
      "Sessions are curious, visual and rooted in understanding. Amina helps students connect the detail of a topic to the bigger picture, then practise explaining it in their own words.",
    teachingPoints: [
      {
        title: "See the whole picture",
        body: "Amina starts by connecting new ideas to what you already know, so facts have somewhere useful to land.",
      },
      {
        title: "Explain it simply",
        body: "If you can explain a process clearly, you understand it. Amina uses diagrams and conversation to find the clearest version.",
      },
      {
        title: "Remember with meaning",
        body: "Revision becomes more memorable when examples, processes and vocabulary are connected rather than learned in isolation.",
      },
    ],
    rate: "48",
    availability: "accepting" as const,
    tint: "#B5A1CC",
    sortOrder: 3,
  },
  {
    slug: "clara-bennett",
    name: "Clara Bennett",
    firstName: "Clara",
    lastName: "Bennett",
    initials: "CB",
    subject: "History & Politics",
    university: "London School of Economics",
    qualification: "BA (Hons), History",
    bio: "An LSE-educated tutor who helps students build confident arguments from careful reading and lively discussion.",
    style: "Thoughtful, structured, discussion-led",
    profileSummary:
      "Clara helps GCSE and A-level students turn detailed reading into confident arguments, with structure that makes complex ideas feel manageable.",
    teachingIntro:
      "Clara's sessions begin with the question behind the question. Together, you will test interpretations, organise evidence and shape an argument that feels precise and genuinely yours.",
    teachingPoints: [
      {
        title: "Question the evidence",
        body: "Clara helps you notice what a source says, what it assumes and how much weight it can really carry.",
      },
      {
        title: "Build the thread",
        body: "Strong essays are easier to write when each point has a clear job. Clara helps you plan the line of thought before the prose.",
      },
      {
        title: "Speak it first",
        body: "Talking through an idea often reveals the argument hiding inside it. Clara uses discussion to help you find your clearest phrasing.",
      },
    ],
    rate: "52",
    availability: "limited" as const,
    tint: "#83B7B0",
    sortOrder: 4,
  },
  {
    slug: "nora-lewis",
    name: "Nora Lewis",
    firstName: "Nora",
    lastName: "Lewis",
    initials: "NL",
    subject: "Physics & Mathematics",
    university: "University of Bristol",
    qualification: "BSc (Hons), Physics",
    bio: "A physics tutor who helps students make sense of challenging ideas through clear explanations and patient problem-solving.",
    style: "Clear, patient, confidence-building",
    profileSummary:
      "Nora helps GCSE and A-level students make difficult physics and mathematics ideas feel clear, connected and manageable.",
    teachingIntro:
      "Nora's sessions are calm and practical. She breaks complex ideas into smaller steps, then gives students time to test their understanding and build confidence.",
    teachingPoints: [
      {
        title: "Start with the picture",
        body: "Nora uses diagrams and plain language to make the shape of a problem visible before choosing a formula.",
      },
      {
        title: "Work it through",
        body: "Each step is explained and checked, so students can see why a method works rather than memorising a pattern.",
      },
      {
        title: "Build confidence",
        body: "Practice focuses on the next useful challenge, helping students recognise their progress as well as their gaps.",
      },
    ],
    rate: "50",
    availability: "unavailable" as const,
    profileStatus: "published" as const,
    tint: "#C7A6A0",
    sortOrder: 5,
  },
];

type ResourceSeed = {
  slug: string;
  tutorSlug: string;
  title: string;
  subject: string;
  level: string;
  type: string;
  readMinutes: number;
  excerpt: string;
  body: string;
  sections: ResourceSectionRow[];
  publishedAt: string;
  tint: string;
};

const resourceSeeds: ResourceSeed[] = [
  {
    slug: "how-to-write-an-introduction",
    tutorSlug: "maya-shah",
    title: "How to write an introduction that answers the question",
    subject: "English",
    level: "GCSE & A-level",
    type: "Guide",
    readMinutes: 8,
    excerpt:
      "A practical way to move from a blank page to a clear, purposeful opening paragraph.",
    body:
      "A strong introduction does not need to sound impressive. It needs to show that you understand the question and know where your argument is going.",
    sections: [
      {
        id: "begin-with-question",
        heading: "Begin with the question",
        body: "Underline the words that tell you what kind of judgement is needed. Your opening should respond to those words directly.",
      },
      {
        id: "make-a-claim",
        heading: "Make one clear claim",
        body: "Give the reader the main idea your essay will test. It can be nuanced, but it should still be possible to disagree with it.",
      },
      {
        id: "leave-room",
        heading: "Leave yourself room to think",
        body: "An introduction is a promise, not a prison. Use language that gives your argument room to develop.",
      },
    ],
    publishedAt: "2026-09-10",
    tint: "#e7c4b3",
  },
  {
    slug: "kinder-way-to-revise",
    tutorSlug: "maya-shah",
    title: "A kinder way to revise for A-levels",
    subject: "Study habits",
    level: "A-level",
    type: "Study note",
    readMinutes: 6,
    excerpt:
      "Small, repeatable changes that make revision feel less like a last-minute emergency.",
    body:
      "Revision works best when it is repeatable. A short plan you can return to is more useful than an ambitious plan you avoid.",
    sections: [
      {
        id: "small-start",
        heading: "Start smaller than you think",
        body: "Choose one topic and one useful action. A twenty-minute review completed today is better than a perfect timetable postponed.",
      },
      {
        id: "active",
        heading: "Make recall active",
        body: "Close the book and retrieve what you know. Then use your notes to repair the gaps.",
      },
    ],
    publishedAt: "2026-09-08",
    tint: "#c8d8c8",
  },
  {
    slug: "algebra-stops-behaving",
    tutorSlug: "sophie-williams",
    title: "What to do when the algebra stops behaving",
    subject: "Maths",
    level: "GCSE & A-level",
    type: "Study note",
    readMinutes: 5,
    excerpt:
      "A calm reset for the point where a familiar method suddenly stops making sense.",
    body:
      "When algebra becomes confusing, return to the line before the confusion. Most mistakes become visible when each operation is named clearly.",
    sections: [
      {
        id: "slow-line",
        heading: "Slow down one line",
        body: "Write the operation beside the step: expand, collect, divide, substitute. This makes hidden jumps easier to find.",
      },
      {
        id: "check",
        heading: "Check with a simple value",
        body: "Try a small number in the original expression and your result. If they disagree, you know exactly where to look.",
      },
    ],
    publishedAt: "2026-09-06",
    tint: "#e0d1b8",
  },
  {
    slug: "chemistry-mark-scheme",
    tutorSlug: "sophie-williams",
    title: "The chemistry mark scheme, translated",
    subject: "Chemistry",
    level: "A-level",
    type: "Revision notes",
    readMinutes: 7,
    excerpt:
      "How to recognise the precise language examiners reward without making every answer sound rehearsed.",
    body:
      "Mark schemes reward scientific precision. The aim is not to memorise whole sentences, but to know which relationships and conditions must be stated.",
    sections: [
      {
        id: "command",
        heading: "Read the command word",
        body: "Explain, describe and calculate ask for different kinds of evidence. Match the structure of your answer to the instruction.",
      },
      {
        id: "keywords",
        heading: "Use key terms in context",
        body: "A technical term earns credit when it explains the relationship in the question, not when it appears as an isolated word.",
      },
    ],
    publishedAt: "2026-09-04",
    tint: "#d7c9b3",
  },
];

export async function ensureSeedContent(): Promise<void> {
  await db.insert(tutorsTable).values(tutorSeeds).onConflictDoNothing();

  for (const tutor of tutorSeeds) {
    await db
      .update(tutorsTable)
      .set({
        firstName: tutor.firstName,
        lastName: tutor.lastName,
      })
      .where(
        and(
          eq(tutorsTable.slug, tutor.slug),
          eq(tutorsTable.firstName, ""),
        ),
      );
    await db
      .update(tutorsTable)
      .set({
        teachingIntro: tutor.teachingIntro,
        teachingPoints: tutor.teachingPoints,
      })
      .where(
        and(
          eq(tutorsTable.slug, tutor.slug),
          eq(tutorsTable.teachingIntro, ""),
        ),
      );
    await db
      .update(tutorsTable)
      .set({
        profileSummary: tutor.profileSummary,
      })
      .where(
        and(
          eq(tutorsTable.slug, tutor.slug),
          eq(tutorsTable.profileSummary, ""),
        ),
      );
  }

  const tutors = await db
    .select({ id: tutorsTable.id, slug: tutorsTable.slug })
    .from(tutorsTable)
    .where(inArray(tutorsTable.slug, tutorSeeds.map((tutor) => tutor.slug)));
  const tutorIds = new Map(tutors.map((tutor) => [tutor.slug, tutor.id]));

  const resources = resourceSeeds.map(({ tutorSlug, ...resource }) => {
    const tutorId = tutorIds.get(tutorSlug);
    if (!tutorId) {
      throw new Error(`Cannot seed resource without tutor: ${tutorSlug}`);
    }
    return { ...resource, tutorId };
  });

  await db.insert(resourcesTable).values(resources).onConflictDoNothing();

  const storedResources = await db
    .select({ id: resourcesTable.id, type: resourcesTable.type })
    .from(resourcesTable);
  for (const resource of storedResources) {
    const normalizedType = normalizeResourceType(resource.type);
    if (normalizedType !== resource.type) {
      await db
        .update(resourcesTable)
        .set({ type: normalizedType })
        .where(eq(resourcesTable.id, resource.id));
    }
  }
}