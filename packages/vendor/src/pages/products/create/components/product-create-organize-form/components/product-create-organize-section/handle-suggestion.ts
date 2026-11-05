import { UseFormReturn } from "react-hook-form"

import { ProductCreateSchemaType } from "../../../../types"

type HandleForm = Pick<
  UseFormReturn<ProductCreateSchemaType>,
  "getValues" | "setValue" | "getFieldState" | "resetField"
>

/**
 * Ask the backend for the Latin handle a new product would get (category word
 * + the title's distinguishing words, already unique) and fill the field unless
 * the producer has typed their own. Silent on any failure: the backend fills
 * an empty handle at submit anyway.
 *
 * Returns the suggestion so the section can offer «استفاده از پیشنهاد» once
 * the producer's own value differs from it.
 */
export const applyHandleSuggestion = async (
  form: HandleForm,
  fetchSuggestion: (title: string, categoryId: string) => Promise<unknown>,
  isCurrent: () => boolean = () => true
): Promise<string | undefined> => {
  const title = form.getValues("title")?.trim()
  const categoryId = form.getValues("category_id")
  if (!title || !categoryId) {
    return undefined
  }

  let handle: unknown
  try {
    handle = await fetchSuggestion(title, categoryId)
  } catch {
    return undefined
  }
  if (typeof handle !== "string" || !handle || !isCurrent()) {
    return undefined
  }

  // A handle the producer typed is theirs; `setValue` without `shouldDirty`
  // keeps a filled suggestion "untouched", so the next category refills it.
  if (!form.getFieldState("handle").isDirty) {
    form.setValue("handle", handle)
  }
  return handle
}

/** Put the suggestion back and mark the field untouched again. */
export const restoreHandleSuggestion = (form: HandleForm, suggestion: string) => {
  form.resetField("handle")
  form.setValue("handle", suggestion)
}
