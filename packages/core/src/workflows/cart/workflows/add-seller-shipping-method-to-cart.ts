import { CartWorkflowEvents, MedusaError } from "@medusajs/framework/utils"
import {
    createHook,
    createWorkflow,
    parallelize,
    transform,
    WorkflowData,
    WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, addShippingMethodToCartStep, AddShippingMethodToCartWorkflowInput, emitEventStep, listShippingOptionsForCartWithPricingWorkflow, refreshCartItemsWorkflow, releaseLockStep, removeShippingMethodFromCartStep, useQueryGraphStep, useRemoteQueryStep, validateAndReturnShippingMethodsDataStep, validateCartShippingOptionsPriceStep, validateCartShippingOptionsStep, validateCartStep } from "@medusajs/medusa/core-flows"
import { AdditionalData } from "@medusajs/types"
import { cartFieldsForRefreshSteps } from "../utils"
import { validateCartShippingProfileParityStep } from "../steps"

export const addSellerShippingMethodToCartWorkflow = createWorkflow(
    {
        name: "add-seller-shipping-method-to-cart",
    },
    (
        input: WorkflowData<AddShippingMethodToCartWorkflowInput & AdditionalData>
    ) => {
        acquireLockStep({
            key: input.cart_id,
            timeout: 2,
            ttl: 10,
        })

        const cart = useRemoteQueryStep({
            entry_point: "cart",
            fields: cartFieldsForRefreshSteps,
            variables: { id: input.cart_id },
            list: false,
            throw_if_key_not_found: true,
        })

        // AN ARRAY, not a Set. `filters` is handed to the query graph, which
        // builds an `IN (…)` only for an array — a Set reaches it as an empty
        // object, so `allShippingOptions` came back with nothing and the
        // seller-scoped removal below silently had no sellers to scope by.
        const allShippingOptionsIds = transform({ input, cart }, (data) => {
            return Array.from(new Set([...data.input.options.map((option) => option.id), ...data.cart.shipping_methods.map((sm) => sm.shipping_option_id)]))
        })

        validateCartStep({ cart })

        const validate = createHook("validate", {
            input,
            cart,
        })

        const optionIds = transform({ input }, (data) => {
            return (data.input.options ?? []).map((i) => i.id)
        })

        const [allShippingOptions, shippingOptions] = parallelize(
            useQueryGraphStep({
                entity: "shipping_option",
                fields: ['id', 'name', 'shipping_profile_id', 'seller.id'],
                filters: { id: allShippingOptionsIds },
            }).config({
                name: "shipping-options-with-sellers-query",
            }),
            listShippingOptionsForCartWithPricingWorkflow.runAsStep({
                input: {
                    options: input.options,
                    cart_id: cart.id,
                    is_return: false,
                    additional_data: input.additional_data,
                },
            })
        )

        validateCartShippingOptionsStep({
            option_ids: optionIds,
            prefetched_shipping_options: shippingOptions,
        })

        validateCartShippingOptionsPriceStep({ shippingOptions })

        const validateShippingMethodsDataInput = transform(
            { input, shippingOptions, cart },
            ({ input, shippingOptions, cart }) => {
                return input.options.map((inputOption) => {
                    const shippingOption = shippingOptions.find(
                        (so) => so.id === inputOption.id
                    )

                    return {
                        id: inputOption.id,
                        provider_id: shippingOption?.provider_id,
                        option_data: shippingOption?.data ?? {},
                        method_data: inputOption.data ?? {},
                        context: {
                            ...cart,
                            from_location: shippingOption?.stock_location ?? {},
                        },
                    }
                })
            }
        )

        const validatedMethodData = validateAndReturnShippingMethodsDataStep(
            validateShippingMethodsDataInput
        )

        const shippingMethodInput = transform(
            {
                input,
                shippingOptions,
                validatedMethodData,
            },
            (data) => {
                const options = (data.input.options ?? []).map((option) => {
                    const shippingOption = data.shippingOptions.find(
                        (so) => so.id === option.id
                    )!

                    if (!shippingOption?.calculated_price) {
                        throw new MedusaError(
                            MedusaError.Types.INVALID_DATA,
                            `Shipping option with ID ${shippingOption.id} do not have a price`
                        )
                    }

                    const methodData = data.validatedMethodData?.find((methodData) => {
                        return methodData?.[option.id]
                    })

                    return {
                        shipping_option_id: shippingOption.id,
                        amount: shippingOption.calculated_price.calculated_amount,
                        is_tax_inclusive:
                            !!shippingOption.calculated_price
                                .is_calculated_price_tax_inclusive,
                        data: methodData?.[option.id] ?? {},
                        name: shippingOption.name,
                        cart_id: data.input.cart_id,
                    }
                })

                return options
            }
        )

        const shippingMethodIdsToRemove = transform({ cart, allShippingOptions, input }, ({ cart, allShippingOptions, input }) => {
            const shippingOptionIdsToAdd = input.options.map((option) => option.id)
            const shippingOptionsMap = new Map(allShippingOptions.data.map(so => [so.id, so]))

            const sellerIdsBeingAdded = new Set<string>(
                shippingOptionIdsToAdd
                    .map(id => shippingOptionsMap.get(id)?.seller?.id)
                    .filter(Boolean) as string[]
            )

            return cart.shipping_methods
                .filter(sm => {
                    const shippingOption = shippingOptionsMap.get(sm.shipping_option_id)
                    return shippingOption && sellerIdsBeingAdded.has(shippingOption.seller?.id)
                })
                .map(sm => sm.id)
        })

        // WOULD MEDUSA DELETE WHAT WE ARE ABOUT TO WRITE? Asked before anything
        // is removed or created, because the answer is otherwise invisible: the
        // refresh below culls a method whose shipping profile no cart item
        // requires, but only once the cart holds more than one — i.e. exactly
        // when a second producer's carriage arrives, and it takes the first
        // producer's with it. See `../utils/shipping-profile-parity`.
        const resultingMethodCount = transform(
            { cart, input, shippingMethodIdsToRemove },
            ({ cart, input, shippingMethodIdsToRemove }) => {
                const removed = new Set(shippingMethodIdsToRemove)
                const surviving = (cart.shipping_methods ?? []).filter(
                    (sm) => !removed.has(sm.id)
                ).length

                return surviving + (input.options ?? []).length
            }
        )

        const optionsBeingAdded = transform(
            { allShippingOptions, input },
            ({ allShippingOptions, input }) => {
                const byId = new Map(
                    (allShippingOptions.data ?? []).map((so) => [so.id, so])
                )

                return (input.options ?? []).map((option) => ({
                    id: option.id,
                    name: byId.get(option.id)?.name ?? "",
                    shipping_profile_id:
                        byId.get(option.id)?.shipping_profile_id ?? null,
                }))
            }
        )

        // ASKED WITH MEDUSA'S OWN QUERY API, not read off the cart above.
        // `refreshCartShippingMethodsWorkflow` reads these two fields through
        // `useQueryGraphStep`; the cart here comes from `useRemoteQueryStep`,
        // which does not resolve the product→shipping_profile link the same way
        // and hands back items with no profile at all. Predicting the cull from
        // a DIFFERENT reading of the same data is how a guard refuses carts
        // Medusa is perfectly happy with — measured, on a two-seller fixture
        // whose products were correctly linked.
        const cartForParity = useQueryGraphStep({
            entity: "cart",
            fields: [
                "items.requires_shipping",
                "items.variant.product.shipping_profile.id",
            ],
            filters: { id: input.cart_id },
            options: { isList: false },
        }).config({ name: "cart-shipping-profile-parity-query" })

        const parityItems = transform({ cartForParity }, ({ cartForParity }) => {
            const data = cartForParity.data as
                | { items?: unknown[] }
                | { items?: unknown[] }[]
                | undefined
            const cart = Array.isArray(data) ? data[0] : data
            return (cart?.items ?? []) as {
                requires_shipping?: boolean | null
            }[]
        })

        validateCartShippingProfileParityStep({
            items: parityItems,
            options: optionsBeingAdded,
            resultingMethodCount,
        })

        const [, createdShippingMethods] = parallelize(
            removeShippingMethodFromCartStep({
                shipping_method_ids: shippingMethodIdsToRemove,
            }),
            addShippingMethodToCartStep({
                shipping_methods: shippingMethodInput,
            })
        )

        refreshCartItemsWorkflow.runAsStep({
            input: {
                cart_id: cart.id,
                shipping_methods: createdShippingMethods,
                additional_data: input.additional_data,
            },
        })

        parallelize(
            emitEventStep({
                eventName: CartWorkflowEvents.UPDATED,
                data: { id: input.cart_id },
            }),
            releaseLockStep({
                key: cart.id,
            })
        )

        return new WorkflowResponse(void 0, {
            hooks: [validate],
        })
    }
)
