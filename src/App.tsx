import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AssetRecordType,
  createShapeId,
  Editor,
  Tldraw,
  toRichText,
  type TLShape,
} from 'tldraw'
import type { CanvasRequest, CanvasResponse, ProposalBlock } from './types'

const POLL_INTERVAL = 1600
const PROJECTS = [
  { id: 'yishu', label: '奕枢', canvasVersion: 'v4' },
  {
    id: 'econpaper',
    label: '经济学论文 / econpaper',
    canvasVersion: 'v6',
    seed: {
      src: '/screenshots/econpaper-scene-2-intent-preserved.png',
      altText: 'econpaper 当前真实产品页面',
      sourceW: 1600,
      sourceH: 900,
    },
  },
] as const
const DEFAULT_PROJECT_ID = 'yishu'
const COMPOSER_WIDTH = 360
const COMPOSER_HEIGHT = 158
const VIEWPORT_GUTTER = 12

type ViewMode = 'current' | 'proposal'
type SelectionAnchor = {
  left: number
  top: number
  side: 'left' | 'right' | 'below'
}

function initialProjectId() {
  const requested = new URLSearchParams(window.location.search).get('project')
  return PROJECTS.some((project) => project.id === requested) ? requested! : DEFAULT_PROJECT_ID
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getBounds(editor: Editor) {
  const bounds = editor.getSelectionPageBounds()
  if (!bounds) return null
  return {
    x: bounds.x,
    y: bounds.y,
    w: bounds.width,
    h: bounds.height,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
  }
}

function overlaps(a: ReturnType<typeof getBounds>, b: ReturnType<typeof getBounds>) {
  if (!a || !b) return false
  return a.x <= b.maxX && a.maxX >= b.x && a.y <= b.maxY && a.maxY >= b.y
}

function getCaptureShapes(editor: Editor, selectedShapes: TLShape[]) {
  const selectionBounds = getBounds(editor)
  if (!selectionBounds) return selectedShapes

  const productShapes = editor.getCurrentPageShapes().filter((shape) => {
    if (shape.meta?.source !== 'product') return false
    const bounds = editor.getShapePageBounds(shape)
    if (!bounds) return false
    return overlaps(selectionBounds, {
      x: bounds.x,
      y: bounds.y,
      w: bounds.width,
      h: bounds.height,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
    })
  })

  return [...new Map([...productShapes, ...selectedShapes].map((shape) => [shape.id, shape])).values()]
}

function getSelectionAnchor(editor: Editor): SelectionAnchor | null {
  const bounds = editor.getSelectionScreenBounds()
  if (!bounds) return null

  const maxLeft = window.innerWidth - COMPOSER_WIDTH - VIEWPORT_GUTTER
  const maxTop = window.innerHeight - COMPOSER_HEIGHT - 84
  const top = Math.max(64, Math.min(bounds.y, maxTop))

  if (window.innerWidth - bounds.maxX >= COMPOSER_WIDTH + VIEWPORT_GUTTER * 2) {
    return { left: bounds.maxX + VIEWPORT_GUTTER, top, side: 'right' }
  }
  if (bounds.x >= COMPOSER_WIDTH + VIEWPORT_GUTTER * 2) {
    return { left: bounds.x - COMPOSER_WIDTH - VIEWPORT_GUTTER, top, side: 'left' }
  }

  return {
    left: Math.max(VIEWPORT_GUTTER, Math.min(bounds.x, maxLeft)),
    top: Math.max(64, Math.min(bounds.maxY + VIEWPORT_GUTTER, maxTop)),
    side: 'below',
  }
}

function setProposalVisibility(editor: Editor, responseId: string, visible: boolean) {
  const proposalShapes = editor
    .getCurrentPageShapes()
    .filter((shape) => shape.meta?.source === 'codex' && shape.meta?.responseId === responseId)

  if (!proposalShapes.length) return
  editor.updateShapes(
    proposalShapes.map((shape) => ({
      id: shape.id,
      type: shape.type,
      opacity: visible ? 1 : 0,
      isLocked: !visible,
    }))
  )
  if (!visible) editor.selectNone()
}

function seedProductArtifact(editor: Editor, project: (typeof PROJECTS)[number]) {
  if (!('seed' in project) || editor.getCurrentPageShapes().length) return

  const assetId = AssetRecordType.createId(`product-${project.id}-current`)
  const shapeId = createShapeId(`product-${project.id}-current`)
  editor.createAssets([
    {
      id: assetId,
      typeName: 'asset',
      type: 'image',
      props: {
        w: project.seed.sourceW,
        h: project.seed.sourceH,
        name: project.seed.altText,
        isAnimated: false,
        mimeType: 'image/jpeg',
        src: project.seed.src,
      },
      meta: {},
    },
  ])
  editor.createShape({
    id: shapeId,
    type: 'image',
    x: 0,
    y: 0,
    isLocked: true,
    props: {
      w: 1280,
      h: 720,
      assetId,
      altText: project.seed.altText,
    },
    meta: {
      source: 'product',
      state: 'current',
    },
  })
  editor.select(shapeId)
  editor.zoomToSelection({ animation: { duration: 320 } })
  editor.selectNone()
}

function createProposalShapes(editor: Editor, response: CanvasResponse, request: CanvasRequest | null) {
  const originX = request?.selectionBounds.x ?? 120
  const originY = request?.selectionBounds.y ?? 120
  const createdIds: ReturnType<typeof createShapeId>[] = []
  let cursorY = originY

  const createBlock = (block: ProposalBlock, index: number) => {
    const x = block.x ?? originX
    const y = block.y ?? cursorY
    const id = createShapeId(`codex-${response.responseId}-${index}`)

    if (block.kind === 'image') {
      const assetId = AssetRecordType.createId(`codex-${response.responseId}-${index}`)
      editor.createAssets([
        {
          id: assetId,
          typeName: 'asset',
          type: 'image',
          props: {
            w: block.sourceW,
            h: block.sourceH,
            name: block.altText,
            isAnimated: false,
            mimeType: block.mimeType ?? 'image/jpeg',
            src: block.src,
          },
          meta: {},
        },
      ])
      editor.createShape({
        id,
        type: 'image',
        x,
        y,
        props: {
          w: block.w,
          h: block.h,
          assetId,
          altText: block.altText,
        },
        meta: {
          source: 'codex',
          responseId: response.responseId,
          requestId: response.requestId,
        },
      })
    } else if (block.kind === 'arrow') {
      const color = block.color ?? 'blue'
      editor.createShape({
        id,
        type: 'arrow',
        x,
        y,
        props: {
          start: { x: 0, y: 0 },
          end: { x: block.endX - x, y: block.endY - y },
          arrowheadEnd: 'arrow',
          color,
          dash: 'draw',
          size: 'm',
          richText: toRichText(block.text ?? ''),
        },
        meta: {
          source: 'codex',
          responseId: response.responseId,
          requestId: response.requestId,
        },
      })
    } else if (block.kind === 'note') {
      const color = block.color ?? 'blue'
      const text = block.title ? `${block.title}\n\n${block.text}` : block.text
      editor.createShape({
        id,
        type: 'note',
        x,
        y,
        props: {
          color,
          richText: toRichText(text),
          size: 'm',
          font: 'draw',
        },
        meta: {
          source: 'codex',
          responseId: response.responseId,
          requestId: response.requestId,
        },
      })
    } else {
      const color = block.color ?? 'blue'
      const text = block.title ? `${block.title}\n\n${block.text}` : block.text
      const w = block.w ?? 360
      const h = block.h ?? 180
      editor.createShape({
        id,
        type: 'geo',
        x,
        y,
        props: {
          geo: 'rectangle',
          w,
          h,
          color,
          fill: 'semi',
          dash: 'draw',
          size: 'm',
          font: 'draw',
          align: 'start',
          verticalAlign: 'start',
          richText: toRichText(text),
        },
        meta: {
          source: 'codex',
          responseId: response.responseId,
          requestId: response.requestId,
        },
      })
    }

    createdIds.push(id)
    if (block.kind !== 'arrow') cursorY = y + (block.h ?? (block.kind === 'note' ? 220 : 180)) + 32
  }

  response.blocks.forEach(createBlock)
  if (createdIds.length) {
    editor.select(...createdIds)
    editor.zoomToSelection({ animation: { duration: 320 } })
  }
  return createdIds
}

function CanvasControls({
  editor,
  project,
  onProjectChange,
  status,
  setStatus,
  latestRequest,
  latestResponseId,
  viewMode,
  onViewModeChange,
  onRequestSaved,
}: {
  editor: Editor | null
  project: (typeof PROJECTS)[number]
  onProjectChange: (projectId: string) => void
  status: string
  setStatus: (value: string) => void
  latestRequest: CanvasRequest | null
  latestResponseId: string | null
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  onRequestSaved: (request: CanvasRequest) => void
}) {
  const [instruction, setInstruction] = useState('')
  const [sending, setSending] = useState(false)
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null)
  const selectionKeyRef = useRef('')

  useEffect(() => {
    if (!editor) {
      setSelectionAnchor(null)
      return
    }

    let animationFrame = 0
    const sync = () => {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(() => {
        const selectionKey = editor.getSelectedShapeIds().join(',')
        if (selectionKey !== selectionKeyRef.current) {
          selectionKeyRef.current = selectionKey
          setInstruction('')
        }
        setSelectionAnchor(getSelectionAnchor(editor))
      })
    }
    const unlisten = editor.store.listen(sync)
    window.addEventListener('resize', sync)
    sync()
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', sync)
      unlisten()
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return

    let pendingShapeId: TLShape['id'] | null = null
    let settleTimer = 0
    const settleOnNewShape = () => {
      window.clearTimeout(settleTimer)
      settleTimer = window.setTimeout(() => {
        if (!pendingShapeId || !editor.getShape(pendingShapeId)) return
        editor.setCurrentTool('select')
        editor.select(pendingShapeId)
        pendingShapeId = null
      }, 180)
    }

    const unlisten = editor.store.listen(({ changes }) => {
      const addedShape = Object.values(changes.added).find(
        (record): record is TLShape =>
          record.typeName === 'shape' &&
          record.meta?.source !== 'product' &&
          record.meta?.source !== 'codex'
      )
      if (addedShape) {
        pendingShapeId = addedShape.id
        settleOnNewShape()
        return
      }
      if (pendingShapeId && Object.prototype.hasOwnProperty.call(changes.updated, pendingShapeId)) {
        settleOnNewShape()
      }
    }, { source: 'user', scope: 'document' })

    return () => {
      window.clearTimeout(settleTimer)
      unlisten()
    }
  }, [editor])

  const submit = useCallback(async () => {
    if (!editor || sending) return
    const selectedShapes = editor.getSelectedShapes()
    const selectionBounds = getBounds(editor)
    if (!selectedShapes.length || !selectionBounds) {
      setStatus('先选中要讨论的截图、草图和批注')
      return
    }

    setSending(true)
    setStatus('正在整理选区…')
    try {
      const maxSize = 1400
      const scale = Math.min(1, maxSize / selectionBounds.w, maxSize / selectionBounds.h)
      const image = await editor.toImage(getCaptureShapes(editor, selectedShapes), {
        scale,
        background: true,
        format: 'jpeg',
      })
      const request: CanvasRequest = {
        requestId: `request-${Date.now()}`,
        projectId: project.id,
        createdAt: new Date().toISOString(),
        instruction: instruction.trim(),
        workspaceLabel: project.label,
        selectionBounds,
        selectedShapeIds: selectedShapes.map((shape) => shape.id),
        shapes: selectedShapes as TLShape[],
        screenshot: image.blob ? await blobToDataUrl(image.blob) : undefined,
      }
      const response = await fetch('/api/canvas/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      if (!response.ok) throw new Error((await response.json()).error || '保存失败')
      const saved = (await response.json()) as CanvasRequest
      onRequestSaved(saved)
      setInstruction('')
      setStatus('已记录这处 · 回到当前对话说「读画布」')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '交付失败')
    } finally {
      setSending(false)
    }
  }, [editor, instruction, onRequestSaved, project, sending, setStatus])

  const approve = useCallback(async () => {
    if (!editor || !latestRequest || !latestResponseId) {
      setStatus('还没有可以批准的 Codex 提案')
      return
    }
    const selectedProposal = editor.getCurrentPageShapes().filter(
      (shape) => shape.meta?.source === 'codex' && shape.meta?.responseId === latestResponseId
    )
    if (!selectedProposal.length) {
      setStatus('当前提案还没有完整呈现')
      return
    }
    const approvalId = `approval-${Date.now()}`
    const response = await fetch('/api/canvas/approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approvalId,
        projectId: project.id,
        requestId: latestRequest.requestId,
        responseId: latestResponseId,
        createdAt: new Date().toISOString(),
        selectedShapeIds: selectedProposal.map((shape) => shape.id),
        shapes: selectedProposal,
      }),
    })
    if (!response.ok) {
      setStatus('批准状态保存失败')
      return
    }
    setStatus('已批准 · 现在可以让 Codex 开始实现')
  }, [editor, latestRequest, latestResponseId, project, setStatus])

  return (
    <>
      <nav className="project-switcher" aria-label="切换项目">
        {PROJECTS.map((item) => (
          <button
            aria-current={item.id === project.id ? 'page' : undefined}
            className={item.id === project.id ? 'is-active' : undefined}
            key={item.id}
            onClick={() => onProjectChange(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>
      {latestResponseId ? (
        <div className="view-switcher" role="group" aria-label="切换当前状态和提案状态">
          <button
            className={viewMode === 'current' ? 'is-active' : undefined}
            onClick={() => onViewModeChange('current')}
            type="button"
          >
            当前
          </button>
          <button
            className={viewMode === 'proposal' ? 'is-active' : undefined}
            onClick={() => onViewModeChange('proposal')}
            type="button"
          >
            提案
          </button>
        </div>
      ) : null}
      {selectionAnchor ? (
        <section
          className="context-composer"
          data-side={selectionAnchor.side}
          style={{ left: selectionAnchor.left, top: selectionAnchor.top }}
          aria-label="与 Codex 讨论选中的位置"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="context-composer__header">
            <strong>{viewMode === 'proposal' ? '这份提案' : '讨论这处'}</strong>
            <span>{editor?.getSelectedShapes().length ?? 0} 个对象</span>
          </div>
          <input
            autoFocus
            aria-label="告诉 Codex 这里要改什么"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
            }}
            placeholder="直接说这里要改什么…"
          />
          <div className="context-composer__actions">
            <button
              className="context-composer__secondary"
              type="button"
              onClick={() => {
                setInstruction('')
                editor?.selectNone()
              }}
            >
              取消
            </button>
            {latestResponseId && viewMode === 'proposal' ? (
              <button className="context-composer__approve" type="button" onClick={approve}>
                批准这份提案
              </button>
            ) : (
              <button className="context-composer__submit" type="button" onClick={submit} disabled={sending}>
                {sending ? '记录中…' : '交给 Codex'}
              </button>
            )}
          </div>
        </section>
      ) : (
        <div className="canvas-guide">在产品上圈选或点击，开始讨论</div>
      )}
      {status ? <div className="canvas-status" aria-live="polite">{status}</div> : null}
    </>
  )
}

export function App() {
  const editorRef = useRef<Editor | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [status, setStatus] = useState('')
  const [latestRequest, setLatestRequest] = useState<CanvasRequest | null>(null)
  const [latestResponseId, setLatestResponseId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('current')
  const appliedResponses = useRef(new Set<string>())
  const [projectId, setProjectId] = useState(initialProjectId)
  const project = PROJECTS.find((item) => item.id === projectId) ?? PROJECTS[0]

  const changeProject = useCallback((nextProjectId: string) => {
    if (nextProjectId === projectId || !PROJECTS.some((item) => item.id === nextProjectId)) return
    const nextUrl = new URL(window.location.href)
    nextUrl.searchParams.set('project', nextProjectId)
    window.history.replaceState(null, '', nextUrl)
    editorRef.current = null
    setEditor(null)
    setLatestRequest(null)
    setLatestResponseId(null)
    setViewMode('current')
    setStatus('')
    setProjectId(nextProjectId)
  }, [projectId])

  useEffect(() => {
    const restoreLatestRequest = async () => {
      try {
        const response = await fetch(`/api/canvas/latest-request?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' })
        if (!response.ok) return
        const request = (await response.json()) as CanvasRequest | null
        if (request) setLatestRequest(request)
      } catch {
        // A new request can still be created while the bridge reconnects.
      }
    }
    void restoreLatestRequest()
  }, [project.id])

  useEffect(() => {
    let disposed = false
    const poll = async () => {
      try {
        const response = await fetch(`/api/canvas/latest-response?projectId=${encodeURIComponent(project.id)}`, { cache: 'no-store' })
        if (!response.ok) return
        const payload = (await response.json()) as CanvasResponse | null
        if (
          !payload ||
          !latestRequest ||
          payload.requestId !== latestRequest.requestId ||
          disposed ||
          !editorRef.current ||
          appliedResponses.current.has(payload.responseId)
        ) {
          return
        }
        const alreadyOnCanvas = editorRef.current
          .getCurrentPageShapes()
          .some((shape) => shape.meta?.responseId === payload.responseId)
        if (!alreadyOnCanvas) {
          const obsoleteProposalIds = editorRef.current
            .getCurrentPageShapes()
            .filter(
              (shape) =>
                shape.meta?.source === 'codex' && shape.meta?.responseId !== payload.responseId
            )
            .map((shape) => shape.id)
          if (obsoleteProposalIds.length) editorRef.current.deleteShapes(obsoleteProposalIds)
          createProposalShapes(editorRef.current, payload, latestRequest)
        }
        appliedResponses.current.add(payload.responseId)
        setLatestResponseId(payload.responseId)
        setViewMode('proposal')
        setStatus(payload.summary || 'Codex 已把提案放到画布上')
      } catch (error) {
        console.error('Failed to apply canvas response', error)
        setStatus('Codex 提案没有完整放入画布，正在等待重试')
      }
    }
    void poll()
    const timer = window.setInterval(poll, POLL_INTERVAL)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [latestRequest, project.id])

  const changeViewMode = useCallback((mode: ViewMode) => {
    if (!editorRef.current || !latestResponseId) return
    setProposalVisibility(editorRef.current, latestResponseId, mode === 'proposal')
    setViewMode(mode)
    setStatus('')
  }, [latestResponseId])

  return (
    <main className="app-shell">
      <Tldraw
        key={project.id}
        persistenceKey={`codex-collab-canvas-${project.canvasVersion}-${project.id}`}
        onMount={(mountedEditor) => {
          editorRef.current = mountedEditor
          setEditor(mountedEditor)
          seedProductArtifact(mountedEditor, project)
        }}
      />
      <CanvasControls
        editor={editor}
        project={project}
        onProjectChange={changeProject}
        status={status}
        setStatus={setStatus}
        latestRequest={latestRequest}
        latestResponseId={latestResponseId}
        viewMode={viewMode}
        onViewModeChange={changeViewMode}
        onRequestSaved={setLatestRequest}
      />
    </main>
  )
}
