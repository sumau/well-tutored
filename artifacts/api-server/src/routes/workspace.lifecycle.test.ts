import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test, { after, before } from "node:test";
import express, { type Express } from "express";
import { eq, inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  pool,
  resourcesTable,
  tutorProfileDraftsTable,
  workspaceAccountsTable,
  tutorsTable,
} from "@workspace/db";
import contentRouter from "./content";
import workspaceRouter from "./workspace";

const ownerUserId = "workspace-lifecycle-owner";
const pendingUserId = "workspace-lifecycle-pending";
const nonOwnerUserId = "workspace-lifecycle-non-owner";
const autoProvisionUserId = "workspace-lifecycle-auto-provision";
const ownerAliasUserId = "workspace-lifecycle-owner-alias";
const tutorName = "Lifecycle Tutor";
const secondTutorName = "Lifecycle Tutor Two";
const pendingTutorName = "Lifecycle Pending";
const autoProvisionTutorName = "Auto Provision Tutor";
const clerkEmailByUserId = new Map<string, string>([
  [ownerUserId, "lifecycle-owner@example.test"],
  [pendingUserId, "lifecycle-pending@example.test"],
  [nonOwnerUserId, "lifecycle-non-owner@example.test"],
  [autoProvisionUserId, "auto-provision@example.test"],
  [ownerAliasUserId, "lifecycle-owner@example.test"],
]);
const clerkUsersPrototype = Object.getPrototypeOf(clerkClient.users) as {
  getUser: typeof clerkClient.users.getUser;
};
const originalGetUser = clerkUsersPrototype.getUser;

type TestServer = {
  app: Express;
  server: http.Server;
  baseUrl: string;
};

let testServer: TestServer;

function createAuthenticatedTestApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const header = req.headers["x-test-user"];
    const userId = typeof header === "string" ? header : null;
    const auth = Object.assign(
      () => ({
        userId,
        sessionId: userId ? "workspace-lifecycle-session" : null,
        tokenType: "session_token",
      }),
      { [Symbol.for("@clerk/express.auth")]: true },
    );

    Object.assign(req, { auth });
    next();
  });
  app.use("/api", contentRouter);
  app.use("/api", workspaceRouter);
  return app;
}

async function request<T = any>(
  path: string,
  init: RequestInit = {},
  userId?: string,
): Promise<{ response: Response; body: T }> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (userId) headers.set("x-test-user", userId);

  const response = await fetch(`${testServer.baseUrl}${path}`, {
    ...init,
    headers,
  });
  const body = (response.status === 204 ? null : await response.json()) as T;
  return { response, body };
}

const tutorInput = {
  name: tutorName,
  initials: "LT",
  subject: "History",
  university: "University of Bristol",
  qualification: "First-class BA (Hons), History",
  bio: "A patient history tutor who turns difficult source work into clear, manageable steps.",
  style: "Calm, structured, question-led",
  rate: 42,
  availability: "accepting",
  tint: "#C7D5C5",
};

before(async () => {
  clerkUsersPrototype.getUser = (async (userId: string) => {
    const email = clerkEmailByUserId.get(userId) ?? `${userId}@example.test`;
    const emailAddressId = `${userId}-primary-email`;
    return {
      id: userId,
      firstName: email.split("@")[0],
      lastName: "",
      primaryEmailAddressId: emailAddressId,
      emailAddresses: [
        {
          id: emailAddressId,
          emailAddress: email,
          verification: { status: "verified" },
        },
      ],
    } as Awaited<ReturnType<typeof originalGetUser>>;
  }) as typeof originalGetUser;

  const app = createAuthenticatedTestApp();
  const server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  testServer = {
    app,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };

  await db
    .delete(resourcesTable)
    .where(
      inArray(
        resourcesTable.tutorId,
        db
          .select({ id: tutorsTable.id })
          .from(tutorsTable)
          .where(
            inArray(tutorsTable.name, [
              tutorName,
              secondTutorName,
              pendingTutorName,
              autoProvisionTutorName,
            ]),
          ),
      ),
    );
  await db.delete(workspaceAccountsTable).where(
    inArray(workspaceAccountsTable.clerkUserId, [
      ownerUserId,
      pendingUserId,
      nonOwnerUserId,
      autoProvisionUserId,
      ownerAliasUserId,
    ]),
  );
  await db
    .delete(tutorsTable)
    .where(
      inArray(tutorsTable.name, [
        tutorName,
        secondTutorName,
        pendingTutorName,
        autoProvisionTutorName,
      ]),
    );

  await db.insert(workspaceAccountsTable).values([
    {
      clerkUserId: ownerUserId,
      email: "lifecycle-owner@example.test",
      displayName: "Lifecycle Owner",
      role: "owner",
    },
    {
      clerkUserId: pendingUserId,
      email: "lifecycle-pending@example.test",
      displayName: "Lifecycle Pending",
      role: "pending",
    },
    {
      clerkUserId: nonOwnerUserId,
      email: "lifecycle-non-owner@example.test",
      displayName: "Lifecycle Non-owner",
      role: "pending",
    },
    {
      clerkUserId: autoProvisionUserId,
      email: "auto-provision@example.test",
      displayName: autoProvisionTutorName,
      role: "pending",
    },
  ]);
});

after(async () => {
  clerkUsersPrototype.getUser = originalGetUser;
  await db
    .delete(resourcesTable)
    .where(
      inArray(
        resourcesTable.tutorId,
        db
          .select({ id: tutorsTable.id })
          .from(tutorsTable)
          .where(
            inArray(tutorsTable.name, [
              tutorName,
              secondTutorName,
              pendingTutorName,
              autoProvisionTutorName,
            ]),
          ),
      ),
    );
  await db.delete(workspaceAccountsTable).where(
    inArray(workspaceAccountsTable.clerkUserId, [
      ownerUserId,
      pendingUserId,
      nonOwnerUserId,
      autoProvisionUserId,
      ownerAliasUserId,
    ]),
  );
  await db
    .delete(tutorsTable)
    .where(
      inArray(tutorsTable.name, [
        tutorName,
        secondTutorName,
        pendingTutorName,
        autoProvisionTutorName,
      ]),
    );
  testServer.server.close();
  await once(testServer.server, "close");
  await pool.end();
});

test("owner tutor lifecycle works end to end and remains owner-only", async () => {
  const unauthenticatedCreate = await request(
    "/api/workspace/tutors",
    { method: "POST", body: JSON.stringify(tutorInput) },
  );
  assert.equal(unauthenticatedCreate.response.status, 401);

  const nonOwnerCreate = await request(
    "/api/workspace/tutors",
    { method: "POST", body: JSON.stringify(tutorInput) },
    nonOwnerUserId,
  );
  assert.equal(nonOwnerCreate.response.status, 403);

  const created = await request(
    "/api/workspace/tutors",
    { method: "POST", body: JSON.stringify(tutorInput) },
    ownerUserId,
  );
  assert.equal(created.response.status, 201);
  assert.equal(created.body.name, tutorName);
  assert.equal(typeof created.body.id, "number");
  assert.equal(created.body.slug, "lifecycle-tutor");

  const tutorId = created.body.id as number;
  const publicTutors = await request("/api/tutors");
  assert.equal(publicTutors.response.status, 200);
  assert.equal(
    publicTutors.body.some((tutor: { id: number }) => tutor.id === tutorId),
    false,
  );

  const accounts = await request("/api/workspace/accounts", {}, ownerUserId);
  assert.equal(accounts.response.status, 200);
  const pendingAccount = accounts.body.find(
    (account: { email: string }) =>
      account.email === "lifecycle-pending@example.test",
  );
  assert(pendingAccount);
  assert.equal(pendingAccount.role, "pending");
  assert.equal(pendingAccount.tutorId, null);

  const assigned = await request(
    `/api/workspace/accounts/${pendingAccount.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role: "tutor", tutorId }),
    },
    ownerUserId,
  );
  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.body.role, "tutor");
  assert.equal(assigned.body.tutorId, tutorId);
  assert.equal(assigned.body.tutorName, tutorName);

  const titleOnlyDraft = await request(
    "/api/workspace/articles",
    {
      method: "POST",
      body: JSON.stringify({ title: "Lifecycle title-only draft" }),
    },
    pendingUserId,
  );
  assert.equal(titleOnlyDraft.response.status, 201);
  assert.equal(titleOnlyDraft.body.title, "Lifecycle title-only draft");
  assert.equal(titleOnlyDraft.body.status, "draft");
  assert.equal(titleOnlyDraft.body.subject, "");
  assert.equal(titleOnlyDraft.body.body, "");

  const pendingSession = await request("/api/workspace/me", {}, pendingUserId);
  assert.equal(pendingSession.response.status, 200);
  assert.equal(pendingSession.body.role, "tutor");
  assert.equal(pendingSession.body.tutor.id, tutorId);
  assert.equal(
    pendingSession.body.tutor.name,
    tutorName,
    "the activated account retains its assigned tutor",
  );
  assert.equal(
    pendingSession.body.availableTutorAccents.includes(
      pendingSession.body.tutor.tint,
    ),
    true,
  );

  clerkEmailByUserId.set(pendingUserId, "lifecycle-pending-updated@example.test");
  const pendingSessionAfterEmailChange = await request(
    "/api/workspace/me",
    {},
    pendingUserId,
  );
  assert.equal(pendingSessionAfterEmailChange.response.status, 200);
  const accountsAfterEmailChange = await request(
    "/api/workspace/accounts",
    {},
    ownerUserId,
  );
  assert.equal(accountsAfterEmailChange.response.status, 200);
  const updatedPendingAccount = accountsAfterEmailChange.body.find(
    (account: { tutorId: number | null }) => account.tutorId === tutorId,
  );
  assert(updatedPendingAccount);
  assert.equal(updatedPendingAccount.email, "lifecycle-pending-updated@example.test");

  const workspaceTutors = await request("/api/workspace/tutors", {}, ownerUserId);
  assert.equal(workspaceTutors.response.status, 200);
  const existingTutorWithOtherAccent = workspaceTutors.body.find(
    (tutor: { id: number; tint: string }) =>
      tutor.id !== tutorId && tutor.tint !== pendingSession.body.tutor.tint,
  );
  assert(existingTutorWithOtherAccent);

  const archived = await request(
    `/api/workspace/tutors/${tutorId}`,
    { method: "POST" },
    ownerUserId,
  );
  assert.equal(archived.response.status, 200);
  assert.equal(archived.body.profileStatus, "archived");

  const archivedWorkspaceTutors = await request(
    "/api/workspace/tutors",
    {},
    ownerUserId,
  );
  assert.equal(archivedWorkspaceTutors.response.status, 200);
  assert.equal(
    archivedWorkspaceTutors.body.find(
      (tutor: { id: number }) => tutor.id === tutorId,
    ).profileStatus,
    "archived",
  );

  const publicTutorsAfterArchive = await request("/api/tutors");
  assert.equal(
    publicTutorsAfterArchive.body.some(
      (tutor: { id: number }) => tutor.id === tutorId,
    ),
    false,
  );

  const blockedArchivedProfileUpdate = await request(
    "/api/workspace/profile",
    {
      method: "PATCH",
      body: JSON.stringify({ status: "draft" }),
    },
    pendingUserId,
  );
  assert.equal(blockedArchivedProfileUpdate.response.status, 409);

  const restored = await request(
    `/api/workspace/tutors/${tutorId}`,
    { method: "PUT" },
    ownerUserId,
  );
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.profileStatus, "draft");

  const duplicateAccent = await request(
    "/api/workspace/profile",
    {
      method: "PATCH",
      body: JSON.stringify({ tint: existingTutorWithOtherAccent.tint }),
    },
    pendingUserId,
  );
  assert.equal(duplicateAccent.response.status, 409);

  const profileDraft = await request(
    "/api/workspace/profile",
    {
      method: "PATCH",
      body: JSON.stringify({
        firstName: "",
        lastName: "",
        subject: "",
        teachingPoints: [
          { title: "", body: "" },
          { title: "", body: "" },
          { title: "", body: "" },
        ],
        status: "draft",
      }),
    },
    pendingUserId,
  );
  assert.equal(profileDraft.response.status, 200);
  assert.equal(profileDraft.body.profileStatus, "draft");

  const incompleteProfilePublish = await request(
    "/api/workspace/profile",
    {
      method: "PATCH",
      body: JSON.stringify({ status: "published" }),
    },
    pendingUserId,
  );
  assert.equal(incompleteProfilePublish.response.status, 400);

  const publishedProfile = await request(
    "/api/workspace/profile",
    {
      method: "PATCH",
      body: JSON.stringify({
        firstName: "Lifecycle",
        lastName: "Tutor",
        initials: "LT",
        subject: "History",
        university: "University of London",
        qualification: "BA History",
        bio: "A thoughtful tutor helping students build clear, confident historical arguments.",
        style: "Patient and structured",
        teachingIntro: "Lessons are calm, focused, and tailored to each student's goals.",
        teachingPoints: [
          { title: "Clarity", body: "We turn complex topics into clear next steps." },
          { title: "Practice", body: "We use focused questions to build exam confidence." },
          { title: "Progress", body: "We review progress and adapt each lesson." },
        ],
        rate: 45,
        availability: "accepting",
        tint: pendingSession.body.tutor.tint,
        status: "published",
      }),
    },
    pendingUserId,
  );
  assert.equal(publishedProfile.response.status, 200);
  assert.equal(publishedProfile.body.profileStatus, "published");

  const draftAfterPublish = await request(
    "/api/workspace/profile",
    {
      method: "PATCH",
      body: JSON.stringify({
        firstName: "Drafted",
        status: "draft",
      }),
    },
    pendingUserId,
  );
  assert.equal(draftAfterPublish.response.status, 200);
  assert.equal(draftAfterPublish.body.firstName, "Drafted");
  assert.equal(draftAfterPublish.body.profileStatus, "draft");

  const [publishedTutorAfterDraft] = await db
    .select({
      firstName: tutorsTable.firstName,
      profileStatus: tutorsTable.profileStatus,
    })
    .from(tutorsTable)
    .where(eq(tutorsTable.id, tutorId));
  assert.deepEqual(publishedTutorAfterDraft, {
    firstName: "Lifecycle",
    profileStatus: "published",
  });

  const [storedDraft] = await db
    .select({ firstName: tutorProfileDraftsTable.firstName })
    .from(tutorProfileDraftsTable)
    .where(eq(tutorProfileDraftsTable.tutorId, tutorId));
  assert.deepEqual(storedDraft, { firstName: "Drafted" });

  const accountsWithPublishedProfileDraft = await request(
    "/api/workspace/accounts",
    {},
    ownerUserId,
  );
  const accountWithPublishedProfileDraft =
    accountsWithPublishedProfileDraft.body.find(
      (account: { tutorId: number | null }) => account.tutorId === tutorId,
    );
  assert(accountWithPublishedProfileDraft);
  assert.equal(
    accountWithPublishedProfileDraft.tutorProfileStatus,
    "published",
  );

  const publicTutorsWithDraft = await request("/api/tutors");
  const publishedTutorWithDraft = publicTutorsWithDraft.body.find(
    (tutor: { id: number }) => tutor.id === tutorId,
  );
  assert(publishedTutorWithDraft);
  assert.equal(publishedTutorWithDraft.firstName, "Lifecycle");

  const ownerTutorProfilesWithDraft = await request(
    "/api/workspace/tutors",
    {},
    ownerUserId,
  );
  const ownerTutorProfileWithDraft = ownerTutorProfilesWithDraft.body.find(
    (tutor: { id: number }) => tutor.id === tutorId,
  );
  assert(ownerTutorProfileWithDraft);
  assert.equal(ownerTutorProfileWithDraft.profileStatus, "published");

  const sessionWithDraft = await request(
    "/api/workspace/me",
    {},
    pendingUserId,
  );
  assert.equal(sessionWithDraft.body.tutor.firstName, "Drafted");
  assert.equal(sessionWithDraft.body.tutor.profileStatus, "draft");
  assert.equal(
    sessionWithDraft.body.tutor.slug,
    "lifecycle-tutor",
  );

  const unauthenticatedDiscard = await request(
    "/api/workspace/profile/draft",
    { method: "DELETE" },
  );
  assert.equal(unauthenticatedDiscard.response.status, 401);

  const discardedDraft = await request(
    "/api/workspace/profile/draft",
    { method: "DELETE" },
    pendingUserId,
  );
  assert.equal(discardedDraft.response.status, 200);
  assert.equal(discardedDraft.body.firstName, "Lifecycle");
  assert.equal(discardedDraft.body.profileStatus, "published");

  const draftsAfterDiscard = await db
    .select({ id: tutorProfileDraftsTable.id })
    .from(tutorProfileDraftsTable)
    .where(eq(tutorProfileDraftsTable.tutorId, tutorId));
  assert.deepEqual(draftsAfterDiscard, []);

  const publicTutorsAfterDiscard = await request("/api/tutors");
  const publishedTutorAfterDiscard = publicTutorsAfterDiscard.body.find(
    (tutor: { id: number }) => tutor.id === tutorId,
  );
  assert(publishedTutorAfterDiscard);
  assert.equal(publishedTutorAfterDiscard.firstName, "Lifecycle");

  const restoredDraft = await request(
    "/api/workspace/profile",
    {
      method: "PATCH",
      body: JSON.stringify({
        firstName: "Drafted",
        status: "draft",
      }),
    },
    pendingUserId,
  );
  assert.equal(restoredDraft.response.status, 200);

  const republishedProfile = await request(
    "/api/workspace/profile",
    {
      method: "PATCH",
      body: JSON.stringify({ status: "published" }),
    },
    pendingUserId,
  );
  assert.equal(republishedProfile.response.status, 200);
  assert.equal(republishedProfile.body.firstName, "Drafted");
  assert.equal(republishedProfile.body.profileStatus, "published");

  const draftsAfterRepublish = await db
    .select({ id: tutorProfileDraftsTable.id })
    .from(tutorProfileDraftsTable)
    .where(eq(tutorProfileDraftsTable.tutorId, tutorId));
  assert.deepEqual(draftsAfterRepublish, []);

  const publicTutorsAfterRepublish = await request("/api/tutors");
  const republishedTutor = publicTutorsAfterRepublish.body.find(
    (tutor: { id: number }) => tutor.id === tutorId,
  );
  assert(republishedTutor);
  assert.equal(republishedTutor.firstName, "Drafted");

  const resource = await request(
    "/api/workspace/resources",
    {
      method: "POST",
      body: JSON.stringify({
         title: "Lifecycle resource",
        subject: "History",
        level: "GCSE",
        type: "Guide",
        readMinutes: 5,
         excerpt: "A short resource created to verify the tutor delete cascade.",
         body: "This resource exists only to confirm that tutor deletion removes related content.",
        sections: [],
        tint: "#C7D5C5",
      }),
    },
    pendingUserId,
  );
  assert.equal(resource.response.status, 201);
  assert.equal(resource.body.readMinutes, 1);
  assert.equal(resource.body.tint, pendingSession.body.tutor.tint);
  const resourceId = resource.body.id as number;

  const publishedResource = await request(
    `/api/workspace/resources/${resourceId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "published" }),
    },
    pendingUserId,
  );
  assert.equal(publishedResource.response.status, 200);

  const savedProfile = await request(
    "/api/workspace/profile",
    {
      method: "PATCH",
      body: JSON.stringify({ tint: pendingSession.body.tutor.tint }),
    },
    pendingUserId,
  );
  assert.equal(savedProfile.response.status, 200);
  assert.equal(savedProfile.body.resources[0].tutorTint, pendingSession.body.tutor.tint);
  assert.equal(savedProfile.body.resources[0].tint, pendingSession.body.tutor.tint);

  const nonOwnerDelete = await request(
    `/api/workspace/tutors/${tutorId}`,
    { method: "DELETE" },
    nonOwnerUserId,
  );
  assert.equal(nonOwnerDelete.response.status, 403);

  const unauthenticatedDelete = await request(
    `/api/workspace/tutors/${tutorId}`,
    { method: "DELETE" },
  );
  assert.equal(unauthenticatedDelete.response.status, 401);

  const deleted = await request(
    `/api/workspace/tutors/${tutorId}`,
    { method: "DELETE" },
    ownerUserId,
  );
  assert.equal(deleted.response.status, 204);

  const publicTutorsAfterDelete = await request("/api/tutors");
  assert.equal(publicTutorsAfterDelete.response.status, 200);
  assert.equal(
    publicTutorsAfterDelete.body.some(
      (tutor: { id: number }) => tutor.id === tutorId,
    ),
    false,
  );

  const accountAfterDelete = await db
    .select({
      role: workspaceAccountsTable.role,
      tutorId: workspaceAccountsTable.tutorId,
    })
    .from(workspaceAccountsTable)
    .where(eq(workspaceAccountsTable.clerkUserId, pendingUserId));
  assert.deepEqual(accountAfterDelete, [{ role: "tutor", tutorId: null }]);

  const resourceAfterDelete = await db
    .select({ id: resourcesTable.id })
    .from(resourcesTable)
    .where(eq(resourcesTable.id, resourceId));
  assert.deepEqual(resourceAfterDelete, []);

  const pendingSessionAfterDelete = await request(
    "/api/workspace/me",
    {},
    pendingUserId,
  );
  assert.equal(pendingSessionAfterDelete.response.status, 200);
  assert.equal(pendingSessionAfterDelete.body.role, "tutor");
  assert.equal(pendingSessionAfterDelete.body.tutor.profileStatus, "draft");
  assert.equal(pendingSessionAfterDelete.body.tutor.firstName, "Lifecycle");
  assert.equal(pendingSessionAfterDelete.body.tutor.lastName, "Pending");

  const nonOwnerAccount = await db
    .select({ id: workspaceAccountsTable.id })
    .from(workspaceAccountsTable)
    .where(eq(workspaceAccountsTable.clerkUserId, nonOwnerUserId));
  assert.equal(nonOwnerAccount.length, 1);

  const unauthorizedAccountDelete = await request(
    `/api/workspace/accounts/${nonOwnerAccount[0].id}`,
    { method: "DELETE" },
    nonOwnerUserId,
  );
  assert.equal(unauthorizedAccountDelete.response.status, 403);

  const accountDelete = await request(
    `/api/workspace/accounts/${pendingAccount.id}`,
    { method: "DELETE" },
    ownerUserId,
  );
  assert.equal(accountDelete.response.status, 204);

  const tutorAfterAccountDelete = await db
    .select({ id: tutorsTable.id })
    .from(tutorsTable)
    .where(eq(tutorsTable.name, pendingTutorName));
  assert.equal(tutorAfterAccountDelete.length, 1);

  await db
    .delete(tutorsTable)
    .where(eq(tutorsTable.name, pendingTutorName));
});

test("approved tutor receives a private draft on first workspace sign-in", async () => {
  const accounts = await request("/api/workspace/accounts", {}, ownerUserId);
  const account = accounts.body.find(
    (item: { email: string }) => item.email === "auto-provision@example.test",
  );
  assert(account);
  assert.equal(account.role, "pending");
  assert.equal(account.tutorId, null);

  const approved = await request(
    `/api/workspace/accounts/${account.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role: "tutor" }),
    },
    ownerUserId,
  );
  assert.equal(approved.response.status, 200);
  assert.equal(approved.body.role, "tutor");
  assert.equal(approved.body.tutorId, null);

  const session = await request(
    "/api/workspace/me",
    {},
    autoProvisionUserId,
  );
  assert.equal(session.response.status, 200);
  assert.equal(session.body.role, "tutor");
  assert(session.body.tutor);
  assert.equal(session.body.tutor.name, autoProvisionTutorName);
  assert.equal(session.body.tutor.profileStatus, "draft");

  const publicTutors = await request("/api/tutors");
  assert.equal(
    publicTutors.body.some(
      (tutor: { id: number }) => tutor.id === session.body.tutor.id,
    ),
    false,
  );

  const secondSession = await request(
    "/api/workspace/me",
    {},
    autoProvisionUserId,
  );
  assert.equal(secondSession.body.tutor.id, session.body.tutor.id);
});

test("verified email reuses an existing workspace account across Clerk identities", async () => {
  const originalAccount = await db
    .select({
      id: workspaceAccountsTable.id,
      clerkUserId: workspaceAccountsTable.clerkUserId,
    })
    .from(workspaceAccountsTable)
    .where(eq(workspaceAccountsTable.email, "lifecycle-owner@example.test"));
  assert.equal(originalAccount.length, 1);
  assert.equal(originalAccount[0].clerkUserId, ownerUserId);

  const aliasedSession = await request(
    "/api/workspace/me",
    {},
    ownerAliasUserId,
  );
  assert.equal(aliasedSession.response.status, 200);
  assert.equal(aliasedSession.body.id, originalAccount[0].id);
  assert.equal(aliasedSession.body.email, "lifecycle-owner@example.test");

  const matchingAccounts = await db
    .select({
      id: workspaceAccountsTable.id,
      clerkUserId: workspaceAccountsTable.clerkUserId,
    })
    .from(workspaceAccountsTable)
    .where(eq(workspaceAccountsTable.email, "lifecycle-owner@example.test"));
  assert.deepEqual(matchingAccounts, originalAccount);
});