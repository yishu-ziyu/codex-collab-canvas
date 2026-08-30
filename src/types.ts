export type CanvasBounds = {
  x: number
  y: number
  w: number
  h: number
  maxX: number
  maxY: number
}

export type CanvasRequest = {
  requestId: string
  projectId: string
  createdAt: string
  instruction: string
  workspaceLabel: string
  selectionBounds: CanvasBounds
  selectedShapeIds: string[]
  shapes: unknown[]
  screenshot?: string
}

type ProposalColor = 'blue' | 'green' | 'orange' | 'red' | 'violet' | 'yellow'

export type ProposalBlock = {
  kind: 'note' | 'box'
  text: string
  title?: string
  x?: number
  y?: number
  w?: number
  h?: number
  color?: ProposalColor
} | {
  kind: 'arrow'
  x: number
  y: number
  endX: number
  endY: number
  text?: string
  color?: ProposalColor
} | {
  kind: 'image'
  src: string
  altText: string
  x: number
  y: number
  w: number
  h: number
  sourceW: number
  sourceH: number
  mimeType?: string
}

export type CanvasResponse = {
  responseId: string
  requestId: string
  projectId: string
  createdAt?: string
  summary?: string
  blocks: ProposalBlock[]
}
