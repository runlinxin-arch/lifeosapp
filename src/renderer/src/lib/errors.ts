/**
 * IPC 错误归一化：主进程抛出的异常经 ipcRenderer 传回渲染端时会被包装，
 * 这里统一剥壳，产出可以直接展示给用户的一句话。
 * 纯函数，不依赖 window，便于单测。
 */
export const FALLBACK_MESSAGE = '操作失败，请重试'

const REMOTE_WRAPPER_RE = /Error invoking remote method '[^']*':\s*([\s\S]*)$/

function extractRaw(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message
    if (typeof msg === 'string') return msg
  }
  return ''
}

export function formatIpcError(err: unknown): string {
  const raw = extractRaw(err)
  if (!raw.trim()) return FALLBACK_MESSAGE
  const wrapped = raw.match(REMOTE_WRAPPER_RE)
  const body = (wrapped ? wrapped[1] : raw).replace(/^Error:\s*/, '').trim()
  return body || FALLBACK_MESSAGE
}
