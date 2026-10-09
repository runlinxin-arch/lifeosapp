// 把 Markdown 文件推送到 Notion（创建一页，正文按块写入）
//
// 用法：
//   $env:NOTION_TOKEN = "ntn_xxx"                 # Notion integration token
//   $env:NOTION_PARENT_PAGE_ID = "xxxxxxxxxxxx"    # 目标父页面 ID（需把 integration 连到该页）
//   node scripts/notion/notion-archive.mjs docs/archive/2026-10-09-开发任务存档.md
//
// 可选环境变量：
//   NOTION_TITLE              页面标题（默认取 Markdown 的一级标题，再退回文件名）
//   NOTION_VERSION            API 版本（默认 2022-06-28）
// 可选参数：
//   --dry-run                 只做 Markdown → blocks 转换并打印统计，不调用 API
//
// 说明：本脚本只读取 Markdown 与两个环境变量，token 不落盘、不写进仓库。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28'
const API = 'https://api.notion.com/v1'
const MAX_BLOCKS_PER_REQUEST = 100
const MAX_TEXT_LEN = 2000

// ---------------------------------------------------------------- inline 富文本

/** Markdown 行内语法 → Notion rich_text[]（支持 **粗体**、`行内代码`、[链接](url)） */
export function inlineToRichText(text) {
  const out = []
  const push = (content, annotations = {}, link = null) => {
    if (!content) return
    // 超长文本按 Notion 上限切分
    for (let i = 0; i < content.length; i += MAX_TEXT_LEN) {
      const chunk = content.slice(i, i + MAX_TEXT_LEN)
      const item = { type: 'text', text: { content: chunk }, annotations }
      if (link) item.text.link = { url: link }
      out.push(item)
    }
  }

  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  for (const m of text.matchAll(pattern)) {
    push(text.slice(last, m.index), {})
    const token = m[0]
    if (token.startsWith('**')) push(token.slice(2, -2), { bold: true })
    else if (token.startsWith('`')) push(token.slice(1, -1), { code: true })
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token)
      push(mm[1], {}, mm[2])
    }
    last = m.index + token.length
  }
  push(text.slice(last), {})
  return out.length ? out : [{ type: 'text', text: { content: '' } }]
}

// ---------------------------------------------------------------- 块级转换

const textBlock = (type, text) => ({ object: 'block', type, [type]: { rich_text: inlineToRichText(text) } })

/** 单元格：Notion 表格单元格是 rich_text 数组 */
export const tableRow = (cells) => ({
  object: 'block',
  type: 'table_row',
  table_row: { cells: cells.map((c) => inlineToRichText(c)) }
})

/** Markdown → Notion blocks（导出以便单测） */
export function markdownToBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  let i = 0

  const isTableRow = (s) => /^\s*\|.*\|\s*$/.test(s)
  const isSeparatorRow = (s) => /^\s*\|[\s:|-]+\|\s*$/.test(s)
  const splitRow = (s) => s.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // 代码块
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || 'plain text'
      const buf = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++ }
      i++ // 跳过结束围栏
      const code = buf.join('\n').slice(0, MAX_TEXT_LEN * 5)
      blocks.push({
        object: 'block',
        type: 'code',
        code: { rich_text: inlineToRichText(code), language: lang }
      })
      continue
    }

    // 表格
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      const header = splitRow(line)
      const rows = []
      i += 2
      while (i < lines.length && isTableRow(lines[i])) { rows.push(splitRow(lines[i])); i++ }
      blocks.push({
        object: 'block',
        type: 'table',
        table: {
          table_width: header.length,
          has_column_header: true,
          has_row_header: false,
          children: [tableRow(header), ...rows.map(tableRow)]
        }
      })
      continue
    }

    if (!trimmed) { i++; continue }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ object: 'block', type: 'divider', divider: {} })
      i++
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const type = `heading_${heading[1].length}`
      blocks.push(textBlock(type, heading[2].trim()))
      i++
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { buf.push(lines[i].trim().replace(/^>\s?/, '')); i++ }
      blocks.push(textBlock('quote', buf.join(' ')))
      continue
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed)
    if (bullet) {
      blocks.push(textBlock('bulleted_list_item', bullet[1]))
      i++
      continue
    }

    const num = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (num) {
      blocks.push(textBlock('numbered_list_item', num[1]))
      i++
      continue
    }

    blocks.push(textBlock('paragraph', trimmed))
    i++
  }
  return blocks
}

// ---------------------------------------------------------------- 统计（供 dry-run / 单测）

export function summarizeBlocks(blocks) {
  const counts = {}
  for (const b of blocks) counts[b.type] = (counts[b.type] ?? 0) + 1
  const tables = blocks.filter((b) => b.type === 'table')
  return {
    total: blocks.length,
    byType: counts,
    tableRows: tables.reduce((n, t) => n + t.table.children.length, 0)
  }
}

// ---------------------------------------------------------------- Notion API

async function notionFetch(endpoint, payload) {
  const res = await fetch(`${API}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = body?.message || res.statusText
    throw new Error(`Notion API ${res.status} ${body?.code ?? ''}: ${msg}`)
  }
  return body
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, k * n + n))

// ---------------------------------------------------------------- main

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const file = args.find((a) => !a.startsWith('--'))
  if (!file) {
    console.error('用法: node scripts/notion/notion-archive.mjs <markdown 文件> [--dry-run]')
    process.exit(2)
  }
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) { console.error(`文件不存在: ${abs}`); process.exit(2) }

  const markdown = fs.readFileSync(abs, 'utf8')
  const blocks = markdownToBlocks(markdown)
  const stats = summarizeBlocks(blocks)
  const h1 = /^#\s+(.+)$/m.exec(markdown)
  const title = process.env.NOTION_TITLE || (h1 ? h1[1].trim() : path.basename(abs, '.md'))

  console.log(`源文件: ${abs}`)
  console.log(`标题  : ${title}`)
  console.log(`块统计: 共 ${stats.total} 块（含表格行 ${stats.tableRows}）`)
  console.log(`类型  : ${Object.entries(stats.byType).map(([k, v]) => `${k}×${v}`).join(', ')}`)

  if (dryRun) { console.log('--dry-run：未调用 Notion API'); return }

  if (!process.env.NOTION_TOKEN) { console.error('缺少 NOTION_TOKEN'); process.exit(2) }
  if (!process.env.NOTION_PARENT_PAGE_ID) { console.error('缺少 NOTION_PARENT_PAGE_ID'); process.exit(2) }

  const [first, ...rest] = chunk(blocks, MAX_BLOCKS_PER_REQUEST)
  const page = await notionFetch('/pages', {
    parent: { page_id: process.env.NOTION_PARENT_PAGE_ID },
    properties: { title: { title: [{ type: 'text', text: { content: title } }] } },
    children: first
  })
  console.log(`已创建页面: ${page.url ?? page.id}`)

  let written = first.length
  for (const part of rest) {
    await new Promise((r) => setTimeout(r, 400)) // 温和限速
    await notionFetch(`/blocks/${page.id}/children`, { children: part })
    written += part.length
    console.log(`已追加 ${written}/${blocks.length} 块`)
  }
  console.log(`完成：${written} 个块写入 ${page.url ?? page.id}`)
}

// 只有被直接执行时才跑 main()；被测试 import 时保持纯函数可用
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main().catch((e) => { console.error('推送失败:', e.message); process.exit(1) })
}
