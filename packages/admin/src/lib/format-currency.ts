import { formatTomanAmount, isTomanCurrency } from "@mercurjs/dashboard-shared"

export const formatCurrency = (amount: number, currency: string) => {
  if (isTomanCurrency(currency)) {
    return formatTomanAmount(amount)
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    signDisplay: "auto",
  }).format(amount)
}
