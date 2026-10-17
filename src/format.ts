export const formatMoney = (cents: number, compact = false) => {
  const value = cents / 100
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
    notation: compact && Math.abs(value) >= 10000 ? 'compact' : 'standard'
  }).format(value)
}

export const formatDate = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`)
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(parsed)
}

export const monthLabel = (month: string) => {
  const [year, value] = month.split('-')
  return `${year} 年 ${Number(value)} 月`
}
