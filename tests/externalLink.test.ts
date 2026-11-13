import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isInternalNavigation, isSafeExternalUrl } from '../src/main/externalLink'

describe('isSafeExternalUrl', () => {
  it('放行 https / http / mailto', () => {
    expect(isSafeExternalUrl('https://example.com/a?b=1')).toBe(true)
    expect(isSafeExternalUrl('http://127.0.0.1:4317/')).toBe(true)
    expect(isSafeExternalUrl('mailto:someone@example.com')).toBe(true)
  })

  it('拦下会交给系统的危险协议', () => {
    for (const url of [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'smb://attacker/share',
      'vbscript:msgbox(1)',
      'chrome://settings',
      'lifeos-image://3f2504e0-4f89-41d3-9a0c-0305e82c3301.png'
    ]) {
      expect(isSafeExternalUrl(url), url).toBe(false)
    }
  })

  it('非法 URL 与没有主机名的 http(s) 地址不放行', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false)
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl('https://')).toBe(false)
    expect(isSafeExternalUrl('http://')).toBe(false)
    expect(isSafeExternalUrl('http://:4317')).toBe(false)
    expect(isSafeExternalUrl('http://@')).toBe(false)
  })
})

describe('isInternalNavigation', () => {
  const rendererDir = '/opt/LifeOS/out/renderer'
  const prod = { rendererDir }

  it('生产环境只认 renderer 目录下的 file://', () => {
    expect(isInternalNavigation(pathToFileURL(path.join(rendererDir, 'index.html')).href, prod)).toBe(true)
    expect(isInternalNavigation(pathToFileURL(path.join(rendererDir, 'index.html')).href + '#/today', prod)).toBe(true)
    expect(isInternalNavigation(pathToFileURL(path.join(rendererDir, 'assets/app.js')).href, prod)).toBe(true)
  })

  it('renderer 目录外的 file:// 与其他协议一律不算应用内', () => {
    expect(isInternalNavigation('file:///etc/passwd', prod)).toBe(false)
    expect(isInternalNavigation('file:///opt/LifeOS/out/renderer-evil/x.html', prod)).toBe(false)
    // URL 会先归一化 ..，归一化后落在 renderer 之外
    expect(isInternalNavigation('file:///opt/LifeOS/out/renderer/../../etc/passwd', prod)).toBe(false)
    expect(isInternalNavigation('https://example.com/', prod)).toBe(false)
    expect(isInternalNavigation('lifeos-image://x.png', prod)).toBe(false)
    expect(isInternalNavigation('not a url', prod)).toBe(false)
  })

  it('开发环境额外认 dev server 的同源地址', () => {
    const dev = { rendererDir, devUrl: 'http://localhost:5173' }
    expect(isInternalNavigation('http://localhost:5173/', dev)).toBe(true)
    expect(isInternalNavigation('http://localhost:5173/src/main.tsx?t=1', dev)).toBe(true)
    expect(isInternalNavigation('http://localhost:5173.evil.example/', dev)).toBe(false)
    expect(isInternalNavigation('http://evil.example/', dev)).toBe(false)
    expect(isInternalNavigation('https://localhost:5173/', dev)).toBe(false)
  })

  it('没有 devUrl 时，任何 http(s) 地址都不算应用内', () => {
    expect(isInternalNavigation('http://localhost:5173/', prod)).toBe(false)
  })
})
