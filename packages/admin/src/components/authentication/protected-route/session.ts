import type { LoaderFunctionArgs } from "react-router-dom"

import { meQueryOptions } from "../../../hooks/api/users"
import { queryClient } from "../../../lib/query-client"

const answers = new WeakMap<AbortSignal, Promise<boolean>>()

const askOnce = async () => {
  try {
    const { user } = await queryClient.ensureQueryData(meQueryOptions())

    return Boolean(user)
  } catch {
    return false
  }
}

/**
 * The `me` request `ProtectedRoute` decides on, issued from the router so that
 * it settles before any loader below the guard runs. Any failure reads as "no
 * session", which is also how the guard treats it.
 *
 * Asked once per navigation. Its loaders share the navigation's signal, and a
 * lazy route's loader often starts only after the answer is back; a failed
 * `me` leaves nothing in the cache, so asking the cache again sent a second
 * request. Signed in, the cache answers and a navigation costs nothing extra.
 *
 * Its own 401 stays, deliberately. The session cookie is httpOnly, so only
 * the server can say whether there is one, and Chrome logs every 4xx response
 * where no script can stop it. `GET /admin/users/me` is Medusa's own route;
 * answering 200 to an anonymous caller would mean overriding it, to quiet one
 * line printed on the way to /login.
 */
export const hasSession = ({ request }: LoaderFunctionArgs) => {
  let answer = answers.get(request.signal)

  if (!answer) {
    answer = askOnce()
    answers.set(request.signal, answer)
  }

  return answer
}
