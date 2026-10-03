import Module from "module"
import { dirname, join } from "path"

import { applyMercurPatches } from "../index"

// Under Jest the patch arrives through `jest-transformer`; the runtime path —
// evict the already-loaded file, require it again through Node's loader hook —
// cannot compile patched source there, because Jest never consults that hook.
// What the eviction DID do under Jest was re-evaluate the file and the modules
// it requires, registering second instances of their workflows. Every hook
// handler bound to the first instance was lost: a host's
// `listShippingOptionsForCartWithPricingWorkflow.hooks.setShippingOptionsContext`
// stopped running, and its quote carriage was refused as "Shipping Options are
// invalid for cart".
describe("applyMercurPatches under Jest", () => {
    it("does not re-register workflows a project already loaded", () => {
        const coreFlowsEntry = require.resolve("@medusajs/core-flows")
        const requireFromCoreFlows = Module.createRequire(coreFlowsEntry)

        // Load the patched file (and with it the workflows it composes) the
        // way @medusajs/test-utils does, before any config runs.
        require(
            join(
                dirname(coreFlowsEntry),
                "cart/workflows/refresh-cart-shipping-methods.js"
            )
        )

        const { WorkflowManager } = require(
            requireFromCoreFlows.resolve("@medusajs/orchestration")
        ) as { WorkflowManager: { register: (...args: unknown[]) => unknown } }

        const register = jest.spyOn(WorkflowManager, "register")

        applyMercurPatches({ logger: { info: () => {}, warn: () => {} } })

        const reRegistered = register.mock.calls
            .map(([id]) => id)
            .filter((id) =>
                [
                    "refresh-cart-shipping-methods",
                    "list-shipping-options-for-cart-with-pricing",
                ].includes(id as string)
            )

        expect(reRegistered).toEqual([])
    })
})
