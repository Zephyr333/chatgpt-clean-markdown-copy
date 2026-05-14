# ChatGPT Clean Markdown Copy

A small Tampermonkey userscript that adds an icon-only clean Markdown copy button to ChatGPT assistant responses.

It reuses ChatGPT's native Alt+copy behavior, then removes internal citation/source tokens such as `cite...` while preserving the original Markdown as much as possible.

## Features

- Adds one clean Markdown copy button to each assistant response.
- Supports `https://chatgpt.com/*` and `https://chat.openai.com/*`.
- Uses the native ChatGPT copy button with an Alt+click event.
- Removes internal `...` citation/source tokens.
- Avoids `innerText` fallback so Markdown formatting is not silently degraded.
- No external libraries, network calls, downloads, settings page, sync, or history.

## Install

1. Install Tampermonkey or another compatible userscript manager.
2. Open the raw userscript:
   <https://raw.githubusercontent.com/Zephyr333/chatgpt-clean-markdown-copy/main/chatgpt-clean-markdown-copy.user.js>
3. Install or update the script.

## License

MIT
