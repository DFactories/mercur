import { describe, expect, it } from "vitest";

import { planDocumentChanges, withKnownType } from "../plan-document-changes";

const pdf = () => new File(["%PDF-1.7"], "license.pdf", { type: "application/pdf" });
const existingDoc = { url: "https://signed.example/x", mime_type: null, expires_in: 300, legacy: false };

describe("planDocumentChanges", () => {
  it("leaves an existing document alone when the drawer is saved unchanged", () => {
    const plan = planDocumentChanges(
      { business_license: { file: null }, health_permit: { file: null } },
      { business_license: existingDoc, health_permit: existingDoc },
    );
    expect(plan).toEqual({ files: {}, removed: [] });
  });

  it("uploads only the field that got a new file", () => {
    const file = pdf();
    const plan = planDocumentChanges(
      { business_license: { file }, health_permit: { file: null } },
      { business_license: existingDoc, health_permit: existingDoc },
    );
    expect(plan.files).toEqual({ business_license: file });
    expect(plan.removed).toEqual([]);
  });

  it("removes a document only when it existed and the field was emptied", () => {
    const plan = planDocumentChanges(
      { business_license: null, health_permit: undefined },
      { business_license: existingDoc, health_permit: null },
    );
    expect(plan.removed).toEqual(["business_license"]);
  });

  it("removes nothing when the documents could not be read", () => {
    // A seat without `seller:read` gets no documents; an empty field there is
    // not a request to delete what it cannot see.
    const plan = planDocumentChanges(
      { business_license: null, health_permit: null },
      undefined,
    );
    expect(plan).toEqual({ files: {}, removed: [] });
  });
});

describe("withKnownType", () => {
  it("names a type-less HEIC from its extension", () => {
    const photo = new File(["x"], "IMG_0001.HEIC", { type: "" });
    expect(withKnownType(photo).type).toBe("image/heic");
  });

  it("leaves a typed file, or an unknown extension, as it is", () => {
    const file = pdf();
    expect(withKnownType(file)).toBe(file);
    const other = new File(["x"], "notes", { type: "" });
    expect(withKnownType(other)).toBe(other);
  });
});
