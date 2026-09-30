import { useEffect, useState } from 'react'
import { todayStr } from '../lib/dates'
import { msUntilNextMidnight } from '../lib/clock'

/**
 * 返回"今天"（YYYY-MM-DD），并在本地时间跨零点时自动刷新。
 * 应用长时间挂着过夜时，「今天」页与时间轴不会停留在昨天。
 */
export function useToday(): string {
  const [today, setToday] = useState(todayStr())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const schedule = (): void => {
      // 多等 1 秒，确保已经真正跨过零点
      timer = setTimeout(() => {
        setToday(todayStr())
        schedule()
      }, msUntilNextMidnight(new Date()) + 1000)
    }

    schedule()
    return () => clearTimeout(timer)
  }, [])

  return today
}
