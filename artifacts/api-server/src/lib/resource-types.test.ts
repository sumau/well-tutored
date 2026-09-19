import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeResourceType,
  RESOURCE_TYPES,
} from "./resource-types";

test("supports exactly the approved resource formats", () => {
  assert.deepEqual(
    RESOURCE_TYPES,
    ["Study note", "Guide", "Essay", "Revision notes"],
  );

  for (const type of RESOURCE_TYPES) {
    assert.equal(normalizeResourceType(type), type);
  }
});

test("normalizes legacy resource format labels", () => {
  assert.equal(normalizeResourceType("Resource"), "Study note");
  assert.equal(normalizeResourceType("Study guide"), "Guide");
  assert.equal(normalizeResourceType("Essay guide"), "Guide");
  assert.equal(normalizeResourceType("Exam note"), "Revision notes");
  assert.equal(normalizeResourceType("Problem-solving note"), "Study note");
});

test("rejects unsupported resource format labels", () => {
  assert.throws(
    () => normalizeResourceType("Newsletter"),
    /Unsupported resource type: Newsletter/,
  );
});