import fs from 'node:fs/promises'

const source = process.argv[2]
if (!source) {
  console.error('用法：npm run send-proposal -- /绝对路径/proposal.json')
  process.exit(1)
}

const payload = JSON.parse(await fs.readFile(source, 'utf8'))
if (typeof payload.projectId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(payload.projectId)) {
  console.error('提案必须包含有效的 projectId')
  process.exit(1)
}
const response = await fetch('http://127.0.0.1:8768/api/canvas/response', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})

if (!response.ok) {
  console.error(await response.text())
  process.exit(1)
}

console.log(JSON.stringify(await response.json(), null, 2))
