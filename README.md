# Codex 共创画布

一个独立的工程协作工具：在真实产品截图上圈选批注，交给 AI 编码代理（如 Codex）理解并回写可视化提案，**人工批准之后**工程实现才允许开始。

技术栈：Vite + React 19 + TypeScript + [tldraw](https://tldraw.com) 画布。

## 为什么需要它

「帮我改一下这个按钮的位置」这类纯文字描述，AI 经常改错地方。共创画布把沟通升级为：

- **人**：在真实截图上画圈、画框，就地写一句话，指向明确；
- **AI**：改完不直接动代码，而是把改动画成提案叠在原截图上，人可以「当前 / 提案」来回对比；
- **铁律**：批准文件存在且与提案匹配之前，不修改任何产品代码。

## 工作闭环

```
真实截图铺画布 ──► 人圈选 + 批注 ──► 「交给 Codex」
                                        │
                                        ▼
                          Codex 读画布（GET latest-request）
                                        │
                                        ▼
              Codex 写回提案（POST /api/canvas/response）
                                        │
                                        ▼
              人切换「当前 / 提案」对比 ──► 满意 ──► 「批准这份提案」
                                        │
                                        ▼
                        批准记录落盘（latest-approval.json）
                                        │
                                        ▼
                          此时才允许修改产品代码
```

## 快速开始

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:8768/`。顶部项目切换器让每个项目拥有独立的画布、提案、批注和批准记录。

## 使用流程（人的部分）

1. 真实产品截图占据主画面，默认不摆说明卡；
2. 在要讨论的位置画圈、画框或点击对象，输入框贴着选区出现；
3. 就地补充一句话，点击「交给 Codex」；
4. 在 Codex 聊天里说「读画布」；
5. 提案写回后，在「当前 / 提案」之间切换对比；
6. 认可后点击提案旁的「批准这份提案」。

## 集成方式（Agent 的部分）

Agent 无需知道画布内部实现，只需要两个 HTTP 动作：

**读需求** —— 获取最新的圈选请求（含截图路径与批注内容）：

```
GET /api/canvas/latest-request?projectId=<项目ID>
```

**回提案** —— 二选一：

```bash
# 方式一：CLI
npm run send-proposal -- /绝对路径/proposal.json

# 方式二：直接 POST
curl -X POST http://127.0.0.1:8768/api/canvas/response \
  -H 'Content-Type: application/json' \
  -d @proposal.json
```

## API 一览

| 方法 | 路径 | 作用 |
|------|------|------|
| GET | `/api/canvas/health` | 健康检查 |
| GET | `/api/canvas/latest-request?projectId=` | 最新圈选请求 |
| GET | `/api/canvas/latest-response?projectId=` | 最新提案 |
| GET | `/api/canvas/latest-approval?projectId=` | 最新批准记录 |
| POST | `/api/canvas/request` | 提交圈选请求 |
| POST | `/api/canvas/response` | 写回提案 |
| POST | `/api/canvas/approval` | 写入批准记录 |

- `projectId` 须匹配 `^[a-z0-9][a-z0-9-]{0,63}$`；
- 请求体最大 20MB；
- 请求里的 base64 JPEG 截图会自动抽取为 `data/projects/<id>/requests/<requestId>.jpeg`。

## 提案 JSON 格式

```json
{
  "responseId": "response-001",
  "requestId": "request-001",
  "projectId": "yishu",
  "summary": "已把这处改动呈现在提案态",
  "blocks": [
    {
      "kind": "box",
      "title": "提案",
      "text": "只修改选中的位置；其余界面保持不变。",
      "color": "blue"
    },
    {
      "kind": "note",
      "text": "尚未确定：是否保留次要入口。",
      "color": "yellow"
    }
  ]
}
```

`blocks` 会渲染为画布上的标注框（`box`）和便签（`note`），支持与原截图叠加对比。

## 目录结构

```
src/                  前端（React + tldraw 画布）
vite.config.ts        内置 canvasBridge 插件，提供 /api/canvas/* 全部接口
scripts/
  send-proposal.mjs   Agent 写提案的 CLI
data/
  projects/<id>/
    requests/         人的圈选请求（JSON + 截图）
    responses/        AI 提案
    approvals/        批准记录
    latest-*.json     三类记录的最新态指针
journeys/             多步协作的行程记录（可选）
public/screenshots/   参与协作的产品截图
```

## 设计约束

- **批准前不改代码。** 批准文件存在且与当前提案匹配，是开始工程实现的前置条件；
- 画布记录全部落盘为纯 JSON + 图片文件，无数据库、无外部服务依赖，`git` 即备份；
- 本工具独立于任何产品仓库运行，不与被协作项目的代码耦合。
