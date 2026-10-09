import { describe, it, expect } from 'vitest'
import { minutesByProjectInRange, minutesByTask, projectWeekMinutes } from '../src/shared/devStats'
import type { DevSession, DevTask } from '../src/shared/types'

const task = (id: number, projectId: number): DevTask => ({
  id, project_id: projectId, title: `T${id}`, column_name: 'todo', position: 0,
  priority: 'mid', start_date: null, due_date: null, created_at: '', updated_at: ''
})

const ses = (taskId: number, startedAt: string, minutes: number): DevSession => ({
  id: taskId * 100 + minutes, task_id: taskId, started_at: startedAt, ended_at: startedAt, minutes, created_at: ''
})

const tasks = [task(1, 10), task(2, 10), task(3, 20)]

describe('minutesByProjectInRange', () => {
  it('按项目汇总区间内的时长（含端点）', () => {
    const sessions = [
      ses(1, '2026-10-05 09:00', 30),
      ses(2, '2026-10-09 09:00', 45),
      ses(3, '2026-10-07 09:00', 60)
    ]
    const m = minutesByProjectInRange(sessions, tasks, '2026-10-05', '2026-10-11')
    expect(m.get(10)).toBe(75)
    expect(m.get(20)).toBe(60)
  })

  it('区间外的不计入', () => {
    const sessions = [ses(1, '2026-10-04 09:00', 99), ses(1, '2026-10-12 09:00', 99)]
    const m = minutesByProjectInRange(sessions, tasks, '2026-10-05', '2026-10-11')
    expect(m.get(10)).toBeUndefined()
  })

  it('同一天只按日期比较，忽略具体时刻', () => {
    const sessions = [ses(1, '2026-10-11 23:59', 10), ses(1, '2026-10-05 00:00', 20)]
    expect(minutesByProjectInRange(sessions, tasks, '2026-10-05', '2026-10-11').get(10)).toBe(30)
  })

  it('任务不存在时该条记录被忽略（不抛错）', () => {
    const sessions = [ses(999, '2026-10-09 09:00', 50)]
    expect(minutesByProjectInRange(sessions, tasks, '2026-10-05', '2026-10-11').size).toBe(0)
  })

  it('空输入返回空 Map', () => {
    expect(minutesByProjectInRange([], tasks, '2026-10-05', '2026-10-11').size).toBe(0)
  })
})

describe('projectWeekMinutes', () => {
  it('只统计指定项目的本周时长', () => {
    const sessions = [
      ses(1, '2026-10-05 09:00', 30),
      ses(2, '2026-10-09 09:00', 45),
      ses(3, '2026-10-07 09:00', 60)
    ]
    expect(projectWeekMinutes(sessions, tasks, 10, '2026-10-05', '2026-10-11')).toBe(75)
    expect(projectWeekMinutes(sessions, tasks, 20, '2026-10-05', '2026-10-11')).toBe(60)
  })

  it('无记录的项目返回 0', () => {
    expect(projectWeekMinutes([], tasks, 10, '2026-10-05', '2026-10-11')).toBe(0)
  })
})

describe('minutesByTask', () => {
  it('同一任务多条累加', () => {
    const m = minutesByTask([ses(1, '2026-10-09 09:00', 30), ses(1, '2026-10-09 10:00', 45), ses(2, '2026-10-09 11:00', 60)])
    expect(m.get(1)).toBe(75)
    expect(m.get(2)).toBe(60)
  })

  it('没有记录的任务不出现在 Map 里', () => {
    expect(minutesByTask([ses(1, '2026-10-09 09:00', 30)]).get(2)).toBeUndefined()
  })

  it('空输入返回空 Map', () => {
    expect(minutesByTask([]).size).toBe(0)
  })
})
