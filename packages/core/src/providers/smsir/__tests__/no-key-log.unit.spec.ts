import { SmsIrClient } from "../client"

// Without an API key the client prints what it would have sent. For a login
// code that line is a working credential for whoever reads a production log.
describe("SmsIrClient.sendVerify without an API key", () => {
  const env = process.env.NODE_ENV
  let warn: jest.SpyInstance

  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    process.env.NODE_ENV = env
    warn.mockRestore()
  })

  const send = () =>
    new SmsIrClient({ apiKey: "" }).sendVerify("09121234567", 100, [
      { name: "CODE", value: "48213" },
    ])

  it("never prints the parameters in production", async () => {
    process.env.NODE_ENV = "production"

    expect(await send()).toEqual({ status: "skipped" })

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).not.toContain("48213")
  })

  it("still prints them for a developer", async () => {
    process.env.NODE_ENV = "development"

    await send()

    expect(String(warn.mock.calls[0][0])).toContain("48213")
  })
})
