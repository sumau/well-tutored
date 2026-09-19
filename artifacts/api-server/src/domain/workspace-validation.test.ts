import assert from "node:assert/strict";
import test from "node:test";
import {
  isPublishableProfile,
  isPublishableResource,
} from "./workspace-validation";

const validResource = {
  title: "How to plan an English essay",
  subject: "English Literature",
  level: "A-level",
  type: "Guide",
  excerpt: "A practical guide to building a clear and confident essay plan.",
  body: "Start by identifying the question, then choose the evidence that best supports your interpretation.",
  sections: [
    {
      id: "question",
      heading: "Start with the question",
      body: "Underline the key terms and explain what the question is really asking.",
    },
  ],
};

const validProfile = {
  firstName: "Maya",
  lastName: "Shah",
  initials: "MS",
  subject: "English Literature",
  profileSummary: "A thoughtful tutor who makes complex ideas feel manageable.",
  university: "University of Cambridge",
  qualification: "First-class BA (Hons), English",
  bio: "Maya helps students develop clear, confident arguments through careful discussion and specific feedback.",
  style: "Warm and detail-led",
  teachingIntro:
    "Sessions are built around conversation, careful questions, and practical next steps that students can use straight away.",
  teachingPoints: [
    { title: "Start with why", body: "Begin with the idea that interests you and build from there." },
    { title: "Make it yours", body: "Develop language that sounds natural and confident in your own voice." },
    { title: "Edit kindly", body: "Use specific feedback to make one useful improvement at a time." },
  ],
  rate: 45,
  availability: "accepting",
  tint: "#D98F7F",
};

test("accepts a complete resource for publishing", () => {
  assert.equal(isPublishableResource(validResource), true);
});

test("rejects an incomplete resource for publishing", () => {
  assert.equal(
    isPublishableResource({ ...validResource, body: "Too short" }),
    false,
  );
});

test("accepts a complete tutor profile for publishing", () => {
  assert.equal(isPublishableProfile(validProfile), true);
});

test("rejects a profile with the wrong number of teaching points", () => {
  assert.equal(
    isPublishableProfile({
      ...validProfile,
      teachingPoints: validProfile.teachingPoints.slice(0, 2),
    }),
    false,
  );
});