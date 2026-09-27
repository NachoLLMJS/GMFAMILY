import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const ignored = readFileSync('.vercelignore', 'utf8').split(/\r?\n/).map((line: string) => line.trim())

describe('Vercel deployment boundary', () => {
  it('keeps runtime manifests and server data available to the build', () => {
    expect(ignored).not.toContain('package.json')
    expect(ignored).not.toContain('package-lock.json')
    expect(ignored).not.toContain('server.mjs')
    expect(ignored).not.toContain('data/')
    expect(ignored).not.toContain('api/')
  })
})
