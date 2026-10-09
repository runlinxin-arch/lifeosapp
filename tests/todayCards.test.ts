import { describe, it, expect } from 'vitest'
import { activeProjects, pickTodayLearnItems } from '../src/shared/todayCards'
import type { LearnItem, LearnStatus, Project, ProjectStatus } from '../src/shared/types'

const item = (id: number, status: LearnStatus): LearnItem => ({
  id, title: `L${id}`, type: 'book', status, total_units: 10, done_units: 0,
  start_date: null, end_date: null, created_at: '', updated_at: ''
})

const project = (id: number, status: ProjectStatus): Project => ({
  id, name: `P${id}`, status, description: '', start_date: null, end_date: null,
  created_at: '', updated_at: ''
})

describe('pickTodayLearnItems', () => {
  it('学习中排最前', () => {
    const list = [item(1, 'not_started'), item(2, 'learning'), item(3, 'done')]
    expect(pickTodayLearnItems(list).map((i) => i.id)).toEqual([2, 1, 3])
  })

  it('同级按 id 升序', () => {
    const list = [item(5, 'learning'), item(2, 'learning'), item(9, 'learning')]
    expect(pickTodayLearnItems(list).map((i) => i.id)).toEqual([2, 5, 9])
  })

  it('默认最多 3 条', () => {
    const list = [item(1, 'learning'), item(2, 'learning'), item(3, 'learning'), item(4, 'learning')]
    expect(pickTodayLearnItems(list)).toHaveLength(3)
  })

  it('可指定条数', () => {
    const list = [item(1, 'learning'), item(2, 'learning'), item(3, 'learning')]
    expect(pickTodayLearnItems(list, 2).map((i) => i.id)).toEqual([1, 2])
  })

  it('limit 为 0 返回空', () => {
    expect(pickTodayLearnItems([item(1, 'learning')], 0)).toEqual([])
  })

  it('负数 limit 返回空', () => {
    expect(pickTodayLearnItems([item(1, 'learning')], -3)).toEqual([])
  })

  it('空列表返回空', () => {
    expect(pickTodayLearnItems([])).toEqual([])
  })

  it('不修改入参', () => {
    const list = [item(1, 'done'), item(2, 'learning')]
    const copy = JSON.parse(JSON.stringify(list))
    pickTodayLearnItems(list)
    expect(list).toEqual(copy)
  })

  it('全部已完成时仍然显示（不会因为排序丢内容）', () => {
    expect(pickTodayLearnItems([item(1, 'done'), item(2, 'done')]).map((i) => i.id)).toEqual([1, 2])
  })
})

describe('activeProjects', () => {
  it('只保留进行中的项目', () => {
    const list = [project(1, 'planned'), project(2, 'in_progress'), project(3, 'done'), project(4, 'paused')]
    expect(activeProjects(list).map((p) => p.id)).toEqual([2])
  })

  it('保持原顺序', () => {
    const list = [project(3, 'in_progress'), project(1, 'in_progress'), project(2, 'in_progress')]
    expect(activeProjects(list).map((p) => p.id)).toEqual([3, 1, 2])
  })

  it('没有进行中的项目返回空', () => {
    expect(activeProjects([project(1, 'planned')])).toEqual([])
  })
})
