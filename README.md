# Codex 共创画布

这是独立于任何产品仓库的工程协作工具。画布承载 CEO 的草图、圈选和批注，也承载 Codex 的提案；只有明确批准后，工程实现才可以开始。

## 启动

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:8768/`。顶部项目切换器会为每个项目使用独立的画布、提案、批注和批准记录。

## 当前协作闭环

1. 真实产品截图占据主画面；默认不摆放说明卡。
2. 在要讨论的位置画圈、画框或点击对象；输入框会贴着选区出现。
3. 就地补充一句话，点击“交给 Codex”。
4. 在 Codex 聊天里说“读画布”。
5. Codex 读取选区和其下方的真实产品画面，再通过 `/api/canvas/response` 写回一份可切换提案。
6. 在“当前 / 提案”之间切换；认可后在提案旁点击“批准这份提案”。批准记录保存在 `data/latest-approval.json`。

在批准文件存在且与当前提案匹配之前，不应修改任何产品代码。

## Codex 提案格式

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
