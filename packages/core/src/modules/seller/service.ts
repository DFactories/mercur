import { configManager } from "@medusajs/framework/config"
import { Context, DAL, FindConfig, InternalModuleDeclaration } from "@medusajs/framework/types"
import {
  generateJwtToken,
  InjectManager,
  isValidHandle,
  MedusaContext,
  MedusaError,
  MedusaService,
  toHandle,
  InjectTransactionManager,
} from "@medusajs/framework/utils"
import jwt, { JwtPayload } from "jsonwebtoken"
import crypto from "node:crypto"
import {
  Seller,
  ProfessionalDetails,
  SellerAddress,
  PaymentDetails,
  Member,
  SellerMember,
  MemberInvite,
  OrderGroup,
} from "./models"
import { OrderGroupRepository } from "./repositories"
import {
  describeMemberIdentity,
  findMemberByIdentity,
  hasMemberIdentity,
  indexMembersByIdentity,
  type MemberIdentity,
} from "./utils/member-identity"
import { withoutImplicitHandleChange } from "./utils/seller-handle"
import { MemberDTO, MemberInviteDTO, OrderGroupDTO, SellerDTO, SellerModuleOptions } from "@mercurjs/types"

const DEFAULT_INVITE_VALID_DURATION_SECONDS = 60 * 60 * 24 * 7 // 7 days

/** What a caller may hand `createMemberInvites`. Exactly one identity is set. */
type CreateMemberInviteInput = MemberIdentity & {
  seller_id: string
  role_id?: string
  id?: string
  accepted?: boolean
  expires_at?: Date
}

type InjectedDependencies = {
  orderGroupRepository: OrderGroupRepository
  baseRepository: DAL.RepositoryService
}

class SellerModuleService extends MedusaService({
  Seller,
  ProfessionalDetails,
  SellerAddress,
  PaymentDetails,
  Member,
  SellerMember,
  MemberInvite,
  OrderGroup,
}) {
  protected readonly orderGroupRepository_: OrderGroupRepository
  protected readonly baseRepository_: DAL.RepositoryService
  protected readonly options_: SellerModuleOptions

  constructor(
    { orderGroupRepository, baseRepository }: InjectedDependencies,
    protected readonly moduleDeclaration?: InternalModuleDeclaration,
  ) {
    // @ts-ignore
    // eslint-disable-next-line prefer-rest-params
    super(...arguments)
    this.orderGroupRepository_ = orderGroupRepository
    this.baseRepository_ = baseRepository

    const opts = (moduleDeclaration?.options as SellerModuleOptions) ?? {}
    this.options_ = {
      ...opts,
      jwt_secret:
        opts.jwt_secret ??
        (configManager.config.projectConfig.http.jwtSecret as string),
      vendor_url: opts.vendor_url ?? process.env.MERCUR_VENDOR_URL ?? "",
    }
  }

  @InjectTransactionManager()
  // @ts-ignore
  async createSellers<T extends any | any[]>(
    data: T,
    sharedContext?: Context,
  ): Promise<T extends any[] ? SellerDTO[] : SellerDTO> {
    const input = (Array.isArray(data) ? data : [data]).map((seller) => {
      this.validateSellerData_(seller)

      if (!seller.handle && seller.name) {
        seller.handle = toHandle(seller.name)
      }

      return seller
    })

    const result = await super.createSellers(input, sharedContext)
    return (Array.isArray(data) ? result : result[0]) as any
  }

  @InjectTransactionManager()
  // @ts-ignore
  async updateSellers<T extends any | any[]>(
    data: T,
    sharedContext?: Context,
  ): Promise<T extends any[] ? SellerDTO[] : SellerDTO> {
    // No name-derived handle here — that is `createSellers`' job only. See
    // `withoutImplicitHandleChange`.
    const input = (Array.isArray(data) ? data : [data]).map((seller) => {
      this.validateSellerData_(seller)
      return withoutImplicitHandleChange(seller)
    })

    // @ts-ignore
    const result = await super.updateSellers(input, sharedContext)
    // One seller in, one seller out — as the signature promises and as
    // `createSellers` already does. It used to return a one-element array.
    return (Array.isArray(data) ? result : result[0]) as any
  }

  /**
   * Every existing member named by these records, by EITHER identity.
   *
   * Two queries rather than one `$or`: `email` and `phone` are separate partial
   * unique indexes, and querying them separately keeps each lookup on its own
   * index. A member holding both is returned twice — `indexMembersByIdentity`
   * dedupes on id.
   */
  private async listMembersByIdentity_(
    records: MemberIdentity[],
    config: FindConfig<MemberDTO> = {},
    sharedContext?: Context,
  ): Promise<MemberDTO[]> {
    const emails = records
      .map((r) => r.email)
      .filter((e): e is string => !!e)
    const phones = records
      .map((r) => r.phone)
      .filter((p): p is string => !!p)

    const found: MemberDTO[] = []

    if (emails.length) {
      found.push(
        ...(await this.listMembers({ email: emails }, config, sharedContext)),
      )
    }
    if (phones.length) {
      found.push(
        ...(await this.listMembers({ phone: phones }, config, sharedContext)),
      )
    }

    return found
  }

  @InjectTransactionManager()
  async upsertMembers(
    data: {
      email?: string | null
      phone?: string | null
      first_name?: string | null
      last_name?: string | null
    }[],
    sharedContext?: Context,
  ): Promise<MemberDTO[]> {
    // Members are keyed by email (email/password sign-up) OR phone (OTP sign-up).
    //
    // A record with neither is rejected BEFORE anything is written. Such a row
    // can never be matched again — both lookup maps below are keyed by identity
    // and the unique indexes are partial on `IS NOT NULL`, so the database
    // accepts any number of them — and it produces a member who cannot sign in
    // and cannot be re-invited. The old code created the row first and only
    // then failed to find it, returning `undefined` as a MemberDTO and leaving
    // the orphan behind; refusing up front keeps that row from existing at all.
    if (data.some((d) => !hasMemberIdentity(d))) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A member requires an email or a phone number."
      )
    }

    const existing = await this.listMembersByIdentity_(data, {}, sharedContext)
    const index = indexMembersByIdentity(existing)

    const findExisting = (d: MemberIdentity) =>
      findMemberByIdentity(index, d)

    const toCreate = data.filter((d) => !findExisting(d))
    const created = toCreate.length
      ? await this.createMembers(toCreate, sharedContext)
      : []
    const createdArr = Array.isArray(created) ? created : [created]
    const createdIndex = indexMembersByIdentity(createdArr)

    const toUpdate = data
      .map((d) => {
        const existingMember = findExisting(d)
        if (!existingMember) {
          return null
        }
        const update: { id: string; first_name?: string; last_name?: string } = {
          id: existingMember.id,
        }
        if (d.first_name != null && !existingMember.first_name) {
          update.first_name = d.first_name
        }
        if (d.last_name != null && !existingMember.last_name) {
          update.last_name = d.last_name
        }
        return Object.keys(update).length > 1 ? update : null
      })
      .filter(
        (u): u is { id: string; first_name?: string; last_name?: string } => !!u
      )

    if (toUpdate.length) {
      await this.updateMembers(toUpdate, sharedContext)
    }

    return data.map((d) => {
      const ex = findExisting(d)
      if (ex) {
        return ex
      }
      const createdMember = findMemberByIdentity(createdIndex, d)

      // Unreachable: the identity guard at the top of this method means every
      // record has an email or a phone, so it is in one of the two maps. Kept
      // as a throw rather than a `!` because the previous non-null assertion
      // was not true and cost an orphan member row to discover.
      if (!createdMember) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Upserted member could not be resolved after creation."
        )
      }

      return createdMember
    })
  }

  @InjectTransactionManager()
  // @ts-ignore
  async createMemberInvites<T extends any | any[]>(
    data: T,
    sharedContext?: Context,
  ): Promise<T extends any[] ? MemberInviteDTO[] : MemberInviteDTO> {
    const validDuration = this.options_.invite_valid_duration ?? DEFAULT_INVITE_VALID_DURATION_SECONDS

    // Named rather than inferred: the method's generic is `T extends any`, so
    // `inviteList` widens to `(T & any[]) | T[]` and the identity helpers —
    // which are typed — cannot accept it. This says what an invite actually
    // carries, which is also the only documentation of that shape.
    const inviteList = (
      Array.isArray(data) ? data : [data]
    ) as CreateMemberInviteInput[]

    const sellerIds = [...new Set(inviteList.map((i) => i.seller_id))]
    const sellers = await this.listSellers(
      { id: sellerIds },
      { select: ["id", "name"] },
      sharedContext,
    )
    const sellerMap = new Map(sellers.map((s) => [s.id, s.name]))

    // An invite is addressed by phone (the OTP-native, primary identity) or by
    // email. Everything below resolves the invitee through EITHER — the
    // previous version looked only at `email`, so on the phone path no existing
    // member was ever found: the duplicate check passed for someone who already
    // had a seat, and `existing_member` was stamped `false` into every token.
    if (inviteList.some((i) => !hasMemberIdentity(i))) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "An invite requires an email or a phone number."
      )
    }

    const index = indexMembersByIdentity(
      await this.listMembersByIdentity_(
        inviteList,
        { select: ["id", "email", "phone"] },
        sharedContext,
      ),
    )
    const existingMembers = index.unique
    const findMember = (i: MemberIdentity) => findMemberByIdentity(index, i)

    if (existingMembers.length > 0) {
      const existingSellerMembers = await this.listSellerMembers(
        {
          seller_id: sellerIds,
          member_id: existingMembers.map((m) => m.id),
        },
        { select: ["seller_id", "member_id"] },
        sharedContext,
      )

      // Keyed on the member id rather than on the email the old code round-
      // tripped through: the id is the thing the seat is actually held by, and
      // it is present whichever identity the invite was addressed to.
      const seatKeys = new Set(
        existingSellerMembers.map((sm) => `${sm.seller_id}:${sm.member_id}`),
      )

      const duplicates = inviteList.filter((i) => {
        const member = findMember(i)
        return !!member && seatKeys.has(`${i.seller_id}:${member.id}`)
      })

      if (duplicates.length > 0) {
        const identities = duplicates.map(describeMemberIdentity).join(", ")
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `The following are already members of the seller: ${identities}`
        )
      }
    }

    const input = inviteList.map((invite) => {
      const id = invite.id ?? `meminv_${crypto.randomUUID()}`
      return {
        ...invite,
        id,
        token: this.generateInviteToken_(
          {
            id,
            email: invite.email ?? null,
            phone: invite.phone ?? null,
            seller_name: sellerMap.get(invite.seller_id) ?? "",
            // Resolved through either identity. On the phone path this was
            // always `false`, so the accept page routed a person who already
            // had an account into sign-up and tried to mint a second one.
            existing_member: !!findMember(invite),
          },
          validDuration,
        ),
        accepted: invite.accepted ?? false,
        expires_at: invite.expires_at ?? new Date(Date.now() + validDuration * 1000),
      }
    })

    const result = await super.createMemberInvites(input, sharedContext)
    return (Array.isArray(data) ? result : result[0]) as any
  }

  @InjectManager()
  async validateMemberInviteToken(
    token: string,
    @MedusaContext() sharedContext: Context = {},
  ): Promise<MemberInviteDTO> {
    let decoded: JwtPayload
    try {
      decoded = jwt.verify(token, this.options_.jwt_secret, {
        complete: true,
      }) as JwtPayload
    } catch {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Invalid invite token"
      )
    }

    const invite = await this.retrieveMemberInvite(
      decoded.payload.id,
      {},
      sharedContext,
    ) as MemberInviteDTO

    if (invite.accepted) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Invite has already been accepted"
      )
    }

    if (new Date() > new Date(invite.expires_at)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Invite token has expired"
      )
    }

    return invite
  }

  private generateInviteToken_(
    data: {
      id: string
      email?: string | null
      phone?: string | null
      seller_name: string
      existing_member: boolean
    },
    expiresIn: number,
  ): string {
    return generateJwtToken(data, {
      secret: this.options_.jwt_secret,
      expiresIn,
      jwtOptions: {
        jwtid: crypto.randomUUID(),
      },
    })
  }

  private validateSellerData_(data: any) {
    if (data.handle && !isValidHandle(data.handle)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Invalid seller handle '${data.handle}'. It must contain URL safe characters`
      )
    }
  }

  @InjectManager()
  // @ts-ignore
  async listOrderGroups(
    filters: any = {},
    config: FindConfig<any> = {},
    @MedusaContext() sharedContext: Context = {}
  ) {
    const [orderGroups] = await this.orderGroupRepository_.findAndCount(
      {
        where: filters,
        options: config,
      },
      sharedContext
    )

    return await this.baseRepository_.serialize<OrderGroupDTO[]>(orderGroups)
  }

  @InjectManager()
  // @ts-ignore
  async listAndCountOrderGroups(
    filters: any = {},
    config: FindConfig<any> = {},
    @MedusaContext() sharedContext: Context = {}
  ) {
    const [orderGroups, count] = await this.orderGroupRepository_.findAndCount(
      {
        where: filters,
        options: config,
      },
      sharedContext
    )
    return [
      await this.baseRepository_.serialize<OrderGroupDTO[]>(orderGroups),
      count,
    ]
  }

  @InjectManager()
  // @ts-ignore
  async retrieveOrderGroup(
    id: string,
    config: FindConfig<any> = {},
    @MedusaContext() sharedContext: Context = {}
  ) {
    const [orderGroups] = await this.orderGroupRepository_.findAndCount(
      {
        where: { id },
        options: config,
      },
      sharedContext
    )

    return await this.baseRepository_.serialize<OrderGroupDTO>(orderGroups[0])
  }
}

export default SellerModuleService
