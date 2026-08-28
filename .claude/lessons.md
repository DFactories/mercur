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

### The integration suite runs against `.medusa/server`, not `src`

`integration-tests/` boots the app through the workspace package's export map,
which points at `packages/core/.medusa/server` — the compiled output. Editing
`packages/core/src` changes nothing until `bun run build` regenerates it, and
`--no-cache` on jest does not help because the stale code is on disk, not in a
cache.

What makes this expensive is that the evidence lies. The build emits inline
source maps, so every stack trace in the test log names
`packages/core/src/…/foo.ts` and the line numbers match the source you just
edited. It reads exactly like your change is running.

It cost a false green here while proving a regression spec actually gates its
bug: `src` was reverted to the pre-fix version, the spec still passed, and the
log's stack trace still showed the fixed function by name. Rebuilding after the
revert turned it red immediately.

**Any check of the form "does this spec fail without the fix?" has to rebuild
core after touching `src` — both on the way down and on the way back.** The
publish workflow gets this right for free (it runs `bun run build` before the
regression job); local runs do not.
