// ==UserScript==
// @name         ChatGPT 长对话性能优化与当前回答目录
// @namespace    local.chatgpt
// @version      2.0.0
// @description  优化长对话渲染、隐藏选中文本操作浮层，并为当前回答提供可折叠的 H1/H2 章节目录
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(() => {
  'use strict';

  const CONFIG = Object.freeze({
    // 单条回答本身非常长时再开启。默认关闭，兼容性更稳。
    optimizeBlocksInsideLongAnswers: false,

    // 仅当“正在输入的提示词本身也很长”时尝试开启。
    disableEditorSpellcheck: false,

    // 隐藏选中文字后出现的“询问 ChatGPT / 开始写作”浮层。
    hideSelectionActions: true,

    // 启用当前 Assistant 回答的 H1/H2 目录。
    enableAnswerToc: true,

    // 可改成 'h1, h2, h3'，但标题过多时目录会更拥挤。
    answerTocHeadingSelector: 'h1, h2',

    // 第一次使用时是否默认收起；之后会记住手动选择。
    answerTocInitiallyCollapsed: false,
    answerTocRememberCollapsedState: true,

    // 目录跳转动画。系统开启“减少动态效果”时会自动禁用动画。
    answerTocSmoothScroll: true,

    // 以视口从上往下 28% 的位置作为“当前章节”判定线。
    answerTocActiveLineRatio: 0.28,

    // 为官方右侧问答导航预留的最小空间。
    answerTocFallbackInlineEndPx: 68,
    answerTocOfficialNavGapPx: 12,

    // 窗口太窄时隐藏目录，避免覆盖主要内容。设为 0 可始终显示。
    answerTocMinViewportWidth: 820,

    // 目录条目的最大文本长度；完整标题仍会放在 title 提示中。
    answerTocMaxLabelLength: 180,
  });

  const TURN_SELECTOR = 'main [data-testid^="conversation-turn-"]';
  const ASSISTANT_SELECTOR = 'main [data-message-author-role="assistant"]';

  const LONG_ANSWER_BLOCK_SELECTOR = [
    `${ASSISTANT_SELECTOR} .markdown > p`,
    `${ASSISTANT_SELECTOR} .markdown > pre`,
    `${ASSISTANT_SELECTOR} .markdown > blockquote`,
    `${ASSISTANT_SELECTOR} .markdown > ul`,
    `${ASSISTANT_SELECTOR} .markdown > ol`,
    `${ASSISTANT_SELECTOR} .markdown > table`,
    `${ASSISTANT_SELECTOR} .markdown > h1`,
    `${ASSISTANT_SELECTOR} .markdown > h2`,
    `${ASSISTANT_SELECTOR} .markdown > h3`,
    `${ASSISTANT_SELECTOR} .markdown > h4`,
    `${ASSISTANT_SELECTOR} .markdown > div`,
  ].join(',\n');

  const css = [];

  css.push(`
    @supports (content-visibility: auto) {
      /*
       * 屏幕外的历史轮次仍保留在 DOM 中，但浏览器可以跳过其子树的
       * 大量样式计算、布局和绘制工作。
       */
      ${TURN_SELECTOR} {
        content-visibility: auto !important;
        contain-intrinsic-size: auto 640px !important;
        contain-intrinsic-size: auto none auto 640px !important;
      }

      /* data-testid 结构变化时的保守后备。 */
      ${ASSISTANT_SELECTOR} {
        content-visibility: auto !important;
        contain-intrinsic-size: auto 480px !important;
        contain-intrinsic-size: auto none auto 480px !important;
      }
    }
  `);

  if (CONFIG.optimizeBlocksInsideLongAnswers) {
    css.push(`
      @supports (content-visibility: auto) {
        /* 仅用于“一条回答本身就非常长”的情况。 */
        ${LONG_ANSWER_BLOCK_SELECTOR} {
          content-visibility: auto !important;
          contain-intrinsic-size: auto 128px !important;
          contain-intrinsic-size: auto none auto 128px !important;
        }
      }
    `);
  }

  if (CONFIG.hideSelectionActions) {
    css.push(`
      [popover="manual"][style*="--targeted-action-selection"] {
        display: none !important;
        pointer-events: none !important;
      }
    `);
  }

  if (CONFIG.enableAnswerToc) {
    css.push(`
      /* 让目录跳转后的标题与页面顶部保留适当间距。 */
      ${ASSISTANT_SELECTOR} :is(h1, h2, h3, h4) {
        scroll-margin-block-start: 88px;
      }
    `);
  }

  css.push(`
    @media print {
      ${TURN_SELECTOR},
      ${ASSISTANT_SELECTOR}${CONFIG.optimizeBlocksInsideLongAnswers ? `,\n${LONG_ANSWER_BLOCK_SELECTOR}` : ''} {
        content-visibility: visible !important;
        contain-intrinsic-size: none !important;
      }

      #cgpt-answer-toc-host {
        display: none !important;
      }
    }
  `);

  GM_addStyle(css.join('\n'));

  if (CONFIG.disableEditorSpellcheck) {
    const EDITOR_SELECTOR = [
      '#prompt-textarea[contenteditable="true"]',
      'textarea[name="prompt-textarea"]',
    ].join(',');

    const tuneEditor = (element) => {
      if (!(element instanceof HTMLElement)) return;
      element.setAttribute('spellcheck', 'false');
      element.setAttribute('autocorrect', 'off');
      element.setAttribute('autocapitalize', 'off');
    };

    document.addEventListener(
      'focusin',
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.matches(EDITOR_SELECTOR)) {
          tuneEditor(target);
        }
      },
      true,
    );
  }

  if (!CONFIG.enableAnswerToc) return;

  class AnswerTocController {
    constructor(config) {
      this.config = config;

      this.host = null;
      this.shadow = null;
      this.launcher = null;
      this.panel = null;
      this.list = null;
      this.tocNav = null;
      this.countLabel = null;
      this.launcherCount = null;

      this.currentAnswer = null;
      this.currentContentRoot = null;
      this.currentScrollRoot = null;
      this.headings = [];
      this.itemButtons = [];
      this.activeIndex = -1;

      this.mainElement = null;
      this.mainObserver = null;
      this.answerObserver = null;
      this.headingTextObserver = null;

      this.frameId = 0;
      this.forceAnswerDetection = false;
      this.lastAnswerDetectionAt = 0;
      this.answerDetectionTimer = 0;
      this.lastScrollTop = 0;
      this.rebuildTimer = 0;
      this.rebindTimer = 0;
      this.healthTimer = 0;
      this.lastUrl = location.href;

      this.collapsed = this.readCollapsedState();

      this.onScroll = this.onScroll.bind(this);
      this.onResize = this.onResize.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onVisibilityChange = this.onVisibilityChange.bind(this);
      this.onRouteSignal = this.onRouteSignal.bind(this);
      this.onMainMutations = this.onMainMutations.bind(this);
      this.onAnswerMutations = this.onAnswerMutations.bind(this);
    }

    start() {
      if (!document.body) return;

      this.createUi();
      this.bindMainObserver();
      this.updateInlineEndOffset();
      this.syncVisibility();

      document.addEventListener('scroll', this.onScroll, {
        capture: true,
        passive: true,
      });
      window.addEventListener('resize', this.onResize, { passive: true });
      window.addEventListener('popstate', this.onRouteSignal, { passive: true });
      window.addEventListener('hashchange', this.onRouteSignal, { passive: true });
      document.addEventListener('keydown', this.onKeyDown, true);
      document.addEventListener('visibilitychange', this.onVisibilityChange);

      if (window.navigation && typeof window.navigation.addEventListener === 'function') {
        window.navigation.addEventListener('navigatesuccess', this.onRouteSignal);
      }

      /*
       * 这个定时器只比较 URL 和主容器连接状态；
       * 不遍历历史消息，也不读取回答布局。
       */
      this.healthTimer = window.setInterval(() => {
        if (document.hidden) return;

        if (location.href !== this.lastUrl || !this.mainElement?.isConnected) {
          this.resetForNavigation();
          return;
        }
      }, 1600);

      this.requestFrame(true);
    }

    createUi() {
      document.querySelector('#cgpt-answer-toc-host')?.remove();

      const host = document.createElement('div');
      host.id = 'cgpt-answer-toc-host';
      host.hidden = true;
      host.setAttribute('data-cgpt-answer-toc', '');

      const shadow = host.attachShadow({ mode: 'open' });
      shadow.innerHTML = `
        <style>
          :host {
            all: initial;
            position: fixed !important;
            inset-inline-end: var(--cgpt-answer-toc-inline-end, 68px) !important;
            top: 50% !important;
            z-index: 30 !important;
            transform: translateY(-50%) !important;
            font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont,
              "Segoe UI", sans-serif !important;
            font-size: 13px !important;
            line-height: 1.4 !important;
            color: var(--text-primary, #161616) !important;
            color-scheme: light dark !important;
            direction: inherit !important;
            pointer-events: none !important;
          }

          :host([hidden]) {
            display: none !important;
          }

          *, *::before, *::after {
            box-sizing: border-box;
          }

          button {
            font: inherit;
          }

          .launcher,
          .panel {
            pointer-events: auto;
          }

          .launcher {
            display: inline-flex;
            min-width: 38px;
            height: 38px;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 0 9px;
            border: 1px solid var(--border-light, rgba(0, 0, 0, 0.14));
            border-radius: 12px;
            background: var(--main-surface-primary, var(--bg-primary, #ffffff));
            color: var(--text-secondary, #444444);
            box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14);
            cursor: pointer;
          }

          .launcher:hover {
            background: var(--main-surface-secondary, var(--bg-secondary, #f4f4f4));
            color: var(--text-primary, #161616);
          }

          .launcher:focus-visible,
          .icon-button:focus-visible,
          .toc-item:focus-visible {
            outline: 2px solid var(--text-primary, #161616);
            outline-offset: 2px;
          }

          .launcher svg,
          .icon-button svg {
            width: 17px;
            height: 17px;
            flex: none;
          }

          .launcher-count {
            min-width: 1.3em;
            text-align: center;
            font-size: 11px;
            font-variant-numeric: tabular-nums;
          }

          .panel {
            width: min(300px, calc(100vw - 110px));
            max-height: min(68vh, 660px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid var(--border-light, rgba(0, 0, 0, 0.14));
            border-radius: 14px;
            background: var(--main-surface-primary, var(--bg-primary, #ffffff));
            box-shadow: 0 10px 34px rgba(0, 0, 0, 0.16);
          }

          .panel[hidden],
          .launcher[hidden] {
            display: none !important;
          }

          .panel-header {
            min-height: 42px;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 7px 8px 7px 12px;
            border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.11));
          }

          .panel-title-wrap {
            min-width: 0;
            display: flex;
            flex: 1;
            align-items: baseline;
            gap: 7px;
          }

          .panel-title {
            overflow: hidden;
            color: var(--text-primary, #161616);
            font-weight: 600;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .count-label {
            flex: none;
            color: var(--text-tertiary, #777777);
            font-size: 11px;
            font-variant-numeric: tabular-nums;
          }

          .icon-button {
            width: 29px;
            height: 29px;
            display: inline-flex;
            flex: none;
            align-items: center;
            justify-content: center;
            padding: 0;
            border: 0;
            border-radius: 8px;
            background: transparent;
            color: var(--text-secondary, #555555);
            cursor: pointer;
          }

          .icon-button:hover {
            background: var(--main-surface-secondary, var(--bg-secondary, #f1f1f1));
            color: var(--text-primary, #161616);
          }

          .toc-nav {
            min-height: 0;
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: 6px;
            scrollbar-width: thin;
          }

          .toc-list {
            display: flex;
            flex-direction: column;
            gap: 2px;
            margin: 0;
            padding: 0;
            list-style: none;
          }

          .toc-item {
            position: relative;
            width: 100%;
            min-height: 30px;
            display: block;
            overflow: hidden;
            padding: 6px 9px 6px 11px;
            border: 0;
            border-radius: 8px;
            background: transparent;
            color: var(--text-secondary, #4a4a4a);
            text-align: start;
            cursor: pointer;
          }

          .toc-item::before {
            position: absolute;
            inset-block: 7px;
            inset-inline-start: 3px;
            width: 2px;
            border-radius: 2px;
            background: transparent;
            content: "";
          }

          .toc-item:hover {
            background: var(--main-surface-secondary, var(--bg-secondary, #f3f3f3));
            color: var(--text-primary, #161616);
          }

          .toc-item[data-active="true"] {
            background: var(--main-surface-secondary, var(--bg-secondary, #ededed));
            color: var(--text-primary, #111111);
          }

          .toc-item[data-active="true"]::before {
            background: var(--text-primary, #111111);
          }

          .toc-item[data-level="1"] {
            font-weight: 600;
          }

          .toc-item[data-level="2"] {
            padding-inline-start: 25px;
            font-size: 12.5px;
          }

          .toc-item[data-level="3"],
          .toc-item[data-level="4"] {
            padding-inline-start: 38px;
            font-size: 12px;
          }

          .toc-item-label {
            display: -webkit-box;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            overflow-wrap: anywhere;
          }

          @media (prefers-color-scheme: dark) {
            .launcher,
            .panel {
              border-color: rgba(255, 255, 255, 0.14);
              background: var(--main-surface-primary, var(--bg-primary, #212121));
              box-shadow: 0 8px 28px rgba(0, 0, 0, 0.42);
            }

            .panel-header {
              border-bottom-color: rgba(255, 255, 255, 0.11);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
              scroll-behavior: auto !important;
              transition: none !important;
            }
          }
        </style>

        <button
          id="launcher"
          class="launcher"
          type="button"
          aria-label="展开当前回答目录"
          aria-expanded="false"
          title="展开当前回答目录（Alt+Shift+O）"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 6h14M5 12h14M5 18h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <span id="launcher-count" class="launcher-count">0</span>
        </button>

        <aside id="panel" class="panel" aria-label="当前回答目录" hidden>
          <div class="panel-header">
            <div class="panel-title-wrap">
              <span class="panel-title">当前回答目录</span>
              <span id="count-label" class="count-label">0 节</span>
            </div>
            <button
              id="collapse-button"
              class="icon-button"
              type="button"
              aria-label="收起当前回答目录"
              title="收起目录（Alt+Shift+O）"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <nav class="toc-nav" aria-label="当前回答章节">
            <ol id="toc-list" class="toc-list"></ol>
          </nav>
        </aside>
      `;

      document.body.appendChild(host);

      this.host = host;
      this.shadow = shadow;
      this.launcher = shadow.getElementById('launcher');
      this.panel = shadow.getElementById('panel');
      this.list = shadow.getElementById('toc-list');
      this.tocNav = shadow.querySelector('.toc-nav');
      this.countLabel = shadow.getElementById('count-label');
      this.launcherCount = shadow.getElementById('launcher-count');

      this.launcher.addEventListener('click', () => this.setCollapsed(false));
      shadow.getElementById('collapse-button').addEventListener('click', () => {
        this.setCollapsed(true);
      });

      this.list.addEventListener('click', (event) => {
        const button = event.target instanceof Element
          ? event.target.closest('button[data-heading-index]')
          : null;
        if (!(button instanceof HTMLButtonElement)) return;

        const index = Number.parseInt(button.dataset.headingIndex ?? '', 10);
        if (Number.isInteger(index)) this.jumpToHeading(index);
      });

      this.applyCollapsedState();
    }

    readCollapsedState() {
      if (!this.config.answerTocRememberCollapsedState) {
        return this.config.answerTocInitiallyCollapsed;
      }

      try {
        const stored = localStorage.getItem('cgpt-answer-toc-collapsed');
        if (stored === '1') return true;
        if (stored === '0') return false;
      } catch {
        // 某些严格隐私模式可能阻止 localStorage。
      }

      return this.config.answerTocInitiallyCollapsed;
    }

    writeCollapsedState() {
      if (!this.config.answerTocRememberCollapsedState) return;

      try {
        localStorage.setItem('cgpt-answer-toc-collapsed', this.collapsed ? '1' : '0');
      } catch {
        // 忽略存储不可用的情况。
      }
    }

    setCollapsed(collapsed) {
      this.collapsed = Boolean(collapsed);
      this.writeCollapsedState();
      this.applyCollapsedState();

      if (!this.collapsed && this.itemButtons[this.activeIndex]) {
        window.requestAnimationFrame(() => {
          const current = this.itemButtons[this.activeIndex];
          if (current) this.scrollTocItemIntoView(current);
        });
      }
    }

    applyCollapsedState() {
      if (!this.launcher || !this.panel) return;

      this.launcher.hidden = !this.collapsed;
      this.panel.hidden = this.collapsed;
      this.launcher.setAttribute('aria-expanded', String(!this.collapsed));
    }

    onScroll(event) {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      if (this.host && path.includes(this.host)) return;

      if (this.currentAnswer?.isConnected) {
        const target = event.target;

        if (this.currentScrollRoot instanceof HTMLElement) {
          const isDocumentScroll =
            target === document ||
            target === document.documentElement ||
            target === document.body ||
            target === window;

          if (target !== this.currentScrollRoot && !isDocumentScroll) return;
        } else if (target instanceof Element && !target.contains(this.currentAnswer)) {
          return;
        }
      }

      this.requestFrame(false);
    }

    onResize() {
      if (this.currentAnswer?.isConnected) {
        this.currentScrollRoot = this.findScrollRoot(this.currentAnswer);
      }
      this.updateInlineEndOffset();
      this.syncVisibility();
      this.requestFrame(true);
    }

    onKeyDown(event) {
      if (event.altKey && event.shiftKey && event.code === 'KeyO') {
        if (!this.host?.hidden) {
          event.preventDefault();
          this.setCollapsed(!this.collapsed);
        }
        return;
      }

      if (event.key === 'Escape' && !this.collapsed) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        if (this.host && path.includes(this.host)) this.setCollapsed(true);
      }
    }

    onVisibilityChange() {
      if (!document.hidden) this.requestFrame(true);
    }

    onRouteSignal() {
      window.setTimeout(() => this.resetForNavigation(), 0);
      window.setTimeout(() => this.requestFrame(true), 180);
    }

    resetForNavigation() {
      this.lastUrl = location.href;
      this.disconnectCurrentAnswer();
      this.clearToc();
      this.bindMainObserver();
      this.updateInlineEndOffset();
      this.requestFrame(true);
    }

    bindMainObserver() {
      const conversationAnchor =
        document.querySelector('[data-message-author-role="assistant"]') ||
        document.querySelector('[data-composer-surface="true"], #prompt-textarea');
      const main = conversationAnchor?.closest('main') || document.querySelector('main');
      if (!main) {
        window.clearTimeout(this.rebindTimer);
        this.rebindTimer = window.setTimeout(() => this.bindMainObserver(), 300);
        return;
      }

      if (main === this.mainElement && this.mainObserver) return;

      this.mainObserver?.disconnect();
      this.mainElement = main;
      this.mainObserver = new MutationObserver(this.onMainMutations);
      this.mainObserver.observe(main, {
        childList: true,
        subtree: true,
      });
    }

    onMainMutations(records) {
      let assistantAdded = false;

      recordLoop:
      for (const record of records) {
        if (
          this.currentAnswer?.isConnected &&
          record.target instanceof Node &&
          this.currentAnswer.contains(record.target)
        ) {
          continue;
        }

        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;

          if (
            node.matches?.('[data-message-author-role="assistant"]') ||
            node.querySelector?.('[data-message-author-role="assistant"]')
          ) {
            assistantAdded = true;
            break recordLoop;
          }
        }
      }

      if (this.currentAnswer && !this.currentAnswer.isConnected) {
        this.disconnectCurrentAnswer();
        this.clearToc();
        assistantAdded = true;
      }

      if (assistantAdded) this.requestFrame(true);
    }

    requestFrame(forceAnswerDetection) {
      this.forceAnswerDetection ||= Boolean(forceAnswerDetection);
      if (this.frameId) return;

      this.frameId = window.requestAnimationFrame((timestamp) => {
        this.frameId = 0;

        if (!this.isViewportEligible()) {
          this.syncVisibility();
          return;
        }

        const elapsedSinceDetection = timestamp - this.lastAnswerDetectionAt;
        const shouldDetect =
          this.forceAnswerDetection ||
          !this.currentAnswer?.isConnected ||
          elapsedSinceDetection >= 180;

        this.forceAnswerDetection = false;

        if (shouldDetect) {
          window.clearTimeout(this.answerDetectionTimer);
          this.answerDetectionTimer = 0;
          this.lastAnswerDetectionAt = timestamp;
          this.detectCurrentAnswer();
        } else {
          /*
           * 保留一次尾随检测。否则单次大幅跳转恰好落在节流窗口内时，
           * 如果之后没有新的 scroll 事件，目录会暂时停留在旧回答。
           */
          window.clearTimeout(this.answerDetectionTimer);
          this.answerDetectionTimer = window.setTimeout(() => {
            this.answerDetectionTimer = 0;
            this.requestFrame(true);
          }, Math.max(0, Math.ceil(180 - elapsedSinceDetection)));
        }

        this.updateActiveHeading();
      });
    }

    detectCurrentAnswer() {
      const answer = this.findAnswerAtViewport();

      if (answer && answer !== this.currentAnswer) {
        this.setCurrentAnswer(answer);
      } else if (this.currentAnswer && !this.currentAnswer.isConnected) {
        this.disconnectCurrentAnswer();
        this.clearToc();
      }
    }

    findAnswerAtViewport() {
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      if (width < 1 || height < 1) return null;

      const yRatios = [
        this.config.answerTocActiveLineRatio,
        0.5,
        0.68,
        0.16,
        0.82,
      ];
      const scores = new Map();

      const sampleAtX = (xRatio) => {
        const x = Math.min(width - 1, Math.max(0, width * xRatio));

        for (const yRatio of yRatios) {
          const y = Math.min(height - 1, Math.max(0, height * yRatio));
          const element = document.elementFromPoint(x, y);
          const answer = element?.closest?.('[data-message-author-role="assistant"]');
          if (!answer) continue;

          const verticalWeight =
            1 / (0.18 + Math.abs(yRatio - this.config.answerTocActiveLineRatio));
          const currentBonus = answer === this.currentAnswer ? 0.15 : 0;
          scores.set(answer, (scores.get(answer) ?? 0) + verticalWeight + currentBonus);
        }
      };

      /* 主内容通常位于视口中线；只有中线被遮挡时才取两侧后备点。 */
      sampleAtX(0.5);
      if (scores.size === 0) {
        sampleAtX(0.42);
        sampleAtX(0.58);
      }

      let bestAnswer = null;
      let bestScore = -Infinity;

      for (const [answer, score] of scores) {
        if (score > bestScore) {
          bestAnswer = answer;
          bestScore = score;
        }
      }

      if (bestAnswer) return bestAnswer;

      /*
       * 只有当前回答已离开视口或不存在时，才执行可见区域后备扫描；
       * 正常滚动路径不会遍历全部历史消息。
       */
      let currentStillVisible = false;
      if (this.currentAnswer?.isConnected) {
        const rect = this.currentAnswer.getBoundingClientRect();
        currentStillVisible = rect.bottom > 0 && rect.top < height;
      }

      if (!currentStillVisible) {
        let bestVisiblePixels = 0;
        for (const answer of document.querySelectorAll(ASSISTANT_SELECTOR)) {
          const rect = answer.getBoundingClientRect();
          const visiblePixels = Math.max(
            0,
            Math.min(rect.bottom, height) - Math.max(rect.top, 0),
          );

          if (visiblePixels > bestVisiblePixels) {
            bestVisiblePixels = visiblePixels;
            bestAnswer = answer;
          }
        }
      }

      return bestAnswer;
    }

    setCurrentAnswer(answer) {
      this.disconnectCurrentAnswer();

      this.currentAnswer = answer;
      this.currentContentRoot = answer;
      this.currentScrollRoot = this.findScrollRoot(answer);
      this.lastScrollTop = this.getScrollTop();

      this.answerObserver = new MutationObserver(this.onAnswerMutations);
      this.answerObserver.observe(answer, {
        childList: true,
        subtree: true,
      });

      this.rebuildToc();
      this.updateInlineEndOffset();
    }

    disconnectCurrentAnswer() {
      this.answerObserver?.disconnect();
      this.answerObserver = null;
      this.headingTextObserver?.disconnect();
      this.headingTextObserver = null;
      this.currentAnswer = null;
      this.currentContentRoot = null;
      this.currentScrollRoot = null;
      this.activeIndex = -1;
      this.lastScrollTop = 0;
      window.clearTimeout(this.answerDetectionTimer);
      this.answerDetectionTimer = 0;
      window.clearTimeout(this.rebuildTimer);
      this.rebuildTimer = 0;
    }

    onAnswerMutations(records) {
      let touchesHeading = false;

      for (const record of records) {
        if (record.type !== 'childList') continue;

        if (
          record.target instanceof Element &&
          record.target.closest(this.config.answerTocHeadingSelector)
        ) {
          touchesHeading = true;
          break;
        }

        const changedNodes = [...record.addedNodes, ...record.removedNodes];
        for (const node of changedNodes) {
          if (!(node instanceof Element)) continue;

          if (
            node.matches?.(this.config.answerTocHeadingSelector) ||
            node.querySelector?.(this.config.answerTocHeadingSelector)
          ) {
            touchesHeading = true;
            break;
          }
        }

        if (touchesHeading) break;
      }

      if (touchesHeading) this.scheduleTocRebuild();
    }

    scheduleTocRebuild() {
      window.clearTimeout(this.rebuildTimer);
      this.rebuildTimer = window.setTimeout(() => {
        this.rebuildTimer = 0;
        this.rebuildToc();
      }, 180);
    }

    rebuildToc() {
      if (!this.currentAnswer?.isConnected || !this.currentContentRoot) {
        this.clearToc();
        return;
      }

      this.headingTextObserver?.disconnect();

      const headings = [];
      const hasMarkdownRoot =
        this.currentAnswer.matches('.markdown') ||
        Boolean(this.currentAnswer.querySelector('.markdown'));
      const nodes = this.currentContentRoot.querySelectorAll(
        this.config.answerTocHeadingSelector,
      );

      for (const element of nodes) {
        if (!(element instanceof HTMLElement)) continue;
        if (element.closest('[hidden], [aria-hidden="true"]')) continue;
        if (hasMarkdownRoot && !element.closest('.markdown')) continue;
        if (element.closest('[data-message-author-role="assistant"]') !== this.currentAnswer) {
          continue;
        }

        const fullLabel = this.normalizeHeadingText(element.textContent ?? '');
        if (!fullLabel) continue;

        headings.push({
          element,
          level: Number.parseInt(element.tagName.slice(1), 10) || 2,
          fullLabel,
          label: this.truncateLabel(fullLabel),
        });
      }

      this.headings = headings;
      this.observeHeadingText();
      this.renderTocItems();
      const nextActiveIndex = this.findActiveIndexBinary();
      this.activeIndex = -1;
      this.applyActiveIndex(nextActiveIndex, false);
      this.syncVisibility();
    }

    observeHeadingText() {
      this.headingTextObserver?.disconnect();
      this.headingTextObserver = null;
      if (!this.headings.length) return;

      this.headingTextObserver = new MutationObserver(() => {
        this.scheduleTocRebuild();
      });

      for (const heading of this.headings) {
        this.headingTextObserver.observe(heading.element, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    }

    normalizeHeadingText(text) {
      return text.replace(/\s+/g, ' ').trim();
    }

    truncateLabel(label) {
      const max = this.config.answerTocMaxLabelLength;
      if (label.length <= max) return label;
      return `${label.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
    }

    renderTocItems() {
      if (!this.list) return;

      const fragment = document.createDocumentFragment();
      this.itemButtons = [];

      this.headings.forEach((heading, index) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        const label = document.createElement('span');

        button.type = 'button';
        button.className = 'toc-item';
        button.dataset.headingIndex = String(index);
        button.dataset.level = String(heading.level);
        button.dataset.active = 'false';
        button.title = heading.fullLabel;

        label.className = 'toc-item-label';
        label.textContent = heading.label;

        button.appendChild(label);
        item.appendChild(button);
        fragment.appendChild(item);
        this.itemButtons.push(button);
      });

      this.list.replaceChildren(fragment);

      const count = this.headings.length;
      if (this.countLabel) this.countLabel.textContent = `${count} 节`;
      if (this.launcherCount) this.launcherCount.textContent = String(count);
    }

    clearToc() {
      this.headings = [];
      this.itemButtons = [];
      this.activeIndex = -1;
      this.list?.replaceChildren();
      if (this.countLabel) this.countLabel.textContent = '0 节';
      if (this.launcherCount) this.launcherCount.textContent = '0';
      this.syncVisibility();
    }

    isViewportEligible() {
      return (
        this.config.answerTocMinViewportWidth <= 0 ||
        document.documentElement.clientWidth >= this.config.answerTocMinViewportWidth
      );
    }

    syncVisibility() {
      if (!this.host) return;

      const wasHidden = this.host.hidden;
      this.host.hidden = !this.isViewportEligible() || this.headings.length === 0;

      if (!this.host.hidden) {
        this.applyCollapsedState();

        if (wasHidden && !this.collapsed && this.itemButtons[this.activeIndex]) {
          window.requestAnimationFrame(() => {
            const current = this.itemButtons[this.activeIndex];
            if (current) this.scrollTocItemIntoView(current);
          });
        }
      }
    }

    jumpToHeading(index) {
      const heading = this.headings[index];
      if (!heading?.element?.isConnected) return;

      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const behavior =
        this.config.answerTocSmoothScroll && !reduceMotion ? 'smooth' : 'auto';

      this.applyActiveIndex(index, true);
      heading.element.scrollIntoView({
        behavior,
        block: 'start',
        inline: 'nearest',
      });
    }

    updateActiveHeading() {
      if (!this.headings.length || !this.currentAnswer?.isConnected) return;

      const lineY = this.getActiveLineViewportY();
      const currentScrollTop = this.getScrollTop();
      const viewportSpan = this.getScrollViewportSpan();
      const largeJump = Math.abs(currentScrollTop - this.lastScrollTop) > viewportSpan * 0.8;
      this.lastScrollTop = currentScrollTop;

      let index = this.activeIndex;
      if (index < 0 || index >= this.headings.length || largeJump) {
        index = this.findActiveIndexBinary(lineY);
      } else {
        while (
          index + 1 < this.headings.length &&
          this.headings[index + 1].element.getBoundingClientRect().top <= lineY
        ) {
          index += 1;
        }

        while (
          index > 0 &&
          this.headings[index].element.getBoundingClientRect().top > lineY
        ) {
          index -= 1;
        }
      }

      this.applyActiveIndex(index, false);
    }

    findActiveIndexBinary(lineY = this.getActiveLineViewportY()) {
      if (!this.headings.length) return -1;

      if (this.headings[0].element.getBoundingClientRect().top > lineY) return 0;

      let low = 0;
      let high = this.headings.length - 1;
      let best = 0;

      while (low <= high) {
        const middle = (low + high) >> 1;
        const top = this.headings[middle].element.getBoundingClientRect().top;

        if (top <= lineY) {
          best = middle;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }

      return best;
    }

    applyActiveIndex(index, ensureVisible) {
      if (!Number.isInteger(index) || index < 0 || index >= this.itemButtons.length) {
        return;
      }

      if (this.activeIndex === index && !ensureVisible) return;

      const previous = this.itemButtons[this.activeIndex];
      if (previous) {
        previous.dataset.active = 'false';
        previous.removeAttribute('aria-current');
      }

      this.activeIndex = index;
      const current = this.itemButtons[index];
      if (!current) return;

      current.dataset.active = 'true';
      current.setAttribute('aria-current', 'location');

      if (ensureVisible || !this.collapsed) {
        this.scrollTocItemIntoView(current);
      }
    }

    scrollTocItemIntoView(button) {
      if (!(this.tocNav instanceof HTMLElement)) return;

      const navRect = this.tocNav.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const padding = 5;

      if (buttonRect.top < navRect.top + padding) {
        this.tocNav.scrollTop += buttonRect.top - navRect.top - padding;
      } else if (buttonRect.bottom > navRect.bottom - padding) {
        this.tocNav.scrollTop += buttonRect.bottom - navRect.bottom + padding;
      }
    }

    getActiveLineViewportY() {
      const ratio = Math.min(0.9, Math.max(0.05, this.config.answerTocActiveLineRatio));

      if (this.currentScrollRoot instanceof HTMLElement) {
        const rect = this.currentScrollRoot.getBoundingClientRect();
        const top = Math.max(0, rect.top);
        const bottom = Math.min(window.innerHeight, rect.bottom);
        const height = Math.max(1, bottom - top);
        return top + height * ratio;
      }

      return window.innerHeight * ratio;
    }

    findScrollRoot(element) {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent === document.body || parent === document.documentElement) break;

        const style = getComputedStyle(parent);
        if (
          /^(auto|scroll|overlay)$/.test(style.overflowY) &&
          parent.scrollHeight > parent.clientHeight + 4
        ) {
          return parent;
        }
      }

      return null;
    }

    getScrollTop() {
      if (this.currentScrollRoot instanceof HTMLElement) {
        return this.currentScrollRoot.scrollTop;
      }

      return window.scrollY || document.documentElement.scrollTop || 0;
    }

    getScrollViewportSpan() {
      if (this.currentScrollRoot instanceof HTMLElement) {
        return Math.max(1, this.currentScrollRoot.clientHeight);
      }

      return Math.max(1, window.innerHeight);
    }

    getOfficialNavContainer() {
      const item = document.querySelector('button[data-toc-item-index]');
      if (!item) return null;

      for (let element = item.parentElement; element; element = element.parentElement) {
        if (getComputedStyle(element).position === 'fixed') return element;
      }

      return null;
    }

    updateInlineEndOffset() {
      if (!this.host) return;

      let offset = this.config.answerTocFallbackInlineEndPx;
      const container = this.getOfficialNavContainer();

      if (container) {
        const rect = container.getBoundingClientRect();
        const direction = getComputedStyle(document.documentElement).direction;
        const occupiedFromInlineEnd = direction === 'rtl'
          ? rect.right
          : window.innerWidth - rect.left;

        offset = Math.max(
          offset,
          Math.ceil(occupiedFromInlineEnd + this.config.answerTocOfficialNavGapPx),
        );
      }

      this.host.style.setProperty('--cgpt-answer-toc-inline-end', `${offset}px`);
    }
  }

  const startAnswerToc = () => {
    const controller = new AnswerTocController(CONFIG);
    controller.start();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAnswerToc, { once: true });
  } else {
    startAnswerToc();
  }
})();
