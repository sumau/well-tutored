import assert from "node:assert/strict";
import test from "node:test";
import {
  authRouteDefinitions,
  legacyWorkspaceResourcePath,
  publicRouteDefinitions,
  resolveRoute,
  routePaths,
  workspaceRouteDefinitions,
  workspaceSignedOutRedirect,
} from "./route-map";

test("keeps public pages on their expected route map", () => {
  assert.deepEqual(
    publicRouteDefinitions.map(({ path, page }) => [path, page]),
    [
      ["/", "Home"],
      ["/tutors/:slug", "TutorProfile"],
      ["/resources", "Resources"],
      ["/resources/:slug", "ResourceDetail"],
      ["/enquire", "Enquiry"],
    ],
  );

  assert.deepEqual(resolveRoute("/"), { kind: "page", page: "Home" });
  assert.deepEqual(resolveRoute("/tutors/alice"), {
    kind: "page",
    page: "TutorProfile",
  });
  assert.deepEqual(resolveRoute("/resources/essay-planning"), {
    kind: "page",
    page: "ResourceDetail",
  });
});

test("keeps Clerk callback wildcard routes available", () => {
  assert.deepEqual(
    authRouteDefinitions.map(({ path, page }) => [path, page]),
    [
      ["/sign-in/*?", "SignInPage"],
      ["/sign-up/*?", "SignUpPage"],
    ],
  );
  assert.deepEqual(resolveRoute("/sign-in/sso-callback"), {
    kind: "page",
    page: "SignInPage",
  });
  assert.deepEqual(resolveRoute("/sign-up/verify"), {
    kind: "page",
    page: "SignUpPage",
  });
});

test("redirects signed-out users away from every workspace path", () => {
  assert.equal(workspaceSignedOutRedirect(), "/sign-in");
  assert.deepEqual(resolveRoute("/workspace", false), {
    kind: "redirect",
    to: "/sign-in",
  });
  assert.deepEqual(resolveRoute("/workspace/resources/new", false), {
    kind: "redirect",
    to: "/sign-in",
  });
});

test("resolves signed-in workspace pages and legacy resource redirects", () => {
  assert.equal(workspaceRouteDefinitions[0].path, routePaths.workspace.root);
  assert.deepEqual(resolveRoute("/workspace", true), {
    kind: "page",
    page: "WorkspaceDashboard",
  });
  assert.deepEqual(resolveRoute("/workspace/resources/42", true), {
    kind: "page",
    page: "WorkspaceResourceEditor",
  });
  assert.deepEqual(resolveRoute("/workspace/articles/42", true), {
    kind: "page",
    page: "LegacyWorkspaceResourceRedirect",
  });
  assert.equal(legacyWorkspaceResourcePath(), "/workspace/resources/new");
  assert.equal(
    legacyWorkspaceResourcePath("42"),
    "/workspace/resources/42",
  );
});