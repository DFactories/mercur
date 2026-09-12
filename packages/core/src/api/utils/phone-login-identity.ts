import {
  IAuthModuleService,
  MedusaContainer,
  ProviderIdentityDTO,
} from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"

import { iranMobileVariants } from "./phone"

/** The provider label the phone-OTP routes mint their identities under. */
export const PHONE_OTP_PROVIDER = "phone-otp"

/** Which actor an auth identity points at: a shopper or a store member. */
export type PhoneActorKey = "customer_id" | "member_id"

/**
 * Phone sign-in is not a contact detail, it is the credential:
 * `provider_identity.entity_id` IS the number the account is opened with.
 *
 * So an operator changing someone's number has to move two things, and the
 * order matters less than the fact that BOTH move. Writing only the profile
 * field leaves the old number in charge — support "fixes" a mistyped number,
 * the person still cannot sign in, and whoever the old number belongs to next
 * can. Writing only the identity leaves the panel showing a number the account
 * does not have.
 */

const identityFilter = (entityIds: string[]) =>
  ({
    provider: PHONE_OTP_PROVIDER,
    entity_id: entityIds,
    // `entity_id` takes an array at runtime but the typed filter says string.
  }) as unknown as Parameters<IAuthModuleService["listProviderIdentities"]>[0]

/** Every phone-OTP identity currently holding any spelling of this number. */
export const listPhoneIdentities = async (
  container: MedusaContainer,
  phone: string
): Promise<ProviderIdentityDTO[]> => {
  const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
  return auth.listProviderIdentities(identityFilter(iranMobileVariants(phone)), {
    relations: ["auth_identity"],
  })
}

/**
 * Refuse a number that already opens a different account. `PHONE_ALREADY_REGISTERED`
 * is a code, not a sentence — each client maps it to its own copy.
 */
export const assertPhoneNotClaimedElsewhere = async (
  container: MedusaContainer,
  phone: string,
  owner: { key: PhoneActorKey; id: string }
): Promise<void> => {
  const identities = await listPhoneIdentities(container, phone)
  const claimedByOther = identities.some(
    (pi) => pi.auth_identity?.app_metadata?.[owner.key] !== owner.id
  )
  if (claimedByOther) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      "PHONE_ALREADY_REGISTERED"
    )
  }
}

/**
 * Re-point this actor's phone-OTP sign-in identity at the new number.
 *
 * `(provider, entity_id)` is unique, so where inconsistent legacy state left
 * several identities on the old number for one actor, the first is re-pointed
 * and the rest are deleted — nothing may be left holding the old number.
 * Returns how many identities actually moved: zero is a legitimate outcome
 * (an account that never had a phone login does not gain one here).
 */
export const repointPhoneLoginIdentity = async (
  container: MedusaContainer,
  input: {
    owner: { key: PhoneActorKey; id: string }
    old_phone: string | null
    new_phone: string
  }
): Promise<number> => {
  if (!input.old_phone) {
    return 0
  }

  const auth = container.resolve<IAuthModuleService>(Modules.AUTH)
  const matches = await listPhoneIdentities(container, input.old_phone)

  const mine = matches.filter(
    (pi) =>
      pi.auth_identity?.app_metadata?.[input.owner.key] === input.owner.id &&
      pi.entity_id !== input.new_phone
  )

  const [first, ...rest] = mine
  if (first) {
    await auth.updateProviderIdentities([
      { id: first.id, entity_id: input.new_phone },
    ])
  }
  for (const duplicate of rest) {
    await auth.deleteProviderIdentities([duplicate.id])
  }

  return mine.length
}
