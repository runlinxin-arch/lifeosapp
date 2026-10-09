import path from 'node:path'
import { openDb } from './src/main/db'
import { setSetting } from './src/main/db/settings'
import { createTask } from './src/main/db/tasks'
import { createEvent } from './src/main/db/events'
import { createLongTask, setLongTaskDone } from './src/main/db/longTasks'
import { addDays, formatLocal, todayStr } from './src/shared/dates'

const db = openDb(path.join(process.env.APPDATA as string, 'LifeOS', 'app.db'))

// 1) 清掉上一轮（可能已过期）的演示数据
const d1 = db.prepare("DELETE FROM tasks WHERE title LIKE '【演示】%' OR title LIKE '【验收】%'").run()
const d2 = db.prepare("DELETE FROM events WHERE title LIKE '【演示】%' OR title LIKE '【验收】%'").run()
const d3 = db.prepare("DELETE FROM long_tasks WHERE title LIKE '【演示】%' OR title LIKE '【验收】%'").run()
console.log(`清理旧演示数据: tasks=${d1.changes} events=${d2.changes} long_tasks=${d3.changes}`)

// 2) 按"今天"重新生成（全部相对日期，不再依赖固定日期）
const today = todayStr()

const t1 = createTask(db, { title: '【演示】写周报', priority: 'high', date: today })
createTask(db, { title: '【演示】预约牙医', priority: 'low', date: today })
const t3 = createTask(db, { title: '【演示】已完成示例', priority: 'mid', date: today })
db.prepare("UPDATE tasks SET done = 1, done_at = datetime('now','localtime') WHERE id = ?").run(t3.id)

createEvent(db, {
  title: '【演示】全天：家庭日', startAt: `${today} 00:00`, endAt: `${today} 00:00`,
  allDay: true, location: '家', note: '全天事件应显示为通栏色条'
})
createEvent(db, { title: '【演示】需求评审', startAt: `${today} 10:00`, endAt: `${today} 11:30`, location: '会议室', note: '与下一个事件重叠，应并排分道' })
createEvent(db, { title: '【演示】方案讨论', startAt: `${today} 10:30`, endAt: `${today} 12:00` })
createEvent(db, {
  title: '【演示】每周站会', startAt: `${today} 09:00`, endAt: `${today} 09:30`,
  repeatType: 'weekly', repeatInterval: 1, repeatUntil: addDays(today, 60)
})

const soon = new Date(Date.now() + 6 * 60 * 1000)
createEvent(db, {
  title: '【演示】提醒测试（应弹系统通知）',
  startAt: formatLocal(soon), endAt: formatLocal(new Date(soon.getTime() + 30 * 60 * 1000)),
  remindMinutes: 15
})

createLongTask(db, { title: '【演示】备考雅思', startDate: addDays(today, -2), endDate: addDays(today, 40) })
createLongTask(db, { title: '【演示】App 改版', startDate: today, endDate: addDays(today, 25) })
const done = createLongTask(db, { title: '【演示】已完成示例', startDate: today, endDate: addDays(today, 10) })
setLongTaskDone(db, done.id, true)

setSetting(db, 'timeline.rangeDays', 30)
setSetting(db, 'timeline.showDone', false)
setSetting(db, 'remind.enabled', true)

console.log(`重新生成（基准日 ${today}）:`)
console.log('  待办    ', db.prepare("SELECT COUNT(*) c FROM tasks WHERE title LIKE '【演示】%'").get())
console.log('  事件    ', db.prepare("SELECT COUNT(*) c FROM events WHERE title LIKE '【演示】%'").get())
console.log('  长期任务', db.prepare("SELECT COUNT(*) c FROM long_tasks WHERE title LIKE '【演示】%'").get())
console.log('  提醒事件开始于', formatLocal(soon), '（当前', formatLocal(new Date()), '）')
db.close()
