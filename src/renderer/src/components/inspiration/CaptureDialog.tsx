import { useEffect, useRef, useState } from 'react'
import type { CaptureKind } from '@shared/types'
import { ALLOWED_MIMES } from '@shared/imageName'
import { useInspStore } from '../../stores/inspStore'
import { api } from '../../lib/ipc'

const inputCls = 'w-full bg-[var(--bg)] border border-[var(--border)] rounded px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]'

const TABS: { key: CaptureKind; label: string }[] = [
  { key: 'image', label: '贴图' },
  { key: 'text', label: '写文字' },
  { key: 'link', label: '贴链接' }
]

export function CaptureDialog(props: { open: boolean; boardId: number | null; onClose: () => void }): JSX.Element | null {
  const capture = useInspStore((s) => s.capture)
  const storeError = useInspStore((s) => s.error)
  const clearError = useInspStore((s) => s.clearError)

  const [kind, setKind] = useState<CaptureKind>('image')
  const [text, setText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [tagText, setTagText] = useState('')
  const [preview, setPreview] = useState<{ url: string; bytes: Uint8Array; mime: string } | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 每次打开重置
  useEffect(() => {
    if (!props.open) return
    setKind('image'); setText(''); setSourceUrl(''); setTagText('')
    setPreview(null); setLocalError(null); clearError()
  }, [props.open, clearError])

  if (!props.open) return null

  const acceptFile = async (file: File): Promise<void> => {
    setLocalError(null)
    if (!ALLOWED_MIMES.includes(file.type)) {
      setLocalError(`不支持的图片格式：${file.type || '（未知）'}`)
      return
    }
    const buf = await file.arrayBuffer()
    // 只产生预览用的 objectURL，绝不上传给主进程——文件名与路径由主进程自己生成
    setPreview({ url: URL.createObjectURL(file), bytes: new Uint8Array(buf), mime: file.type })
  }

  /** 从剪贴板读图。走主进程，无需授权也不依赖焦点（键盘 Ctrl+V 仍照常可用）。 */
  const pasteFromClipboard = async (): Promise<void> => {
    setLocalError(null)
    const r = await api.insp.readClipboardImage()
    if (!r) {
      setLocalError('剪贴板里没有图片。先复制一张图片（截图工具、浏览器右键复制图片等）再试。')
      return
    }
    const raw = r.bytes instanceof Uint8Array ? r.bytes : new Uint8Array(r.bytes as ArrayBufferLike)
    // 复制成自有缓冲：既满足 BlobPart 的类型要求，也避免继续引用 IPC 传来的缓冲
    const bytes = new Uint8Array(raw.length)
    bytes.set(raw)
    setPreview({ url: URL.createObjectURL(new Blob([bytes], { type: r.mime })), bytes, mime: r.mime })
  }

  /** 粘贴板里的图片（Ctrl+V 快捷键路径） */
  const onPaste = (e: React.ClipboardEvent): void => {
    const item = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'))
    if (!item) return
    const file = item.getAsFile()
    if (file) void acceptFile(file)
  }

  const submit = async (): Promise<void> => {
    setLocalError(null)
    const tags = tagText.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)

    if (kind === 'image' && !preview) {
      setLocalError('请先「选择图片」或「粘贴」一张图片')
      return
    }
    if (kind === 'link' && !/^https?:\/\//i.test(sourceUrl.trim())) {
      setLocalError('链接必须以 http:// 或 https:// 开头')
      return
    }
    if (kind === 'text' && !text.trim()) {
      setLocalError('请先写点什么')
      return
    }

    const ok = await capture({
      kind,
      text: text.trim(),
      sourceUrl: kind === 'link' ? sourceUrl.trim() : undefined,
      tags,
      boardId: props.boardId,
      imageBytes: kind === 'image' ? preview!.bytes : undefined,
      imageMime: kind === 'image' ? preview!.mime : undefined
    })
    if (ok) props.onClose()
  }

  const shownError = localError ?? storeError

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={props.onClose}>
      <div
        className="w-[520px] bg-[var(--card)] border border-[var(--border)] rounded-xl p-4"
        onClick={(e) => e.stopPropagation()}
        onPaste={onPaste}
      >
        <div className="flex items-center gap-1 mb-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setKind(t.key); setLocalError(null) }}
              className={`text-xs px-3 py-1.5 rounded-lg ${
                kind === t.key ? 'text-white' : 'bg-[var(--bg)] text-[var(--muted)] border border-[var(--border)]'
              }`}
              style={kind === t.key ? { background: '#e879c9' } : undefined}
            >{t.label}</button>
          ))}
          <button onClick={props.onClose} className="ml-auto text-[var(--muted)] hover:text-[var(--text)]">✕</button>
        </div>

        {kind === 'image' && (
          <div className="mb-3">
            {preview ? (
              <div className="border border-[var(--border)] rounded-lg p-2">
                <img
                  src={preview.url}
                  alt="预览"
                  className="w-full max-h-44 object-contain bg-[var(--bg)] rounded"
                />
                <div className="mt-1.5 flex items-center gap-2 text-[9px] text-[var(--muted)]">
                  <span>{Math.max(1, Math.round(preview.bytes.length / 1024))} KB · {preview.mime.replace('image/', '').toUpperCase()}</span>
                  <button
                    onClick={() => { setPreview(null); setLocalError(null) }}
                    className="ml-auto text-[var(--accent)]"
                  >重新选择</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  data-capture-action="pick-file"
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const f = e.dataTransfer.files[0]
                    if (f) void acceptFile(f)
                  }}
                  className="h-28 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                >
                  <span className="text-xl">📁</span>
                  <span className="text-xs">选择图片</span>
                  <span className="text-[9px] text-[var(--muted)]">点击选择，也可把文件拖到这里</span>
                </button>

                <button
                  data-capture-action="paste-clipboard"
                  onClick={() => void pasteFromClipboard()}
                  className="h-28 flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border)] hover:border-[var(--accent)] transition-colors"
                >
                  <span className="text-xl">📋</span>
                  <span className="text-xs">粘贴</span>
                  <span className="text-[9px] text-[var(--muted)]">读取剪贴板，或按 Ctrl+V</span>
                </button>
              </div>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void acceptFile(f) }}
            />
            <div className="mt-1 text-[9px] text-[var(--muted)]">支持 PNG / JPEG / GIF / WebP，单张最大 8 MB</div>
          </div>
        )}

        {kind === 'link' && (
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
            className={`${inputCls} mb-3`}
          />
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={kind === 'text' ? '记下这个想法…' : '备注（可选）'}
          rows={kind === 'text' ? 5 : 2}
          className={`${inputCls} resize-y mb-2`}
        />

        <input
          value={tagText}
          onChange={(e) => setTagText(e.target.value)}
          placeholder="标签（空格或逗号分隔）"
          className={`${inputCls} mb-3`}
        />

        {shownError && (
          <div className="mb-2 text-[10px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1">
            {shownError}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={props.onClose} className="text-xs px-3 py-1.5 rounded bg-[var(--border)]">取消</button>
          <button
            onClick={() => void submit()}
            className="text-xs px-4 py-1.5 rounded text-white"
            style={{ background: '#e879c9' }}
          >保存</button>
        </div>
      </div>
    </div>
  )
}
