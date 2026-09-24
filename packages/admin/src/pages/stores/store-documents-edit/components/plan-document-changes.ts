import type { StoreDocumentType } from "@lib/client";

export const DOCUMENT_TYPES: StoreDocumentType[] = [
  "business_license",
  "health_permit",
];

export const SUPPORTED_DOC_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

/**
 * Some browsers (Chrome on Windows, older Android) give a HEIC photo an empty
 * `type`. The backend checks the declared type against the file's bytes, so
 * name it from the extension rather than refusing a photo the phone took.
 */
export const withKnownType = (file: File): File => {
  if (file.type || !/\.(heic|heif)$/i.test(file.name)) {
    return file;
  }
  return new File([file], file.name, { type: "image/heic" });
};

type Entry = { file?: unknown } | null | undefined;

/**
 * What saving the form has to do: upload each newly picked file, and delete a
 * document ONLY when one existed and the field was emptied. A field still
 * showing the existing document (no `file`) is left alone — the form's
 * defaults come from the server, so treating "no new file" as "remove" would
 * delete a document every time the drawer was saved.
 */
export const planDocumentChanges = (
  entries: Record<StoreDocumentType, Entry>,
  existing: Partial<Record<StoreDocumentType, unknown>> | undefined,
) => {
  const files: Partial<Record<StoreDocumentType, File>> = {};
  const removed: StoreDocumentType[] = [];

  for (const type of DOCUMENT_TYPES) {
    const entry = entries[type];
    if (entry?.file instanceof File) {
      files[type] = withKnownType(entry.file);
    } else if (!entry && existing?.[type]) {
      removed.push(type);
    }
  }

  return { files, removed };
};
