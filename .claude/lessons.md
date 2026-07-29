# Lessons

### React-query options must never land in a detail hook's `query` slot

Detail hooks are `useX(id, query?, options?)` — the second argument is serialised
into the request's **query string**, not passed to `useQuery`. Calling
`useCollection(id, { initialData, enabled })` therefore issues
`GET /admin/collections/:id?initialData[collection][id]=…&enabled=true`, and the
backend validator rejects it with `400 Invalid request: Unrecognized fields:
'initialData, enabled'` — the detail page never loads. Pass `undefined` for the
query: `useCollection(id, undefined, { initialData, enabled })`.

The trap is that TypeScript does not catch it: the `query` parameter is typed
`Omit<InferClientInput<…>, "$id">`, which is permissive enough to swallow an
options object, and the hooks return `{ ...data, ...rest }` so the result type is
loose too. Only a live request reveals the bug.

Not every hook has a `query` slot. `useSalesChannel(id, options?)` and
`useStore(options?)` take options second **on purpose**, and list hooks are
`useX(query?, options?)` where second-arg options are correct. Always read the
hook definition before "fixing" a call site — adding a third argument to a
two-parameter hook is a compile error (`Expected 1-2 arguments, but got 3`).
