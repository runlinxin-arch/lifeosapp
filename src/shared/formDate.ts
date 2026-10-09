/**
 * 表单默认日期的跨零点跟随规则。
 *
 * 场景：应用长期挂着过夜，第二天在「游玩记录」「影视」「书籍」等表单里录入时，
 * 默认日期若停在昨天，记录就会落到错误的日期上。
 * 规则：**用户手动选过日期就不再自动覆盖**，否则跟随「今天」。
 */
export function shouldFollowToday(opts: { touched: boolean; current: string; today: string }): boolean {
  return !opts.touched && opts.current !== opts.today
}
