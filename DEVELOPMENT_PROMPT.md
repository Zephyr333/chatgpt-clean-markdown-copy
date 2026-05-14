# ChatGPT Clean Markdown Copy - Development Prompt

写一个 Tampermonkey / 篡改猴 userscript，用在新版 ChatGPT 网页。

匹配网址：

```text
https://chatgpt.com/*
https://chat.openai.com/*
```

目标：

为每一条 assistant 回复添加一个按钮：`Copy Clean MD`。

点击后，一键复制当前这条 assistant 回复的 Markdown 源文本，并删除所有 ChatGPT 内部 citation/source token。

不要导出文件，不要下载 `.md`，不要保留 citations，不要做设置页，不要联网，不要加载外部库。

## 核心思路

ChatGPT 原生复制按钮在 Windows/Edge 中，按住 Alt 再点击时，可以复制更接近 Markdown 源文本的内容。

因此脚本应优先尝试复用 ChatGPT 原生 Alt+复制逻辑，而不是自己重新实现 HTML -> Markdown 转换。

## 点击 `Copy Clean MD` 后的流程

1. 找到当前 assistant 消息里的 ChatGPT 原生复制按钮。
2. 尝试模拟 Alt+点击原生复制按钮：

   ```js
   dispatchEvent(new MouseEvent('click', {
     bubbles: true,
     cancelable: true,
     altKey: true
   }))
   ```

3. 等待 100-300ms，让原生复制逻辑写入剪贴板。
4. 读取剪贴板文本。
5. 调用 `cleanInternalTokens(text)`，删除 ChatGPT 内部 token。
6. 把清洗后的 Markdown 写回剪贴板。
7. 成功后按钮显示 `Copied!`，1.2 秒后恢复 `Copy Clean MD`。
8. 如果原生 Alt+复制失败，不要 fallback 到 `innerText`，因为这会破坏 Markdown 源文本。此时按钮应显示失败，并在 console 中打印错误。

## `cleanInternalTokens(text)` 要求

`cleanInternalTokens(text)` 必须只删除 ChatGPT 内部 citation/source token，并且只处理删除 token 本身可能造成的排版隐患，不做任何其它排版修正。

- 删除所有 ChatGPT 内部 citation/source token，例如：

  ```text
  citeturn 998196 view 1
  citeturn 998196 view 3
  citeturn 998196 view 4
  citeturn 467431 view 1turn 467431 view 2
  ```

- 建议按内部 token 外壳删除，而不是只枚举 `cite` / `filecite` / `navlist`，避免未来新增类型漏网：

  ```js
  /[\s\S]*?/g
  ```

- 可以修复删除 token 后直接造成的双空格、标点前空格、citation-only 空行。
- 不修复原文本中本来就存在的英文或中文标点前空格。
- 不压缩原文本中本来就存在的空行。
- 不删除行尾空格。
- 不 trim。
- 不修改 fenced code block、列表、缩进或任何 Markdown 结构空白。

## 按钮插入要求

- 只处理 `data-message-author-role="assistant"` 的消息。
- 不处理用户消息。
- 每条 assistant 回复只插入一个按钮。
- 给已处理消息加 `data-clean-md-copy-button="true"`，避免重复插入。
- 按钮尽量插入到当前 assistant 消息原生操作栏附近。
- 如果找不到操作栏，就插入到该 assistant 消息底部。
- 按钮样式低调，不破坏 ChatGPT 原有布局。
- 按钮 `title` 为：`Copy this response as clean Markdown`

## ChatGPT SPA 适配

- 页面加载后扫描一次。
- 使用 `MutationObserver` 监听新消息和会话切换。
- 用 debounce 避免频繁扫描。
- 不要依赖容易变化的 hash className。
- 优先使用 `data-message-author-role="assistant"`。
- 查找原生复制按钮时尽量鲁棒：
  1. 在当前 assistant 消息内部查找 `aria-label` 或 `title` 包含 `Copy` / `复制` 的 `button`。
  2. 如果找不到，在当前消息附近的操作栏区域查找复制按钮。
  3. 如果仍然找不到，显示失败，不要 fallback 到 `innerText`。

## fallback 要求

不要实现自动 fallback 文本提取。

如果原生 Alt+复制路径失败，宁可失败，也不要复制渲染后的 `innerText`，避免把 Markdown 标题、链接、加粗、表格等语义降级。

## 剪贴板要求

- 优先使用 `navigator.clipboard.readText()` 和 `navigator.clipboard.writeText()`。
- 如果 `writeText` 失败，使用隐藏 `textarea` + `document.execCommand('copy')` fallback。
- 如果 `readText` 失败，显示失败，不要使用 `innerText` fallback。
- 复制失败时按钮显示 `Failed`，并 `console.error(error)`。

## Tampermonkey 头部

请包含完整 userscript metadata：

```js
// ==UserScript==
// @name         ChatGPT Clean Markdown Copy
// @namespace    local.chatgpt.clean.markdown.copy
// @version      0.1.0
// @description  One-click copy ChatGPT assistant response as clean Markdown without citation tokens.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
```

## 输出要求

- 只输出完整 userscript 代码。
- 不要输出插件 manifest。
- 不要输出 README。
- 不要输出解释。
- 不要添加导出、下载、设置页、同步、历史记录、prompt 管理等任何额外功能。
- 代码保持简单，但要有必要注释。
