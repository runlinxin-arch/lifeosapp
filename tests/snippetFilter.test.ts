import { describe, it, expect } from 'vitest'
import { filterSnippets, parseTags } from '../src/shared/snippetFilter'
import type { Snippet } from '../src/shared/types'

const sn = (id: number, title: string, code = '', language = '', tags: string[] = []): Snippet => ({
  id, title, code, language, tags, created_at: '', updated_at: ''
})

const list = [
  sn(1, '防抖函数', 'const debounce = (fn, ms) => {}', 'typescript', ['工具', '性能']),
  sn(2, 'SQL 分页', 'SELECT * FROM t LIMIT 10', 'sql', ['数据库']),
  sn(3, '防抖（JS）', 'function debounce() {}', 'javascript', ['工具'])
]

describe('parseTags', () => {
  it('解析 JSON 数组', () => {
    expect(parseTags('["a","b"]')).toEqual(['a', 'b'])
  })
  it('坏数据回退空数组', () => {
    expect(parseTags('not-json')).toEqual([])
    expect(parseTags('{"a":1}')).toEqual([])
    expect(parseTags('')).toEqual([])
    expect(parseTags('null')).toEqual([])
  })
  it('过滤非字符串项', () => {
    expect(parseTags('["a",1,null,"b"]')).toEqual(['a', 'b'])
  })
})

describe('filterSnippets', () => {
  it('无条件返回全部', () => {
    expect(filterSnippets(list, {})).toHaveLength(3)
  })

  it('关键词匹配标题（不区分大小写）', () => {
    expect(filterSnippets(list, { keyword: 'SQL' }).map((s) => s.id)).toEqual([2])
    expect(filterSnippets(list, { keyword: 'sql' }).map((s) => s.id)).toEqual([2])
  })

  it('关键词匹配代码', () => {
    expect(filterSnippets(list, { keyword: 'debounce' }).map((s) => s.id)).toEqual([1, 3])
  })

  it('关键词匹配语言', () => {
    expect(filterSnippets(list, { keyword: 'typescript' }).map((s) => s.id)).toEqual([1])
  })

  it('标签筛选为全部命中（AND）', () => {
    expect(filterSnippets(list, { tags: ['工具'] }).map((s) => s.id)).toEqual([1, 3])
    expect(filterSnippets(list, { tags: ['工具', '性能'] }).map((s) => s.id)).toEqual([1])
    expect(filterSnippets(list, { tags: ['工具', '数据库'] })).toEqual([])
  })

  it('关键词与标签取交集', () => {
    expect(filterSnippets(list, { keyword: 'debounce', tags: ['工具'] }).map((s) => s.id)).toEqual([1, 3])
    expect(filterSnippets(list, { keyword: 'debounce', tags: ['数据库'] })).toEqual([])
  })

  it('空白关键词视为无条件', () => {
    expect(filterSnippets(list, { keyword: '   ' })).toHaveLength(3)
  })

  it('空标签数组视为无条件', () => {
    expect(filterSnippets(list, { tags: [] })).toHaveLength(3)
  })

  it('无命中返回空数组', () => {
    expect(filterSnippets(list, { keyword: '不存在的关键词' })).toEqual([])
  })

  it('不修改入参数组', () => {
    const copy = JSON.parse(JSON.stringify(list))
    filterSnippets(list, { keyword: 'debounce' })
    expect(list).toEqual(copy)
  })
})
