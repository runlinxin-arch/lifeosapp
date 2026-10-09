// Notion 推送脚本的 Markdown → blocks 转换测试
// （脚本是 .mjs，直接 import 真实实现，避免测试与实现两份逻辑）
import { describe, it, expect } from 'vitest'
import { inlineToRichText, tableRow, markdownToBlocks, summarizeBlocks } from '../scripts/notion/notion-archive.mjs'

const types = (md) => markdownToBlocks(md).map((b) => b.type)

describe('inlineToRichText', () => {
  it('纯文本 → 单个 text 节点', () => {
    const rt = inlineToRichText('普通文字')
    expect(rt).toHaveLength(1)
    expect(rt[0].text.content).toBe('普通文字')
    expect(rt[0].annotations).toEqual({})
  })

  it('粗体 / 行内代码 / 链接 分段解析', () => {
    const rt = inlineToRichText('前 **粗** 中 `码` 后 [站点](https://example.com)')
    expect(rt.map((r) => r.text.content)).toEqual(['前 ', '粗', ' 中 ', '码', ' 后 ', '站点'])
    expect(rt[1].annotations).toEqual({ bold: true })
    expect(rt[3].annotations).toEqual({ code: true })
    expect(rt[5].text.link).toEqual({ url: 'https://example.com' })
  })

  it('空串仍返回一个空 text（Notion 不接受空数组）', () => {
    expect(inlineToRichText('')).toEqual([{ type: 'text', text: { content: '' } }])
  })
})

describe('markdownToBlocks', () => {
  it('标题 1–3 级映射正确', () => {
    expect(types('# A\n## B\n### C')).toEqual(['heading_1', 'heading_2', 'heading_3'])
  })

  it('列表 / 引用 / 分隔线', () => {
    expect(types('- 一\n- 二\n1. 三\n> 引用\n---')).toEqual([
      'bulleted_list_item', 'bulleted_list_item', 'numbered_list_item', 'quote', 'divider'
    ])
  })

  it('代码块保留语言与内容', () => {
    const [b] = markdownToBlocks('```powershell\nnpm test\n```')
    expect(b.type).toBe('code')
    expect(b.code.language).toBe('powershell')
    expect(b.code.rich_text[0].text.content).toBe('npm test')
  })

  it('表格转成 table + table_row，列数与表头正确', () => {
    const md = ['| A | B |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |'].join('\n')
    const blocks = markdownToBlocks(md)
    expect(blocks).toHaveLength(1)
    const t = blocks[0]
    expect(t.type).toBe('table')
    expect(t.table.table_width).toBe(2)
    expect(t.table.has_column_header).toBe(true)
    expect(t.table.children).toHaveLength(3)
    expect(t.table.children[0].table_row.cells[0][0].text.content).toBe('A')
    expect(t.table.children[2].table_row.cells[1][0].text.content).toBe('4')
  })

  it('表格内联格式也生效（表头加粗）', () => {
    const md = ['| **里程碑** | 结果 |', '|---|---|', '| M4-1 | 22/22 |'].join('\n')
    const cells = markdownToBlocks(md)[0].table.children[0].table_row.cells
    expect(cells[0][0].annotations).toEqual({ bold: true })
  })

  it('真实存档文件能整体转换且统计合理', async () => {
    const fs = await import('node:fs')
    const md = fs.readFileSync('docs/archive/2026-10-09-开发任务存档.md', 'utf8')
    const stats = summarizeBlocks(markdownToBlocks(md))
    expect(stats.total).toBeGreaterThan(50)
    expect(stats.byType.table).toBeGreaterThanOrEqual(3)   // 总览 / 指标 / 隐患审计
    expect(stats.tableRows).toBeGreaterThanOrEqual(20)
    expect(stats.byType.code).toBeGreaterThanOrEqual(1)
    expect(stats.byType.heading_2).toBeGreaterThanOrEqual(5)
    // 分片推送前确认块数在合理范围（Notion 每请求上限 100 块）
    expect(stats.total).toBeLessThan(1000)
  })
})

describe('tableRow', () => {
  it('每个单元格都是 rich_text 数组', () => {
    const row = tableRow(['a', 'b'])
    expect(row.table_row.cells).toHaveLength(2)
    expect(row.table_row.cells[0][0].type).toBe('text')
  })
})
