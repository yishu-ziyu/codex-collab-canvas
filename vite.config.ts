import fs from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Connect, type Plugin } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(rootDir, 'data')
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

function requireProjectId(value: unknown) {
  if (typeof value !== 'string' || !PROJECT_ID.test(value)) {
    throw new Error('画布记录缺少有效的 projectId')
  }
  return value
}

function projectIdFromUrl(url: string) {
  return requireProjectId(new URL(url, 'http://canvas.local').searchParams.get('projectId'))
}

async function readJsonBody(req: Connect.IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 20 * 1024 * 1024) throw new Error('请求内容超过 20MB')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(value))
}

async function readLatest(name: string, projectId: string) {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, 'projects', projectId, `latest-${name}.json`), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeRecord(kind: 'request' | 'response' | 'approval', body: Record<string, unknown>) {
  const projectId = requireProjectId(body.projectId)
  const plural = `${kind}s`
  const idKey = `${kind}Id`
  const id = String(body[idKey] || `${kind}-${Date.now()}`)
  const record = { ...body, [idKey]: id, savedAt: new Date().toISOString() }

  if (kind === 'request' && typeof record.screenshot === 'string') {
    const match = record.screenshot.match(/^data:image\/jpeg;base64,(.+)$/)
    if (match) {
      const screenshotPath = path.join(dataDir, 'projects', projectId, plural, `${id}.jpeg`)
      await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
      await fs.writeFile(screenshotPath, Buffer.from(match[1], 'base64'))
      record.screenshotPath = screenshotPath
      delete record.screenshot
    }
  }

  const projectDir = path.join(dataDir, 'projects', projectId)
  await fs.mkdir(path.join(projectDir, plural), { recursive: true })
  await fs.writeFile(path.join(projectDir, plural, `${id}.json`), JSON.stringify(record, null, 2))
  await fs.writeFile(path.join(projectDir, `latest-${kind}.json`), JSON.stringify(record, null, 2))
  return record
}

function bridgeMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    if (!req.url?.startsWith('/api/canvas/')) return next()

    try {
      if (req.method === 'GET' && req.url === '/api/canvas/health') {
        return sendJson(res, 200, { ok: true })
      }

      const latestMatch = req.url.match(/^\/api\/canvas\/latest-(request|response|approval)(?:\?.*)?$/)
      if (req.method === 'GET' && latestMatch) {
        return sendJson(res, 200, await readLatest(latestMatch[1], projectIdFromUrl(req.url)))
      }

      const writeMatch = req.url.match(/^\/api\/canvas\/(request|response|approval)$/)
      if (req.method === 'POST' && writeMatch) {
        const record = await writeRecord(
          writeMatch[1] as 'request' | 'response' | 'approval',
          await readJsonBody(req)
        )
        return sendJson(res, 201, record)
      }

      sendJson(res, 404, { error: '未知的画布接口' })
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : '保存失败' })
    }
  }
}

function canvasBridge(): Plugin {
  const middleware = bridgeMiddleware()
  return {
    name: 'codex-canvas-bridge',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [react(), canvasBridge()],
})
