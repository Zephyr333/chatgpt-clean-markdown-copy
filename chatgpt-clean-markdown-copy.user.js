// ==UserScript==
// @name         ChatGPT Clean Markdown Copy
// @namespace    local.chatgpt.clean.markdown.copy
// @version      0.3.2
// @author       Zephyr Three
// @description  One-click copy ChatGPT assistant response as clean Markdown without citation tokens.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @license      MIT
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22%20viewBox%3D%220%200%2064%2064%22%3E%0A%20%20%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2214%22%20fill%3D%22%23111111%22/%3E%0A%20%20%3Crect%20x%3D%2224%22%20y%3D%2212%22%20width%3D%2228%22%20height%3D%2228%22%20rx%3D%227%22%20fill%3D%22none%22%20stroke%3D%22%23f5f5f5%22%20stroke-width%3D%225%22/%3E%0A%20%20%3Crect%20x%3D%2212%22%20y%3D%2224%22%20width%3D%2228%22%20height%3D%2228%22%20rx%3D%227%22%20fill%3D%22%23111111%22%20stroke%3D%22%23f5f5f5%22%20stroke-width%3D%225%22/%3E%0A%20%20%3Ctext%20x%3D%2226%22%20y%3D%2244%22%20text-anchor%3D%22middle%22%20font-size%3D%2215%22%20font-weight%3D%22800%22%20font-family%3D%22Arial,%20Helvetica,%20sans-serif%22%20fill%3D%22%23f5f5f5%22%3EM%3C/text%3E%0A%3C/svg%3E
// @homepageURL  https://github.com/Zephyr333/chatgpt-clean-markdown-copy
// @supportURL   https://github.com/Zephyr333/chatgpt-clean-markdown-copy/issues
// @downloadURL  https://raw.githubusercontent.com/Zephyr333/chatgpt-clean-markdown-copy/main/chatgpt-clean-markdown-copy.user.js
// @updateURL    https://raw.githubusercontent.com/Zephyr333/chatgpt-clean-markdown-copy/main/chatgpt-clean-markdown-copy.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const PROCESSED_ATTR = 'data-clean-md-copy-button';
  const BUTTON_CLASS = 'clean-md-copy-button';
  const MESSAGE_ID_ATTR = 'data-clean-md-copy-message-id';
  const BUTTON_OWNER_ATTR = 'data-clean-md-copy-owner';
  const COPIED_TEXT = 'Copied!';
  const FAILED_TEXT = 'Failed';
  const COPY_LABEL_RE = /copy|复制|拷贝/i;
  const NOT_NATIVE_COPY_RE = /clean markdown|copy code|copy link|copy conversation|复制代码|复制链接|分享/i;
  const TOKEN_MARK = '\uE000';
  const PUNCTUATION_RE = /^[.,!?;:。，！？；：、）】》」』)]$/;
  const INTERNAL_TOKEN_RE = /[\s\S]*?/g;
  const CLIPBOARD_SENTINEL_PREFIX = '\uE001clean-md-copy-sentinel-';
  let iconMaskCounter = 0;
  let messageIdCounter = 0;

  function cleanInternalTokens(text) {
    return String(text || '')
      .replace(INTERNAL_TOKEN_RE, TOKEN_MARK)
      // Remove lines that became citation-only lines.
      .replace(/(^|\n)[ \t]*(?:\uE000[ \t]*)+(?:\n|$)/g, (match, lineStart) => lineStart || '')
      // Remove token-created gaps before punctuation.
      .replace(/([^\s])[ \t]*\uE000[ \t]*([^\s])/g, (match, before, after) => {
        return PUNCTUATION_RE.test(after) ? before + after : before + ' ' + after;
      })
      .replace(/[ \t]*\uE000[ \t]*/g, '');
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function readClipboard() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      throw new Error('Clipboard readText is unavailable.');
    }
    return navigator.clipboard.readText();
  }

  async function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (error) {
        console.warn('[Clean MD Copy] navigator.clipboard.writeText failed, using fallback.', error);
      }
    }

    fallbackWriteClipboard(text);
  }

  function fallbackWriteClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      if (!document.execCommand('copy')) {
        throw new Error('document.execCommand("copy") returned false.');
      }
    } finally {
      textarea.remove();
    }
  }

  function getButtonText(button) {
    return [
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.textContent
    ].filter(Boolean).join(' ');
  }

  function isNativeCopyButton(button) {
    if (!button || button.classList.contains(BUTTON_CLASS)) {
      return false;
    }

    if (button.closest('pre, code')) {
      return false;
    }

    const label = getButtonText(button).trim();
    return COPY_LABEL_RE.test(label) && !NOT_NATIVE_COPY_RE.test(label);
  }

  function isInsideMessageContent(message, element) {
    const contentRoot = message.querySelector('.markdown');
    return Boolean(
      element.closest('table') ||
      (contentRoot && contentRoot.contains(element))
    );
  }

  function isNearMessage(message, element) {
    const messageRect = message.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    if (!messageRect.height || !elementRect.height) {
      return true;
    }

    return elementRect.bottom >= messageRect.top - 80 && elementRect.top <= messageRect.bottom + 120;
  }

  function getNearbyRoots(message) {
    const roots = [];
    let node = message.parentElement;

    for (let depth = 0; node && node !== document.body && depth < 6; depth += 1) {
      roots.push(node);
      node = node.parentElement;
    }

    return roots;
  }

  function pickBottomMostButton(buttons) {
    return buttons.sort((a, b) => {
      return b.getBoundingClientRect().top - a.getBoundingClientRect().top;
    })[0] || null;
  }

  function findNativeCopyButton(message) {
    const insideButtons = Array.from(message.querySelectorAll('button')).filter((button) => {
      return isNativeCopyButton(button) && !isInsideMessageContent(message, button);
    });
    const insideButton = pickBottomMostButton(insideButtons);
    if (insideButton) {
      return insideButton;
    }

    // ChatGPT sometimes renders controls in a nearby footer/toolbar rather than inside the text block.
    for (const root of getNearbyRoots(message)) {
      const nearbyButtons = Array.from(root.querySelectorAll('button')).filter((button) => {
        if (!isNativeCopyButton(button)) {
          return false;
        }

        const ownerMessage = button.closest('[data-message-author-role]');
        if (ownerMessage === message) {
          return !isInsideMessageContent(message, button);
        }

        return !ownerMessage && isNearMessage(message, button);
      });
      const nearbyButton = pickBottomMostButton(nearbyButtons);

      if (nearbyButton) {
        return nearbyButton;
      }
    }

    return null;
  }

  function altClick(button) {
    button.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      altKey: true
    }));
  }

  async function copyFromMessage(message) {
    const nativeCopyButton = findNativeCopyButton(message);

    if (!nativeCopyButton) {
      throw new Error('Native ChatGPT copy button was not found.');
    }

    if (nativeCopyButton) {
      try {
        let previousRawText = null;
        try {
          previousRawText = await readClipboard();
        } catch (error) {
          console.warn('[Clean MD Copy] Clipboard pre-read failed; native copy will still be attempted.', error);
        }

        const sentinel = `${CLIPBOARD_SENTINEL_PREFIX}${Date.now()}-${Math.random()}`;
        let sentinelWritten = false;
        if (previousRawText !== null) {
          try {
            await writeClipboard(sentinel);
            sentinelWritten = true;
          } catch (error) {
            console.warn('[Clean MD Copy] Clipboard sentinel write failed; falling back to change detection.', error);
          }
        }

        altClick(nativeCopyButton);
        await sleep(240);

        const nativeRawText = await readClipboard();
        const cleanedText = cleanInternalTokens(nativeRawText);
        const nativeCopyLikelyWorked = sentinelWritten
          ? nativeRawText !== sentinel
          : (
            previousRawText === null ||
            nativeRawText !== previousRawText ||
            cleanedText !== nativeRawText
          );

        if (cleanedText && nativeCopyLikelyWorked) {
          await writeClipboard(cleanedText);
          console.info('[Clean MD Copy] Copied via native Alt+copy path.');
          return;
        }

        if (sentinelWritten) {
          await writeClipboard(previousRawText);
        }

        throw new Error('Native Alt+copy did not change the clipboard.');
      } catch (error) {
        throw new Error(`Native Alt+copy path failed: ${error.message}`);
      }
    }
  }

  function createCopyMarkdownIcon() {
    iconMaskCounter += 1;
    const maskId = `clean-md-copy-back-mask-${iconMaskCounter}`;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.flex = '0 0 auto';
    svg.style.display = 'block';

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
    mask.setAttribute('id', maskId);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');

    const maskBase = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    maskBase.setAttribute('x', '0');
    maskBase.setAttribute('y', '0');
    maskBase.setAttribute('width', '24');
    maskBase.setAttribute('height', '24');
    maskBase.setAttribute('fill', 'white');

    const frontCutout = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    frontCutout.setAttribute('x', '2');
    frontCutout.setAttribute('y', '7.5');
    frontCutout.setAttribute('width', '13.8');
    frontCutout.setAttribute('height', '13.8');
    frontCutout.setAttribute('rx', '3.4');
    frontCutout.setAttribute('fill', 'black');

    mask.append(maskBase, frontCutout);
    defs.append(mask);

    const back = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    back.setAttribute('x', '5.25');
    back.setAttribute('y', '3.25');
    back.setAttribute('width', '12.5');
    back.setAttribute('height', '12.5');
    back.setAttribute('rx', '3.2');
    back.setAttribute('fill', 'none');
    back.setAttribute('stroke', 'currentColor');
    back.setAttribute('stroke-width', '2');
    back.setAttribute('mask', `url(#${maskId})`);

    const front = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    front.setAttribute('x', '2.75');
    front.setAttribute('y', '8');
    front.setAttribute('width', '12.5');
    front.setAttribute('height', '12.5');
    front.setAttribute('rx', '3.2');
    front.setAttribute('fill', 'none');
    front.setAttribute('stroke', 'currentColor');
    front.setAttribute('stroke-width', '2');

    const letter = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    letter.setAttribute('x', '9');
    letter.setAttribute('y', '17.1');
    letter.setAttribute('text-anchor', 'middle');
    letter.setAttribute('font-size', '6.2');
    letter.setAttribute('font-weight', '800');
    letter.setAttribute('font-family', 'ui-sans-serif, system-ui, sans-serif');
    letter.setAttribute('fill', 'currentColor');
    letter.textContent = 'M';

    svg.append(defs, back, front, letter);
    return svg;
  }

  function setButtonState(button, text) {
    button.setAttribute('aria-label', text);
    button.title = text;
  }

  function createCopyButton(message) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.title = 'Copy this response as clean Markdown';
    button.setAttribute('aria-label', 'Copy this response as clean Markdown');
    button.append(createCopyMarkdownIcon());

    Object.assign(button.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      marginLeft: '2px',
      padding: '0',
      border: '0',
      borderRadius: '6px',
      background: 'transparent',
      color: 'inherit',
      cursor: 'pointer',
      font: 'inherit',
      fontSize: '12px',
      lineHeight: '18px',
      opacity: '0.76',
      whiteSpace: 'nowrap'
    });

    button.addEventListener('mouseenter', () => {
      button.style.opacity = '1';
    });

    button.addEventListener('mouseleave', () => {
      button.style.opacity = '0.72';
    });

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        button.disabled = true;
        await copyFromMessage(message);
        setButtonState(button, COPIED_TEXT);
      } catch (error) {
        setButtonState(button, FAILED_TEXT);
        console.error('[Clean MD Copy] Copy failed.', error);
      } finally {
        window.setTimeout(() => {
          button.disabled = false;
          setButtonState(button, 'Copy this response as clean Markdown');
        }, 1200);
      }
    });

    return button;
  }

  function getMessageId(message) {
    let messageId = message.getAttribute(MESSAGE_ID_ATTR);

    if (!messageId) {
      messageIdCounter += 1;
      messageId = `clean-md-message-${messageIdCounter}`;
      message.setAttribute(MESSAGE_ID_ATTR, messageId);
    }

    return messageId;
  }

  function insertButton(message) {
    const nativeCopyButton = findNativeCopyButton(message);
    if (!nativeCopyButton || !nativeCopyButton.parentElement) {
      return;
    }

    const messageId = getMessageId(message);
    const existingButton = document.querySelector(`.${BUTTON_CLASS}[${BUTTON_OWNER_ATTR}="${messageId}"]`)
      || message.querySelector(`.${BUTTON_CLASS}`);
    const button = existingButton || createCopyButton(message);
    button.setAttribute(BUTTON_OWNER_ATTR, messageId);

    if (button.parentElement !== nativeCopyButton.parentElement || button.previousElementSibling !== nativeCopyButton) {
      nativeCopyButton.parentElement.insertBefore(button, nativeCopyButton.nextSibling);
    }

    message.setAttribute(PROCESSED_ATTR, 'true');
  }

  function scan() {
    document
      .querySelectorAll('[data-message-author-role="assistant"]')
      .forEach(insertButton);
  }

  function debounce(fn, delay) {
    let timer = 0;

    return function debounced() {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, delay);
    };
  }

  const debouncedScan = debounce(scan, 150);

  scan();

  const observer = new MutationObserver(debouncedScan);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
