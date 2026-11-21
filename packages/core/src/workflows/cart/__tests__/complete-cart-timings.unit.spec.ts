import {
  completeCartWithSplitOrdersWorkflow,
  THIRTY_SECONDS,
  TWO_MINUTES,
} from "../workflows/complete-cart-with-split-orders"

// The engine and `acquireLockStep` read these as SECONDS. Written in
// milliseconds, a stored cart completion was kept for 8 years, a second
// completion waited 8 hours for the lock, and a crashed one held it 33 hours.
describe("complete-cart-with-split-orders", () => {
  it("keeps its stored executions for three days", () => {
    const { WorkflowManager } = require("@medusajs/framework/orchestration")
    const { options } = WorkflowManager.getWorkflow(
      completeCartWithSplitOrdersWorkflow.getName()
    )
    expect(options.retentionTime).toBe(3 * 24 * 60 * 60)
  })

  it("waits 30 seconds for the cart lock and holds it 2 minutes", () => {
    expect(THIRTY_SECONDS).toBe(30)
    expect(TWO_MINUTES).toBe(120)
  })
})
