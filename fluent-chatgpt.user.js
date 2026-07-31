// ==UserScript==
// @name         ChatGPT 长对话性能优化、导航与快速搜索
// @namespace    local.chatgpt
// @version      2.7.0
// @description  优化长对话渲染，提供问答/章节导航与章节、段落快速搜索
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

        // 目录与折叠按钮的背景透明度，范围 0～1。
        answerTocPanelOpacity: 0.72,
        answerTocLauncherOpacity: 0.68,

        // 半透明背景后的模糊强度。默认关闭，避免固定模糊层增加绘制开销。
        answerTocBackdropBlurPx: 0,

        // 折叠按钮悬停多久后临时展开；光标离开整个面板后多久自动收起。
        answerTocHoverExpandDelayMs: 180,
        answerTocHoverCollapseDelayMs: 220,

        // 一级目录：整段对话中的用户提问；二级目录：当前回答里的 H1/H2。
        enableConversationToc: true,
        hideOfficialConversationToc: true,
        answerTocInitialView: 'headings', // 可选：'conversation'、'headings' 或 'search'
        answerTocRememberView: true,

        // 快速搜索：检索当前页面已经挂载的 Assistant 章节与段落。
        enableQuickSearch: true,

        // 'conversation' 检索当前页面全部已加载回答；'current-answer' 只检索当前回答。
        quickSearchScope: 'conversation',

        // 输入防抖、最短关键词、最多显示结果数及结果摘要长度。
        quickSearchDebounceMs: 140,
        quickSearchMinQueryLength: 1,
        quickSearchMaxResults: 80,
        quickSearchSnippetLength: 180,

        // 索引范围与分片大小。代码块默认不加入索引，避免超长代码造成噪音。
        quickSearchHeadingSelector: 'h1, h2, h3, h4, h5, h6',
        quickSearchParagraphSelector: 'p, li, blockquote, pre, table tr',
        quickSearchIncludeCodeBlocks: false,
        quickSearchMinBlockTextLength: 2,
        quickSearchMaxIndexedBlocks: 8000,
        quickSearchIndexChunkSize: 160,

        // 搜索跳转后的顶部留白及目标短暂定位提示。
        quickSearchScrollOffsetPx: 96,
        quickSearchHighlightTarget: true,

        // 问答预览最多显示 3 行；完整提问仍保留在鼠标悬停提示中。
        // 设为 0 可取消按行限制。
        conversationTocPreviewMaxLines: 3,

        // 超长提问最多保留 240 个字符；设为 0 可取消按字符限制。
        conversationTocMaxLabelLength: 240,

        // 问答跳转后，目标提问与滚动视口顶部之间保留的距离。
        conversationTocScrollOffsetPx: 88,

        // 隐藏官方问答导航后，自定义目录距页面右侧的默认距离。
        answerTocStandaloneInlineEndPx: 20,

        // 拖动后是否记住位置，以及控件与视口边缘的最小距离。
        answerTocRememberPosition: true,
        answerTocDragViewportMarginPx: 8,

        // 面板四角缩放范围及尺寸持久化。缩放会自动转为手动定位。
        answerTocRememberSize: true,
        answerTocMinWidthPx: 220,
        answerTocMaxWidthPx: 560,
        answerTocMinHeightPx: 170,
        answerTocMaxHeightPx: 760,
    });

    const TURN_SELECTOR = 'main [data-testid^="conversation-turn-"]';
    const ASSISTANT_SELECTOR = 'main [data-message-author-role="assistant"]';
    const USER_SELECTOR = 'main [data-message-author-role="user"]';

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

    if (CONFIG.hideOfficialConversationToc) {
        css.push(`
      /*
       * 只在视觉和指针层面隐藏官方问答导航，不使用 display:none。
       * 这样仍可调用其原生点击逻辑处理尚未挂载的远端历史轮次。
       */
      [data-cgpt-native-conversation-toc-hidden] {
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `);
    }

    if (CONFIG.enableAnswerToc) {
        css.push(`
      /* 让目录与搜索跳转后的目标和页面顶部保留适当间距。 */
      ${ASSISTANT_SELECTOR} :is(h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, tr) {
        scroll-margin-block-start: 96px;
      }

      /*
       * 远距离跳转时临时完整布局目标轮次，减少 content-visibility
       * 使用估算高度而导致的落点偏差。脚本会在定位稳定后移除此属性。
       */
      [data-cgpt-conversation-jump-target] {
        content-visibility: visible !important;
        contain-intrinsic-size: none !important;
      }

      /* 搜索跳转后短暂标出目标，不改变文档布局。 */
      [data-cgpt-search-jump-target] {
        outline: 2px solid color-mix(in srgb, currentColor 32%, transparent) !important;
        outline-offset: 4px !important;
        border-radius: 4px !important;
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
            this.conversationList = null;
            this.conversationNav = null;
            this.headingEmptyState = null;
            this.conversationEmptyState = null;
            this.countLabel = null;
            this.launcherCount = null;
            this.launcherMode = null;
            this.panelHeader = null;
            this.collapseButton = null;
            this.viewConversationButton = null;
            this.viewHeadingsButton = null;
            this.viewSearchButton = null;
            this.viewConversationCount = null;
            this.viewHeadingsCount = null;
            this.viewSearchCount = null;
            this.searchView = null;
            this.searchNav = null;
            this.searchList = null;
            this.searchInput = null;
            this.searchClearButton = null;
            this.searchStatus = null;
            this.searchEmptyState = null;
            this.resizeHandles = [];

            this.currentAnswer = null;
            this.currentContentRoot = null;
            this.currentScrollRoot = null;
            this.headings = [];
            this.itemButtons = [];
            this.activeIndex = -1;

            this.searchIndex = [];
            this.searchResults = [];
            this.searchResultButtons = [];
            this.activeSearchResultIndex = -1;
            this.searchTotalMatches = 0;
            this.searchQuery = '';
            this.searchTerms = [];
            this.searchIndexBuilt = false;
            this.searchIndexDirty = true;
            this.searchIndexRevision = 0;
            this.searchIndexing = false;
            this.searchDebounceTimer = 0;
            this.searchBuildToken = 0;
            this.searchBuildHandle = 0;
            this.searchBuildHandleType = '';
            this.searchJumpToken = 0;
            this.searchJumpTimers = new Set();
            this.searchHighlightElement = null;
            this.searchHighlightTimer = 0;
            this.searchConversationMapSignature = '';

            this.conversationItems = [];
            this.conversationItemButtons = [];
            this.activeConversationIndex = -1;
            this.lastConversationSignature = '';
            this.officialNavContainer = null;
            this.conversationLabelCache = new Map();
            this.conversationCacheIdentityByIndex = new Map();
            this.conversationCacheIndexByIdentity = new Map();
            this.maxObservedOfficialLogicalIndex = -1;
            this.pendingConversationLogicalIndex = -1;
            this.pendingConversationUntil = 0;
            this.conversationJumpToken = 0;
            this.conversationJumpTimers = new Set();
            this.conversationJumpRevealElement = null;
            this.conversationJumpRevealTimer = 0;

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
            this.conversationRebuildTimer = 0;
            this.rebindTimer = 0;
            this.healthTimer = 0;
            this.lastUrl = location.href;

            this.hoverExpandTimer = 0;
            this.hoverCollapseTimer = 0;
            this.launcherHovered = false;
            this.transientHoverOpen = false;

            /*
             * 悬浮展开时，面板右上角的“收起”按钮可能正好覆盖折叠启动器原位置。
             * 记录启动器矩形，才能把用户在原位置的第一次点击识别为“固定展开”，
             * 而不是误触面板里的收起按钮。
             */
            this.transientHoverOriginRect = null;
            this.suppressTransientOriginClick = false;
            this.suppressTransientOriginClickRect = null;
            this.suppressTransientOriginClickTimer = 0;

            this.dragState = null;
            this.dragFrameId = 0;
            this.pendingDragPoint = null;
            this.suppressNextLauncherClick = false;
            this.rootStyleBeforeDrag = null;

            this.resizeState = null;
            this.resizeFrameId = 0;
            this.pendingResizePoint = null;
            this.rootStyleBeforeResize = null;

            this.savedPosition = this.readPositionState();
            this.positionMode = this.savedPosition ? 'manual' : 'auto';
            this.savedSize = this.readSizeState();
            this.sizeMode = this.savedSize ? 'manual' : 'auto';
            this.collapsed = this.readCollapsedState();
            this.activeView = this.readViewState();

            this.onScroll = this.onScroll.bind(this);
            this.onResize = this.onResize.bind(this);
            this.onKeyDown = this.onKeyDown.bind(this);
            this.onVisibilityChange = this.onVisibilityChange.bind(this);
            this.onRouteSignal = this.onRouteSignal.bind(this);
            this.onMainMutations = this.onMainMutations.bind(this);
            this.onAnswerMutations = this.onAnswerMutations.bind(this);
            this.onLauncherPointerEnter = this.onLauncherPointerEnter.bind(this);
            this.onLauncherPointerLeave = this.onLauncherPointerLeave.bind(this);
            this.onPanelPointerEnter = this.onPanelPointerEnter.bind(this);
            this.onPanelPointerLeave = this.onPanelPointerLeave.bind(this);
            this.onPanelClickCapture = this.onPanelClickCapture.bind(this);
            this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
            this.onDocumentClick = this.onDocumentClick.bind(this);
            this.onDragPointerMove = this.onDragPointerMove.bind(this);
            this.onDragPointerEnd = this.onDragPointerEnd.bind(this);
            this.onDragPointerCancel = this.onDragPointerCancel.bind(this);
            this.onResizePointerMove = this.onResizePointerMove.bind(this);
            this.onResizePointerEnd = this.onResizePointerEnd.bind(this);
            this.onResizePointerCancel = this.onResizePointerCancel.bind(this);
            this.onSearchInput = this.onSearchInput.bind(this);
            this.onSearchKeyDown = this.onSearchKeyDown.bind(this);
        }

        start() {
            if (!document.body) return;

            this.createUi();
            this.bindMainObserver();
            this.syncOfficialConversationNav();
            this.rebuildConversationToc();
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
            document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
            document.addEventListener('click', this.onDocumentClick, true);
            document.addEventListener('visibilitychange', this.onVisibilityChange);

            if (window.navigation && typeof window.navigation.addEventListener === 'function') {
                window.navigation.addEventListener('navigatesuccess', this.onRouteSignal);
            }

            this.healthTimer = window.setInterval(() => {
                if (document.hidden) return;

                if (location.href !== this.lastUrl || !this.mainElement?.isConnected) {
                    this.resetForNavigation();
                    return;
                }

                this.syncOfficialConversationNav();
                this.refreshConversationTocIfNeeded();
            }, 1600);

            this.requestFrame(true);
        }
        createUi() {
            document.querySelector('#cgpt-answer-toc-host')?.remove();

            const clampUnit = (value, fallback) => {
                const number = Number(value);
                return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : fallback;
            };
            const panelOpacity = clampUnit(this.config.answerTocPanelOpacity, 0.72);
            const launcherOpacity = clampUnit(this.config.answerTocLauncherOpacity, 0.68);
            const panelOpacityPercent = `${Math.round(panelOpacity * 100)}%`;
            const launcherOpacityPercent = `${Math.round(launcherOpacity * 100)}%`;
            const backdropBlur = Math.max(0, Number(this.config.answerTocBackdropBlurPx) || 0);
            const minWidth = Math.max(160, Number(this.config.answerTocMinWidthPx) || 220);
            const minHeight = Math.max(120, Number(this.config.answerTocMinHeightPx) || 170);
            const conversationPreviewMaxLines = Math.max(
                0,
                Math.floor(Number(this.config.conversationTocPreviewMaxLines) || 0),
            );
            const conversationPreviewCss = conversationPreviewMaxLines > 0
                ? `display: -webkit-box;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: ${conversationPreviewMaxLines};`
                : `display: block;
            overflow: visible;
            -webkit-box-orient: initial;
            -webkit-line-clamp: unset;`;
            const backdropFilterCss = backdropBlur > 0
                ? `-webkit-backdrop-filter: blur(${backdropBlur}px) saturate(118%);
            backdrop-filter: blur(${backdropBlur}px) saturate(118%);`
                : '';
            const searchEnabled = Boolean(this.config.enableQuickSearch);
            const viewColumnCount = searchEnabled ? 3 : 2;
            const searchTabHtml = searchEnabled
                ? `<button id="view-search" class="view-tab" type="button" role="tab" data-view="search" aria-selected="false">
              <span>搜索</span><span id="view-search-count" class="view-count">0</span>
            </button>`
                : '';
            const searchViewHtml = searchEnabled
                ? `<section id="search-view" class="search-view" aria-label="快速搜索" hidden>
              <div class="search-toolbar">
                <label class="search-input-wrap" for="quick-search-input">
                  <svg class="search-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
                    <path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                  <input
                    id="quick-search-input"
                    class="search-input"
                    type="search"
                    autocomplete="off"
                    autocorrect="off"
                    autocapitalize="off"
                    spellcheck="false"
                    placeholder="搜索章节和段落"
                    aria-label="搜索章节和段落"
                    aria-controls="search-list"
                  />
                  <button id="quick-search-clear" class="search-clear" type="button" aria-label="清空搜索" title="清空搜索" hidden>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    </svg>
                  </button>
                </label>
                <div id="search-status" class="search-status" aria-live="polite">输入关键词，检索当前已加载的章节和段落</div>
              </div>
              <nav id="search-nav" class="toc-nav search-results-nav" aria-label="搜索结果">
                <div id="search-empty" class="empty-state">输入关键词开始搜索</div>
                <ol id="search-list" class="toc-list"></ol>
              </nav>
            </section>`
                : '';

            const host = document.createElement('div');
            host.id = 'cgpt-answer-toc-host';
            host.hidden = true;
            host.setAttribute('data-cgpt-answer-toc', '');
            host.dataset.dockSide = 'right';

            const shadow = host.attachShadow({ mode: 'open' });
            shadow.innerHTML = `
        <style>
          :host {
            all: initial;
            position: fixed !important;
            inset-inline-end: var(--cgpt-answer-toc-inline-end, 20px) !important;
            top: 50% !important;
            z-index: 30 !important;
            width: max-content !important;
            height: max-content !important;
            display: block !important;
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

          :host([data-position-mode="manual"]) {
            inset-inline: auto !important;
            right: auto !important;
            bottom: auto !important;
            left: var(--cgpt-answer-toc-left, 8px) !important;
            top: var(--cgpt-answer-toc-top, 8px) !important;
            transform: none !important;
          }

          :host([hidden]) {
            display: none !important;
          }

          *, *::before, *::after {
            box-sizing: border-box;
          }

          button,
          input {
            font: inherit;
          }

          .launcher,
          .panel {
            pointer-events: auto;
            ${backdropFilterCss}
          }

          .launcher {
            display: inline-flex;
            min-width: 42px;
            height: 38px;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 0 9px;
            border: 1px solid var(--border-light, rgba(0, 0, 0, 0.14));
            border-radius: 12px;
            background: rgba(255, 255, 255, ${launcherOpacity});
            background: color-mix(
              in srgb,
              var(--main-surface-primary, var(--bg-primary, #ffffff)) ${launcherOpacityPercent},
              transparent
            );
            color: var(--text-secondary, #444444);
            box-shadow: 0 6px 22px rgba(0, 0, 0, 0.14);
            cursor: grab;
            touch-action: none;
            user-select: none;
          }

          .launcher:hover {
            background: rgba(244, 244, 244, ${launcherOpacity});
            background: color-mix(
              in srgb,
              var(--main-surface-secondary, var(--bg-secondary, #f4f4f4)) ${launcherOpacityPercent},
              transparent
            );
            color: var(--text-primary, #161616);
          }

          .launcher:focus-visible,
          .icon-button:focus-visible,
          .view-tab:focus-visible,
          .toc-item:focus-visible,
          .search-clear:focus-visible {
            outline: 2px solid var(--text-primary, #161616);
            outline-offset: 2px;
          }

          .launcher svg,
          .icon-button svg {
            width: 17px;
            height: 17px;
            flex: none;
          }

          .launcher-mode {
            min-width: 1em;
            color: var(--text-tertiary, #777777);
            font-size: 10px;
            font-weight: 600;
          }

          .launcher-count {
            min-width: 1.3em;
            text-align: center;
            font-size: 11px;
            font-variant-numeric: tabular-nums;
          }

          .panel {
            position: relative;
            width: min(var(--cgpt-answer-toc-width, 300px), calc(100vw - 16px));
            max-height: min(68vh, 660px, calc(100vh - 16px));
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid var(--border-light, rgba(0, 0, 0, 0.14));
            border-radius: 14px;
            background: rgba(255, 255, 255, ${panelOpacity});
            background: color-mix(
              in srgb,
              var(--main-surface-primary, var(--bg-primary, #ffffff)) ${panelOpacityPercent},
              transparent
            );
            box-shadow: 0 10px 34px rgba(0, 0, 0, 0.16);
          }

          :host([data-size-mode="manual"]) .panel {
            width: var(--cgpt-answer-toc-width, 300px);
            height: var(--cgpt-answer-toc-height, 420px);
            min-width: ${minWidth}px;
            min-height: ${minHeight}px;
            max-width: calc(100vw - 16px);
            max-height: calc(100vh - 16px);
          }

          .panel[hidden],
          .launcher[hidden],
          .toc-nav[hidden],
          .search-view[hidden],
          .empty-state[hidden],
          .search-clear[hidden] {
            display: none !important;
          }

          .panel-header {
            min-height: 42px;
            display: flex;
            flex: none;
            align-items: center;
            gap: 8px;
            padding-block: 7px;
            padding-inline-start: 9px;
            padding-inline-end: 24px;
            border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.11));
            cursor: grab;
            touch-action: none;
            user-select: none;
          }

          .drag-grip {
            width: 12px;
            height: 22px;
            display: grid;
            flex: none;
            grid-template-columns: repeat(2, 3px);
            grid-auto-rows: 3px;
            place-content: center;
            gap: 3px;
            color: var(--text-tertiary, #777777);
            opacity: 0.75;
          }

          .drag-grip::before,
          .drag-grip::after {
            width: 3px;
            height: 3px;
            border-radius: 50%;
            background: currentColor;
            box-shadow: 0 6px currentColor, 0 -6px currentColor;
            content: "";
          }

          :host([data-dragging]) .launcher,
          :host([data-dragging]) .panel-header {
            cursor: grabbing;
          }

          :host([data-resizing]) .panel {
            user-select: none;
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
            position: relative;
            z-index: 4;
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

          .view-tabs {
            display: grid;
            flex: none;
            grid-template-columns: repeat(${viewColumnCount}, minmax(0, 1fr));
            gap: 4px;
            padding: 5px 6px;
            border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.09));
          }

          .view-tab {
            min-width: 0;
            min-height: 31px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 5px 8px;
            border: 0;
            border-radius: 8px;
            background: transparent;
            color: var(--text-secondary, #4a4a4a);
            cursor: pointer;
          }

          .view-tab:hover {
            background: color-mix(
              in srgb,
              var(--main-surface-secondary, var(--bg-secondary, #f3f3f3)) 74%,
              transparent
            );
            color: var(--text-primary, #161616);
          }

          .view-tab[aria-selected="true"] {
            background: var(--main-surface-secondary, var(--bg-secondary, #ededed));
            color: var(--text-primary, #111111);
            font-weight: 600;
          }

          .view-count {
            min-width: 1.6em;
            padding: 1px 5px;
            border-radius: 999px;
            background: color-mix(in srgb, currentColor 10%, transparent);
            font-size: 10px;
            font-variant-numeric: tabular-nums;
            font-weight: 500;
          }

          .toc-nav {
            min-height: 0;
            flex: 1;
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

          /* 长提问由目录区域滚动，不压缩单个条目的实际高度。 */
          .toc-list > li {
            min-width: 0;
            flex: 0 0 auto;
          }

          .toc-item {
            position: relative;
            width: 100%;
            min-height: 30px;
            display: flex;
            align-items: flex-start;
            gap: 7px;
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
            background: color-mix(
              in srgb,
              var(--main-surface-secondary, var(--bg-secondary, #f3f3f3)) 82%,
              transparent
            );
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

          .prompt-index {
            width: 2.4em;
            flex: none;
            padding-top: 1px;
            color: var(--text-tertiary, #777777);
            font-size: 10.5px;
            font-variant-numeric: tabular-nums;
            text-align: end;
          }

          .toc-item-label {
            min-width: 0;
            display: -webkit-box;
            flex: 1;
            overflow: hidden;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
            overflow-wrap: anywhere;
          }

          /*
           * 问答级目录只在提问过长时按配置限制行数和字符数；
           * 完整文本仍写入按钮 title。章节标题继续保持两行预览。
           */
          #conversation-list .toc-item {
            height: auto;
            flex: 0 0 auto;
          }

          #conversation-list .toc-item-label {
            ${conversationPreviewCss}
            max-height: none;
            text-overflow: clip;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .search-view {
            min-height: 0;
            display: flex;
            flex: 1;
            flex-direction: column;
          }

          .search-toolbar {
            flex: none;
            padding: 7px 8px 6px;
            border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.09));
          }

          .search-input-wrap {
            min-width: 0;
            height: 34px;
            display: flex;
            align-items: center;
            gap: 6px;
            padding-inline: 9px 5px;
            border: 1px solid var(--border-light, rgba(0, 0, 0, 0.14));
            border-radius: 9px;
            background: color-mix(
              in srgb,
              var(--main-surface-secondary, var(--bg-secondary, #f3f3f3)) 70%,
              transparent
            );
            color: var(--text-tertiary, #777777);
          }

          .search-input-wrap:focus-within {
            border-color: color-mix(in srgb, var(--text-primary, #161616) 36%, transparent);
            color: var(--text-secondary, #444444);
          }

          .search-icon {
            width: 16px;
            height: 16px;
            flex: none;
          }

          .search-input {
            min-width: 0;
            height: 100%;
            flex: 1;
            padding: 0;
            border: 0;
            outline: 0;
            background: transparent;
            color: var(--text-primary, #161616);
            font-size: 12.5px;
          }

          .search-input::-webkit-search-cancel-button {
            display: none;
          }

          .search-input::placeholder {
            color: var(--text-tertiary, #777777);
            opacity: 0.9;
          }

          .search-clear {
            width: 25px;
            height: 25px;
            display: inline-flex;
            flex: none;
            align-items: center;
            justify-content: center;
            padding: 0;
            border: 0;
            border-radius: 7px;
            background: transparent;
            color: var(--text-tertiary, #777777);
            cursor: pointer;
          }

          .search-clear:hover {
            background: color-mix(in srgb, currentColor 10%, transparent);
            color: var(--text-primary, #161616);
          }

          .search-clear svg {
            width: 15px;
            height: 15px;
          }

          .search-status {
            min-height: 16px;
            margin-top: 5px;
            overflow: hidden;
            color: var(--text-tertiary, #777777);
            font-size: 10.5px;
            line-height: 1.35;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .search-results-nav {
            padding-top: 5px;
          }

          .search-result {
            display: block;
            padding-block: 7px;
          }

          .search-result-meta {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 3px;
            color: var(--text-tertiary, #777777);
            font-size: 10.5px;
          }

          .search-result-kind {
            flex: none;
            padding: 1px 5px;
            border-radius: 999px;
            background: color-mix(in srgb, currentColor 10%, transparent);
            color: var(--text-secondary, #555555);
            font-weight: 600;
          }

          .search-result-context {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .search-result-snippet {
            display: -webkit-box;
            overflow: hidden;
            color: var(--text-secondary, #444444);
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 3;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
          }

          .search-result mark {
            padding: 0 1px;
            border-radius: 2px;
            background: color-mix(in srgb, #f4c542 42%, transparent);
            color: inherit;
          }

          .empty-state {
            margin: 6px;
            padding: 18px 12px;
            border: 1px dashed var(--border-light, rgba(0, 0, 0, 0.14));
            border-radius: 10px;
            color: var(--text-tertiary, #777777);
            text-align: center;
            font-size: 12px;
          }

          /*
           * 四个角仍可缩放，但命中区域完全透明，不绘制任何角标。
           * 鼠标进入角落命中区时，仅通过系统 resize 光标提示该功能。
           */
          .resize-handle {
            position: absolute;
            z-index: 3;
            width: 18px;
            height: 18px;
            display: block;
            border: 0;
            background: transparent;
            opacity: 0;
            pointer-events: auto;
            touch-action: none;
            user-select: none;
          }

          .resize-handle::before,
          .resize-handle::after {
            display: none !important;
            content: none !important;
          }

          .resize-handle[data-resize-corner="top-left"] {
            top: 0;
            left: 0;
            cursor: nwse-resize;
          }

          .resize-handle[data-resize-corner="top-right"] {
            top: 0;
            right: 0;
            cursor: nesw-resize;
          }

          .resize-handle[data-resize-corner="bottom-left"] {
            bottom: 0;
            left: 0;
            cursor: nesw-resize;
          }

          .resize-handle[data-resize-corner="bottom-right"] {
            right: 0;
            bottom: 0;
            cursor: nwse-resize;
          }

          @media (prefers-color-scheme: dark) {
            .launcher {
              border-color: rgba(255, 255, 255, 0.14);
              background: rgba(33, 33, 33, ${launcherOpacity});
              background: color-mix(
                in srgb,
                var(--main-surface-primary, var(--bg-primary, #212121)) ${launcherOpacityPercent},
                transparent
              );
              box-shadow: 0 8px 28px rgba(0, 0, 0, 0.42);
            }

            .panel {
              border-color: rgba(255, 255, 255, 0.14);
              background: rgba(33, 33, 33, ${panelOpacity});
              background: color-mix(
                in srgb,
                var(--main-surface-primary, var(--bg-primary, #212121)) ${panelOpacityPercent},
                transparent
              );
              box-shadow: 0 8px 28px rgba(0, 0, 0, 0.42);
            }

            .panel-header,
            .view-tabs,
            .search-toolbar {
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
          aria-label="展开导航目录"
          aria-expanded="false"
          title="悬停临时展开；在目录中点击、拖动或缩放后保持展开（Alt+Shift+O）"
          hidden
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 6h14M5 12h14M5 18h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          </svg>
          <span id="launcher-mode" class="launcher-mode">章</span>
          <span id="launcher-count" class="launcher-count">0</span>
        </button>

        <aside id="panel" class="panel" aria-label="ChatGPT 导航目录" hidden>
          <div class="panel-header" title="拖动标题栏可移动目录">
            <span class="drag-grip" aria-hidden="true"></span>
            <div class="panel-title-wrap">
              <span class="panel-title">导航目录</span>
              <span id="count-label" class="count-label">0 节</span>
            </div>
            <button
              id="collapse-button"
              class="icon-button"
              type="button"
              aria-label="收起导航目录"
              title="收起目录（Alt+Shift+O）"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <div class="view-tabs" role="tablist" aria-label="目录层级">
            <button id="view-conversation" class="view-tab" type="button" role="tab" data-view="conversation" aria-selected="false">
              <span>问答</span><span id="view-conversation-count" class="view-count">0</span>
            </button>
            <button id="view-headings" class="view-tab" type="button" role="tab" data-view="headings" aria-selected="true">
              <span>章节</span><span id="view-headings-count" class="view-count">0</span>
            </button>
            ${searchTabHtml}
          </div>

          <nav id="conversation-nav" class="toc-nav" aria-label="对话问答导航" hidden>
            <div id="conversation-empty" class="empty-state" hidden>暂未找到可跳转的提问</div>
            <ol id="conversation-list" class="toc-list"></ol>
          </nav>

          <nav id="heading-nav" class="toc-nav" aria-label="当前回答章节">
            <div id="heading-empty" class="empty-state" hidden>当前回答没有 H1/H2 标题</div>
            <ol id="toc-list" class="toc-list"></ol>
          </nav>

          ${searchViewHtml}

          <span class="resize-handle" aria-hidden="true" data-resize-corner="top-left"></span>
          <span class="resize-handle" aria-hidden="true" data-resize-corner="top-right"></span>
          <span class="resize-handle" aria-hidden="true" data-resize-corner="bottom-left"></span>
          <span class="resize-handle" aria-hidden="true" data-resize-corner="bottom-right"></span>
        </aside>
      `;

            document.body.appendChild(host);

            this.host = host;
            this.shadow = shadow;
            this.launcher = shadow.getElementById('launcher');
            this.panel = shadow.getElementById('panel');
            this.list = shadow.getElementById('toc-list');
            this.tocNav = shadow.getElementById('heading-nav');
            this.conversationList = shadow.getElementById('conversation-list');
            this.conversationNav = shadow.getElementById('conversation-nav');
            this.headingEmptyState = shadow.getElementById('heading-empty');
            this.conversationEmptyState = shadow.getElementById('conversation-empty');
            this.countLabel = shadow.getElementById('count-label');
            this.launcherCount = shadow.getElementById('launcher-count');
            this.launcherMode = shadow.getElementById('launcher-mode');
            this.panelHeader = shadow.querySelector('.panel-header');
            this.collapseButton = shadow.getElementById('collapse-button');
            this.viewConversationButton = shadow.getElementById('view-conversation');
            this.viewHeadingsButton = shadow.getElementById('view-headings');
            this.viewSearchButton = shadow.getElementById('view-search');
            this.viewConversationCount = shadow.getElementById('view-conversation-count');
            this.viewHeadingsCount = shadow.getElementById('view-headings-count');
            this.viewSearchCount = shadow.getElementById('view-search-count');
            this.searchView = shadow.getElementById('search-view');
            this.searchNav = shadow.getElementById('search-nav');
            this.searchList = shadow.getElementById('search-list');
            this.searchInput = shadow.getElementById('quick-search-input');
            this.searchClearButton = shadow.getElementById('quick-search-clear');
            this.searchStatus = shadow.getElementById('search-status');
            this.searchEmptyState = shadow.getElementById('search-empty');
            this.resizeHandles = Array.from(
                shadow.querySelectorAll('[data-resize-corner]'),
            );

            host.dataset.positionMode = this.positionMode;
            host.dataset.sizeMode = this.sizeMode;
            if (this.savedPosition) {
                this.setManualPosition(
                    this.savedPosition.left,
                    this.savedPosition.top,
                    false,
                );
            }
            if (this.savedSize) {
                this.setPanelSize(this.savedSize.width, this.savedSize.height, false);
            }

            this.launcher.addEventListener('pointerenter', this.onLauncherPointerEnter);
            this.launcher.addEventListener('pointerleave', this.onLauncherPointerLeave);
            this.launcher.addEventListener('pointerdown', (event) => {
                this.beginDrag(event, 'launcher');
            });
            this.launcher.addEventListener('click', (event) => {
                if (this.suppressNextLauncherClick) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.suppressNextLauncherClick = false;
                    return;
                }
                this.setCollapsed(false, { source: 'click', persist: true });
            });

            this.panel.addEventListener('pointerenter', this.onPanelPointerEnter);
            this.panel.addEventListener('pointerleave', this.onPanelPointerLeave);
            this.panel.addEventListener('click', this.onPanelClickCapture, true);

            this.panelHeader?.addEventListener('pointerdown', (event) => {
                const target = event.target;
                if (target instanceof Element && target.closest('button, a, input, textarea, select')) {
                    return;
                }
                this.beginDrag(event, 'panel');
            });

            this.collapseButton?.addEventListener('click', () => {
                this.setCollapsed(true, { source: 'click', persist: true });
            });

            this.viewConversationButton?.addEventListener('click', () => {
                this.setActiveView('conversation', true);
            });
            this.viewHeadingsButton?.addEventListener('click', () => {
                this.setActiveView('headings', true);
            });
            this.viewSearchButton?.addEventListener('click', () => {
                this.setActiveView('search', true, { focusSearch: true });
            });

            this.searchInput?.addEventListener('input', this.onSearchInput);
            this.searchInput?.addEventListener('keydown', this.onSearchKeyDown);
            this.searchClearButton?.addEventListener('click', () => {
                this.clearSearchQuery(true);
            });
            this.searchList?.addEventListener('click', (event) => {
                const button = event.target instanceof Element
                    ? event.target.closest('button[data-search-result-index]')
                    : null;
                if (!(button instanceof HTMLButtonElement)) return;

                const index = Number.parseInt(button.dataset.searchResultIndex ?? '', 10);
                if (Number.isInteger(index)) this.jumpToSearchResult(index);
            });

            this.list.addEventListener('click', (event) => {
                const button = event.target instanceof Element
                    ? event.target.closest('button[data-heading-index]')
                    : null;
                if (!(button instanceof HTMLButtonElement)) return;

                const index = Number.parseInt(button.dataset.headingIndex ?? '', 10);
                if (Number.isInteger(index)) this.jumpToHeading(index);
            });

            this.conversationList.addEventListener('click', (event) => {
                const button = event.target instanceof Element
                    ? event.target.closest('button[data-conversation-index]')
                    : null;
                if (!(button instanceof HTMLButtonElement)) return;

                const index = Number.parseInt(button.dataset.conversationIndex ?? '', 10);
                if (Number.isInteger(index)) this.jumpToConversation(index);
            });

            for (const handle of this.resizeHandles) {
                handle.addEventListener('pointerdown', (event) => {
                    this.beginResize(event, handle.dataset.resizeCorner);
                });
            }

            this.applyActiveView();
            this.applyCollapsedState();
            this.updateViewMeta();
        }

        readPositionState() {
            if (!this.config.answerTocRememberPosition) return null;

            try {
                const raw = localStorage.getItem('cgpt-answer-toc-position-v1');
                if (!raw) return null;

                const parsed = JSON.parse(raw);
                const left = Number(parsed?.left);
                const top = Number(parsed?.top);
                if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
            } catch {
                // 忽略存储不可用或旧数据损坏的情况。
            }

            return null;
        }

        writePositionState() {
            if (!this.config.answerTocRememberPosition || this.positionMode !== 'manual') {
                return;
            }

            const left = Number.parseFloat(
                this.host?.style.getPropertyValue('--cgpt-answer-toc-left') ?? '',
            );
            const top = Number.parseFloat(
                this.host?.style.getPropertyValue('--cgpt-answer-toc-top') ?? '',
            );
            if (!Number.isFinite(left) || !Number.isFinite(top)) return;

            try {
                localStorage.setItem(
                    'cgpt-answer-toc-position-v1',
                    JSON.stringify({ left, top }),
                );
            } catch {
                // 忽略严格隐私模式下的存储错误。
            }
        }

        setManualPosition(left, top, persist = false) {
            if (!this.host || !Number.isFinite(left) || !Number.isFinite(top)) return;

            this.positionMode = 'manual';
            this.host.dataset.positionMode = 'manual';
            this.host.style.setProperty('--cgpt-answer-toc-left', `${left}px`);
            this.host.style.setProperty('--cgpt-answer-toc-top', `${top}px`);
            if (persist) this.writePositionState();
        }

        readSizeState() {
            if (!this.config.answerTocRememberSize) return null;

            try {
                const raw = localStorage.getItem('cgpt-answer-toc-size-v1');
                if (!raw) return null;

                const parsed = JSON.parse(raw);
                const width = Number(parsed?.width);
                const height = Number(parsed?.height);
                if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
                    return { width, height };
                }
            } catch {
                // 忽略存储不可用或旧数据损坏的情况。
            }

            return null;
        }

        getPanelSizeLimits() {
            const margin = Math.max(0, Number(this.config.answerTocDragViewportMarginPx) || 0);
            const viewportWidth = Math.max(1, document.documentElement.clientWidth);
            const viewportHeight = Math.max(1, document.documentElement.clientHeight);
            const configuredMinWidth = Math.max(160, Number(this.config.answerTocMinWidthPx) || 220);
            const configuredMaxWidth = Math.max(
                configuredMinWidth,
                Number(this.config.answerTocMaxWidthPx) || 560,
            );
            const configuredMinHeight = Math.max(120, Number(this.config.answerTocMinHeightPx) || 170);
            const configuredMaxHeight = Math.max(
                configuredMinHeight,
                Number(this.config.answerTocMaxHeightPx) || 760,
            );
            const maxWidth = Math.max(1, Math.min(configuredMaxWidth, viewportWidth - margin * 2));
            const maxHeight = Math.max(1, Math.min(configuredMaxHeight, viewportHeight - margin * 2));

            return {
                minWidth: Math.min(configuredMinWidth, maxWidth),
                maxWidth,
                minHeight: Math.min(configuredMinHeight, maxHeight),
                maxHeight,
            };
        }

        setPanelSize(width, height, persist = false) {
            if (!this.host || !Number.isFinite(width) || !Number.isFinite(height)) return null;

            const limits = this.getPanelSizeLimits();
            const nextWidth = Math.round(
                Math.min(limits.maxWidth, Math.max(limits.minWidth, width)),
            );
            const nextHeight = Math.round(
                Math.min(limits.maxHeight, Math.max(limits.minHeight, height)),
            );

            this.savedSize = { width: nextWidth, height: nextHeight };
            this.sizeMode = 'manual';
            this.host.dataset.sizeMode = 'manual';
            this.host.style.setProperty('--cgpt-answer-toc-width', `${nextWidth}px`);
            this.host.style.setProperty('--cgpt-answer-toc-height', `${nextHeight}px`);

            if (persist) this.writeSizeState();
            return this.savedSize;
        }

        writeSizeState() {
            if (!this.config.answerTocRememberSize || !this.savedSize) return;

            try {
                localStorage.setItem(
                    'cgpt-answer-toc-size-v1',
                    JSON.stringify(this.savedSize),
                );
            } catch {
                // 忽略严格隐私模式下的存储错误。
            }
        }

        ensurePanelSizeInViewport(persist = false) {
            if (this.sizeMode !== 'manual' || !this.savedSize) return;

            const anchor = !this.collapsed ? this.captureWidgetEdgeAnchor() : null;
            const previous = this.savedSize;
            const next = this.setPanelSize(previous.width, previous.height, false);
            const changed = next && (
                next.width !== previous.width || next.height !== previous.height
            );

            if (anchor) this.alignManualWidgetToEdgeAnchor(anchor, false);
            if (persist && changed) this.writeSizeState();
        }

        readViewState() {
            let fallback = 'headings';
            if (this.config.answerTocInitialView === 'conversation') {
                fallback = 'conversation';
            } else if (
                this.config.answerTocInitialView === 'search' &&
                this.config.enableQuickSearch
            ) {
                fallback = 'search';
            }
            if (!this.config.answerTocRememberView) return fallback;

            try {
                const stored = localStorage.getItem('cgpt-answer-toc-view-v1');
                if (stored === 'conversation' || stored === 'headings') return stored;
                if (stored === 'search' && this.config.enableQuickSearch) return stored;
            } catch {
                // 忽略存储不可用的情况。
            }

            return fallback;
        }

        writeViewState() {
            if (!this.config.answerTocRememberView) return;

            try {
                localStorage.setItem('cgpt-answer-toc-view-v1', this.activeView);
            } catch {
                // 忽略存储不可用的情况。
            }
        }

        setActiveView(view, persist = true, options = {}) {
            let nextView = 'headings';
            if (view === 'conversation') {
                nextView = 'conversation';
            } else if (view === 'search' && this.config.enableQuickSearch) {
                nextView = 'search';
            }

            const shouldFocusSearch = Boolean(options.focusSearch && nextView === 'search');
            if (nextView === this.activeView) {
                this.applyActiveView();
                if (nextView === 'search') this.scheduleQuickSearch(0);
                if (shouldFocusSearch) {
                    window.requestAnimationFrame(() => this.searchInput?.focus());
                }
                return;
            }

            this.activeView = nextView;
            if (persist) this.writeViewState();
            this.applyActiveView();
            this.updateViewMeta();
            if (nextView === 'search') this.scheduleQuickSearch(0);

            window.requestAnimationFrame(() => {
                const { nav, button } = this.getActiveViewNavigation();
                if (button) this.scrollItemIntoView(nav, button);
                if (shouldFocusSearch) this.searchInput?.focus();
            });
        }

        applyActiveView() {
            if (!this.conversationNav || !this.tocNav) return;

            const conversationActive = this.activeView === 'conversation';
            const headingsActive = this.activeView === 'headings';
            const searchActive = this.activeView === 'search' && this.config.enableQuickSearch;
            this.conversationNav.hidden = !conversationActive;
            this.tocNav.hidden = !headingsActive;
            if (this.searchView) this.searchView.hidden = !searchActive;
            this.viewConversationButton?.setAttribute('aria-selected', String(conversationActive));
            this.viewHeadingsButton?.setAttribute('aria-selected', String(headingsActive));
            this.viewSearchButton?.setAttribute('aria-selected', String(searchActive));
            this.viewConversationButton?.setAttribute('tabindex', conversationActive ? '0' : '-1');
            this.viewHeadingsButton?.setAttribute('tabindex', headingsActive ? '0' : '-1');
            this.viewSearchButton?.setAttribute('tabindex', searchActive ? '0' : '-1');
        }

        updateViewMeta() {
            const conversationCount = this.conversationItems.length;
            const headingCount = this.headings.length;
            const searchCount = this.searchTotalMatches;
            const maxSearchResults = Math.max(
                1,
                Number(this.config.quickSearchMaxResults) || 80,
            );
            const searchCountLabel = searchCount > maxSearchResults
                ? `${maxSearchResults}+`
                : String(searchCount);
            const conversationActive = this.activeView === 'conversation';
            const searchActive = this.activeView === 'search';
            const activeCount = conversationActive
                ? String(conversationCount)
                : searchActive
                    ? searchCountLabel
                    : String(headingCount);

            if (this.viewConversationCount) {
                this.viewConversationCount.textContent = String(conversationCount);
            }
            if (this.viewHeadingsCount) {
                this.viewHeadingsCount.textContent = String(headingCount);
            }
            if (this.viewSearchCount) {
                this.viewSearchCount.textContent = searchCountLabel;
            }
            if (this.countLabel) {
                if (conversationActive) {
                    this.countLabel.textContent = `${conversationCount} 问`;
                } else if (searchActive) {
                    this.countLabel.textContent = this.searchIndexing
                        ? '搜索中…'
                        : this.searchQuery.trim()
                            ? `${searchCount} 项`
                            : '快速搜索';
                } else {
                    this.countLabel.textContent = `${headingCount} 节`;
                }
            }
            if (this.launcherMode) {
                this.launcherMode.textContent = conversationActive ? '问' : searchActive ? '搜' : '章';
            }
            if (this.launcherCount) {
                this.launcherCount.textContent = activeCount;
            }
            if (this.launcher) {
                this.launcher.title = `悬停临时展开；在目录中点击、拖动或缩放后保持展开；问答 ${conversationCount}，章节 ${headingCount}，搜索 ${searchCount}（Alt+Shift+F）`;
            }
            if (this.conversationEmptyState) {
                this.conversationEmptyState.hidden = conversationCount > 0;
            }
            if (this.headingEmptyState) {
                this.headingEmptyState.hidden = headingCount > 0;
            }
        }

        getActiveViewNavigation() {
            if (this.activeView === 'conversation') {
                return {
                    nav: this.conversationNav,
                    button: this.conversationItemButtons[this.activeConversationIndex] || null,
                };
            }
            if (this.activeView === 'search') {
                return {
                    nav: this.searchNav,
                    button: this.searchResultButtons[this.activeSearchResultIndex] || null,
                };
            }
            return {
                nav: this.tocNav,
                button: this.itemButtons[this.activeIndex] || null,
            };
        }

        getVisibleWidget() {
            if (!this.launcher || !this.panel) return null;
            return this.collapsed ? this.launcher : this.panel;
        }

        getWidgetDockSide(rect) {
            const viewportWidth = Math.max(1, document.documentElement.clientWidth);
            const centerX = rect.left + rect.width / 2;
            return centerX <= viewportWidth / 2 ? 'left' : 'right';
        }

        captureWidgetEdgeAnchor() {
            if (this.positionMode !== 'manual') return null;

            const widget = this.getVisibleWidget();
            if (!(widget instanceof HTMLElement) || widget.hidden) return null;

            const rect = widget.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;

            const side = this.getWidgetDockSide(rect);
            if (this.host) this.host.dataset.dockSide = side;
            return {
                side,
                left: rect.left,
                right: rect.right,
                top: rect.top,
            };
        }

        alignManualWidgetToEdgeAnchor(anchor, persist = false) {
            if (!anchor || this.positionMode !== 'manual' || !this.host || this.host.hidden) {
                return;
            }

            const widget = this.getVisibleWidget();
            if (!(widget instanceof HTMLElement) || widget.hidden) return;

            const rect = widget.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const desiredLeft = anchor.side === 'right'
                ? anchor.right - rect.width
                : anchor.left;
            const clamped = this.clampPosition(
                desiredLeft,
                anchor.top,
                rect.width,
                rect.height,
            );

            this.host.dataset.dockSide = anchor.side;
            this.setManualPosition(clamped.left, clamped.top, persist);
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

        cancelHoverExpand() {
            window.clearTimeout(this.hoverExpandTimer);
            this.hoverExpandTimer = 0;
        }

        cancelHoverCollapse() {
            window.clearTimeout(this.hoverCollapseTimer);
            this.hoverCollapseTimer = 0;
        }

        captureHoverOriginRect() {
            if (!(this.launcher instanceof HTMLElement) || this.launcher.hidden) return null;
            const rect = this.launcher.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return null;
            return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
            };
        }

        isPointInsideRect(clientX, clientY, rect, tolerance = 0) {
            return Boolean(
                rect &&
                Number.isFinite(clientX) &&
                Number.isFinite(clientY) &&
                clientX >= rect.left - tolerance &&
                clientX <= rect.right + tolerance &&
                clientY >= rect.top - tolerance &&
                clientY <= rect.bottom + tolerance
            );
        }

        clearTransientOriginClickSuppression() {
            window.clearTimeout(this.suppressTransientOriginClickTimer);
            this.suppressTransientOriginClickTimer = 0;
            this.suppressTransientOriginClick = false;
            this.suppressTransientOriginClickRect = null;
        }

        armTransientOriginClickSuppression(rect) {
            this.clearTransientOriginClickSuppression();
            this.suppressTransientOriginClick = true;
            this.suppressTransientOriginClickRect = rect ? { ...rect } : null;
            this.suppressTransientOriginClickTimer = window.setTimeout(() => {
                this.clearTransientOriginClickSuppression();
            }, 900);
        }

        onDocumentPointerDown(event) {
            if (!this.transientHoverOpen || this.collapsed) return;
            if (
                event instanceof PointerEvent &&
                (event.button !== 0 || event.isPrimary === false)
            ) {
                return;
            }

            const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
            const insidePanel = Boolean(this.host && path.includes(this.host));
            const insideOrigin = this.isPointInsideRect(
                event.clientX,
                event.clientY,
                this.transientHoverOriginRect,
                3,
            );

            if (!insidePanel && !insideOrigin) return;

            if (insideOrigin) {
                /*
                 * 面板展开后，原启动器位置通常会被“收起”按钮覆盖。抑制这一次
                 * 随后的 click，避免用户本想点击展开，却立即触发收起。
                 */
                this.armTransientOriginClickSuppression(this.transientHoverOriginRect);
            }

            // pointerdown 早于 click：先把临时悬浮状态提升为持久展开。
            this.pinTransientHoverOpen(true);
        }

        onDocumentClick(event) {
            if (!this.suppressTransientOriginClick) return;

            const shouldSuppress = this.isPointInsideRect(
                event.clientX,
                event.clientY,
                this.suppressTransientOriginClickRect,
                5,
            );
            this.clearTransientOriginClickSuppression();
            if (!shouldSuppress) return;

            event.preventDefault();
            event.stopPropagation();
        }

        scheduleHoverCollapse() {
            this.cancelHoverCollapse();
            if (
                !this.transientHoverOpen ||
                this.collapsed ||
                this.dragState ||
                this.resizeState
            ) {
                return;
            }

            const delay = Math.max(
                0,
                Number(this.config.answerTocHoverCollapseDelayMs) || 0,
            );
            this.hoverCollapseTimer = window.setTimeout(() => {
                this.hoverCollapseTimer = 0;
                if (
                    this.transientHoverOpen &&
                    !this.collapsed &&
                    !this.dragState &&
                    !this.resizeState &&
                    !this.panel?.matches(':hover')
                ) {
                    this.setCollapsed(true, { source: 'hover-leave', persist: false });
                }
            }, delay);
        }

        onLauncherPointerEnter(event) {
            this.launcherHovered = true;
            this.cancelHoverCollapse();
            if (
                !this.collapsed ||
                this.dragState ||
                this.resizeState ||
                (event.pointerType && event.pointerType !== 'mouse')
            ) {
                return;
            }

            this.cancelHoverExpand();
            const delay = Math.max(0, Number(this.config.answerTocHoverExpandDelayMs) || 0);
            this.hoverExpandTimer = window.setTimeout(() => {
                this.hoverExpandTimer = 0;
                if (this.collapsed && this.launcherHovered && !this.dragState && !this.resizeState) {
                    this.transientHoverOriginRect = this.captureHoverOriginRect();
                    this.setCollapsed(false, { source: 'hover', persist: false });
                    window.requestAnimationFrame(() => {
                        if (this.transientHoverOpen && !this.panel?.matches(':hover')) {
                            this.scheduleHoverCollapse();
                        }
                    });
                }
            }, delay);
        }

        onLauncherPointerLeave() {
            this.launcherHovered = false;
            this.cancelHoverExpand();
        }

        onPanelPointerEnter() {
            this.cancelHoverCollapse();
        }

        onPanelPointerLeave(event) {
            const related = event.relatedTarget;
            if (
                related instanceof Node &&
                (this.panel?.contains(related) || this.launcher?.contains(related))
            ) {
                return;
            }
            this.scheduleHoverCollapse();
        }

        /*
         * 悬浮展开只有在“纯浏览、无交互”时才会自动收起。
         * 一旦用户点击、拖动或缩放目录，就将本次展开提升为持久展开。
         */
        pinTransientHoverOpen(persist = true) {
            if (!this.transientHoverOpen || this.collapsed) return false;

            this.transientHoverOpen = false;
            this.cancelHoverCollapse();
            this.transientHoverOriginRect = null;
            if (persist) this.writeCollapsedState();
            return true;
        }

        onPanelClickCapture(event) {
            const target = event.target;

            // “收起”按钮是明确的折叠意图，不先把状态提升为持久展开。
            if (target instanceof Element && target.closest('#collapse-button')) return;
            this.pinTransientHoverOpen(true);
        }

        setCollapsed(collapsed, options = {}) {
            const nextCollapsed = Boolean(collapsed);
            const source = options.source || 'manual';
            const persist = options.persist !== false;

            this.cancelHoverExpand();
            this.cancelHoverCollapse();

            if (!nextCollapsed && source === 'hover') {
                this.transientHoverOpen = true;
            } else if (source !== 'layout') {
                this.transientHoverOpen = false;
                this.transientHoverOriginRect = null;
            }

            if (nextCollapsed === this.collapsed) {
                /*
                 * 悬浮已经把面板打开后，后续点击的视觉状态仍是“展开”。这里不能
                 * 因状态相同而丢弃点击语义，必须写入持久展开状态。
                 */
                if (persist) this.writeCollapsedState();
                this.applyCollapsedState();
                return;
            }

            const edgeAnchor = this.captureWidgetEdgeAnchor();
            this.collapsed = nextCollapsed;
            if (persist) this.writeCollapsedState();
            this.applyCollapsedState();

            if (edgeAnchor) this.alignManualWidgetToEdgeAnchor(edgeAnchor, false);

            window.requestAnimationFrame(() => {
                if (edgeAnchor) {
                    this.alignManualWidgetToEdgeAnchor(edgeAnchor, true);
                } else {
                    this.ensureManualPositionInViewport(true);
                }

                if (!this.collapsed) {
                    this.ensurePanelSizeInViewport(false);
                    const { nav, button } = this.getActiveViewNavigation();
                    if (button) this.scrollItemIntoView(nav, button);

                    if (this.transientHoverOpen && !this.panel?.matches(':hover')) {
                        this.scheduleHoverCollapse();
                    }
                }
            });
        }

        applyCollapsedState() {
            if (!this.launcher || !this.panel) return;

            this.launcher.hidden = !this.collapsed;
            this.panel.hidden = this.collapsed;
            this.launcher.setAttribute('aria-expanded', String(!this.collapsed));
        }

        beginDrag(event, source) {
            if (
                !(event instanceof PointerEvent) ||
                event.button !== 0 ||
                event.isPrimary === false ||
                this.dragState ||
                this.resizeState ||
                !this.host
            ) {
                return;
            }

            const widget = this.getVisibleWidget();
            if (!(widget instanceof HTMLElement) || widget.hidden) return;

            if (source === 'panel') this.pinTransientHoverOpen(true);
            this.cancelHoverExpand();
            this.cancelHoverCollapse();
            event.preventDefault();

            const rect = widget.getBoundingClientRect();
            this.dragState = {
                pointerId: event.pointerId,
                source,
                captureTarget: event.currentTarget instanceof Element
                    ? event.currentTarget
                    : null,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startLeft: rect.left,
                startTop: rect.top,
                width: rect.width,
                height: rect.height,
                moved: false,
            };

            this.rootStyleBeforeDrag = {
                userSelect: document.documentElement.style.userSelect,
                cursor: document.documentElement.style.cursor,
            };
            document.documentElement.style.userSelect = 'none';
            document.documentElement.style.cursor = 'grabbing';

            try {
                this.dragState.captureTarget?.setPointerCapture?.(event.pointerId);
            } catch {
                // window 级监听仍可完成拖动。
            }

            window.addEventListener('pointermove', this.onDragPointerMove, {
                capture: true,
                passive: false,
            });
            window.addEventListener('pointerup', this.onDragPointerEnd, true);
            window.addEventListener('pointercancel', this.onDragPointerCancel, true);
        }

        onDragPointerMove(event) {
            const state = this.dragState;
            if (!state || event.pointerId !== state.pointerId) return;

            event.preventDefault();
            const deltaX = event.clientX - state.startClientX;
            const deltaY = event.clientY - state.startClientY;

            if (!state.moved) {
                if (Math.hypot(deltaX, deltaY) < 4) return;
                state.moved = true;
                this.host?.setAttribute('data-dragging', '');
                this.setManualPosition(state.startLeft, state.startTop, false);
            }

            this.pendingDragPoint = {
                clientX: event.clientX,
                clientY: event.clientY,
            };

            if (this.dragFrameId) return;
            this.dragFrameId = window.requestAnimationFrame(() => {
                this.dragFrameId = 0;
                const point = this.pendingDragPoint;
                this.pendingDragPoint = null;
                if (point) this.applyDragPoint(point.clientX, point.clientY);
            });
        }

        applyDragPoint(clientX, clientY) {
            const state = this.dragState;
            if (!state?.moved) return;

            const left = state.startLeft + clientX - state.startClientX;
            const top = state.startTop + clientY - state.startClientY;
            const clamped = this.clampPosition(left, top, state.width, state.height);
            this.setManualPosition(clamped.left, clamped.top, false);
        }

        onDragPointerEnd(event) {
            this.finishDrag(event, false);
        }

        onDragPointerCancel(event) {
            this.finishDrag(event, true);
        }

        finishDrag(event, cancelled) {
            const state = this.dragState;
            if (!state || event.pointerId !== state.pointerId) return;

            if (this.dragFrameId) {
                window.cancelAnimationFrame(this.dragFrameId);
                this.dragFrameId = 0;
            }

            const point = this.pendingDragPoint;
            this.pendingDragPoint = null;
            if (point && state.moved) this.applyDragPoint(point.clientX, point.clientY);

            try {
                state.captureTarget?.releasePointerCapture?.(state.pointerId);
            } catch {
                // 忽略 pointer capture 已释放的情况。
            }

            window.removeEventListener('pointermove', this.onDragPointerMove, true);
            window.removeEventListener('pointerup', this.onDragPointerEnd, true);
            window.removeEventListener('pointercancel', this.onDragPointerCancel, true);

            this.host?.removeAttribute('data-dragging');
            if (this.rootStyleBeforeDrag) {
                document.documentElement.style.userSelect = this.rootStyleBeforeDrag.userSelect;
                document.documentElement.style.cursor = this.rootStyleBeforeDrag.cursor;
            }
            this.rootStyleBeforeDrag = null;
            this.dragState = null;

            const launcherActivation =
                state.source === 'launcher' &&
                !state.moved &&
                !cancelled;

            if (launcherActivation) {
                /*
                 * launcher 的 pointerdown 同时承担拖动起点，并调用了 preventDefault。
                 * 某些 Chromium/React 组合不会再派发可靠的 click；在 pointerup 这里
                 * 直接按“点击展开”处理，且明确退出 hover 临时展开状态。
                 */
                this.suppressNextLauncherClick = true;
                this.setCollapsed(false, { source: 'click', persist: true });
                window.setTimeout(() => {
                    this.suppressNextLauncherClick = false;
                }, 0);
                return;
            }

            if (state.moved && !cancelled) {
                this.ensureManualPositionInViewport(true);

                if (state.source === 'launcher') {
                    this.suppressNextLauncherClick = true;
                    window.setTimeout(() => {
                        this.suppressNextLauncherClick = false;
                    }, 0);
                }
            }

            this.resumeTransientAutoCollapse(event.clientX, event.clientY);
        }

        beginResize(event, handleCorner) {
            if (
                !(event instanceof PointerEvent) ||
                event.button !== 0 ||
                event.isPrimary === false ||
                this.resizeState ||
                this.dragState ||
                this.collapsed ||
                !this.host ||
                !this.panel
            ) {
                return;
            }

            const allowedCorners = new Set([
                'top-left',
                'top-right',
                'bottom-left',
                'bottom-right',
            ]);
            const corner = allowedCorners.has(handleCorner)
                ? handleCorner
                : 'bottom-right';
            const [verticalSide, horizontalSide] = corner.split('-');
            const rect = this.panel.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            // 缩放属于明确交互：若面板由 hover 临时展开，则从此保持展开。
            this.pinTransientHoverOpen(true);
            this.cancelHoverExpand();
            this.cancelHoverCollapse();
            event.preventDefault();
            event.stopPropagation();

            this.resizeState = {
                pointerId: event.pointerId,
                captureTarget: event.currentTarget instanceof Element
                    ? event.currentTarget
                    : null,
                corner,
                horizontalSide,
                verticalSide,
                startClientX: event.clientX,
                startClientY: event.clientY,
                startWidth: rect.width,
                startHeight: rect.height,
                startLeft: rect.left,
                startRight: rect.right,
                startTop: rect.top,
                startBottom: rect.bottom,
                moved: false,
            };

            this.rootStyleBeforeResize = {
                userSelect: document.documentElement.style.userSelect,
                cursor: document.documentElement.style.cursor,
            };
            document.documentElement.style.userSelect = 'none';
            document.documentElement.style.cursor = (
                corner === 'top-left' || corner === 'bottom-right'
            ) ? 'nwse-resize' : 'nesw-resize';

            try {
                this.resizeState.captureTarget?.setPointerCapture?.(event.pointerId);
            } catch {
                // window 级监听仍可完成缩放。
            }

            window.addEventListener('pointermove', this.onResizePointerMove, {
                capture: true,
                passive: false,
            });
            window.addEventListener('pointerup', this.onResizePointerEnd, true);
            window.addEventListener('pointercancel', this.onResizePointerCancel, true);
        }

        onResizePointerMove(event) {
            const state = this.resizeState;
            if (!state || event.pointerId !== state.pointerId) return;

            event.preventDefault();
            const deltaX = event.clientX - state.startClientX;
            const deltaY = event.clientY - state.startClientY;

            if (!state.moved) {
                if (Math.hypot(deltaX, deltaY) < 3) return;
                state.moved = true;
                this.host?.setAttribute('data-resizing', '');
                this.setManualPosition(state.startLeft, state.startTop, false);
                this.setPanelSize(state.startWidth, state.startHeight, false);
            }

            this.pendingResizePoint = {
                clientX: event.clientX,
                clientY: event.clientY,
            };

            if (this.resizeFrameId) return;
            this.resizeFrameId = window.requestAnimationFrame(() => {
                this.resizeFrameId = 0;
                const point = this.pendingResizePoint;
                this.pendingResizePoint = null;
                if (point) this.applyResizePoint(point.clientX, point.clientY);
            });
        }

        applyResizePoint(clientX, clientY) {
            const state = this.resizeState;
            if (!state?.moved) return;

            const deltaX = clientX - state.startClientX;
            const deltaY = clientY - state.startClientY;
            const requestedWidth = state.horizontalSide === 'left'
                ? state.startWidth - deltaX
                : state.startWidth + deltaX;
            const requestedHeight = state.verticalSide === 'top'
                ? state.startHeight - deltaY
                : state.startHeight + deltaY;

            const margin = Math.max(
                0,
                Number(this.config.answerTocDragViewportMarginPx) || 0,
            );
            const viewportWidth = Math.max(1, document.documentElement.clientWidth);
            const viewportHeight = Math.max(1, document.documentElement.clientHeight);
            const limits = this.getPanelSizeLimits();

            // 固定对角：从哪个角拖动，就保持其对角在原位置。
            const maxWidthByAnchor = Math.max(
                1,
                state.horizontalSide === 'left'
                    ? state.startRight - margin
                    : viewportWidth - state.startLeft - margin,
            );
            const maxHeightByAnchor = Math.max(
                1,
                state.verticalSide === 'top'
                    ? state.startBottom - margin
                    : viewportHeight - state.startTop - margin,
            );
            const effectiveMinWidth = Math.min(limits.minWidth, maxWidthByAnchor);
            const effectiveMaxWidth = Math.max(
                effectiveMinWidth,
                Math.min(limits.maxWidth, maxWidthByAnchor),
            );
            const effectiveMinHeight = Math.min(limits.minHeight, maxHeightByAnchor);
            const effectiveMaxHeight = Math.max(
                effectiveMinHeight,
                Math.min(limits.maxHeight, maxHeightByAnchor),
            );
            const width = Math.round(
                Math.min(effectiveMaxWidth, Math.max(effectiveMinWidth, requestedWidth)),
            );
            const height = Math.round(
                Math.min(effectiveMaxHeight, Math.max(effectiveMinHeight, requestedHeight)),
            );
            const left = state.horizontalSide === 'left'
                ? state.startRight - width
                : state.startLeft;
            const top = state.verticalSide === 'top'
                ? state.startBottom - height
                : state.startTop;

            this.setPanelSize(width, height, false);
            this.setManualPosition(left, top, false);
        }

        onResizePointerEnd(event) {
            this.finishResize(event, false);
        }

        onResizePointerCancel(event) {
            this.finishResize(event, true);
        }

        finishResize(event, cancelled) {
            const state = this.resizeState;
            if (!state || event.pointerId !== state.pointerId) return;

            if (this.resizeFrameId) {
                window.cancelAnimationFrame(this.resizeFrameId);
                this.resizeFrameId = 0;
            }

            const point = this.pendingResizePoint;
            this.pendingResizePoint = null;
            if (point && state.moved) this.applyResizePoint(point.clientX, point.clientY);

            try {
                state.captureTarget?.releasePointerCapture?.(state.pointerId);
            } catch {
                // 忽略 pointer capture 已释放的情况。
            }

            window.removeEventListener('pointermove', this.onResizePointerMove, true);
            window.removeEventListener('pointerup', this.onResizePointerEnd, true);
            window.removeEventListener('pointercancel', this.onResizePointerCancel, true);

            this.host?.removeAttribute('data-resizing');
            if (this.rootStyleBeforeResize) {
                document.documentElement.style.userSelect = this.rootStyleBeforeResize.userSelect;
                document.documentElement.style.cursor = this.rootStyleBeforeResize.cursor;
            }
            this.rootStyleBeforeResize = null;
            this.resizeState = null;

            if (state.moved && !cancelled) {
                this.ensurePanelSizeInViewport(false);
                this.ensureManualPositionInViewport(true);
                this.writeSizeState();
            }

            this.resumeTransientAutoCollapse(event.clientX, event.clientY);
        }

        resumeTransientAutoCollapse(clientX, clientY) {
            if (!this.transientHoverOpen || this.collapsed || this.dragState || this.resizeState) {
                return;
            }

            const rect = this.panel?.getBoundingClientRect();
            const pointInside = rect && Number.isFinite(clientX) && Number.isFinite(clientY)
                ? clientX >= rect.left && clientX <= rect.right &&
                clientY >= rect.top && clientY <= rect.bottom
                : false;
            if (!pointInside && !this.panel?.matches(':hover')) this.scheduleHoverCollapse();
        }

        clampPosition(left, top, width, height) {
            const margin = Math.max(
                0,
                Number(this.config.answerTocDragViewportMarginPx) || 0,
            );
            const viewportWidth = Math.max(1, document.documentElement.clientWidth);
            const viewportHeight = Math.max(1, document.documentElement.clientHeight);
            const safeWidth = Math.max(1, Number(width) || 1);
            const safeHeight = Math.max(1, Number(height) || 1);
            const maxLeft = Math.max(margin, viewportWidth - safeWidth - margin);
            const maxTop = Math.max(margin, viewportHeight - safeHeight - margin);

            return {
                left: Math.min(maxLeft, Math.max(margin, left)),
                top: Math.min(maxTop, Math.max(margin, top)),
            };
        }

        ensureManualPositionInViewport(persist = false) {
            if (
                this.positionMode !== 'manual' ||
                !this.host ||
                this.host.hidden
            ) {
                return;
            }

            const widget = this.getVisibleWidget();
            if (!(widget instanceof HTMLElement) || widget.hidden) return;

            const rect = widget.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            this.host.dataset.dockSide = this.getWidgetDockSide(rect);
            const clamped = this.clampPosition(
                rect.left,
                rect.top,
                rect.width,
                rect.height,
            );
            this.setManualPosition(clamped.left, clamped.top, persist);
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

            window.requestAnimationFrame(() => {
                this.ensurePanelSizeInViewport(true);
                if (this.positionMode === 'manual') {
                    this.ensureManualPositionInViewport(true);
                } else {
                    this.updateInlineEndOffset();
                }
            });

            this.syncVisibility();
            this.requestFrame(true);
        }

        onKeyDown(event) {
            if (event.altKey && event.shiftKey && event.code === 'KeyO') {
                if (!this.host?.hidden) {
                    event.preventDefault();
                    this.setCollapsed(!this.collapsed, { source: 'keyboard', persist: true });
                }
                return;
            }

            if (
                this.config.enableQuickSearch &&
                event.altKey &&
                event.shiftKey &&
                event.code === 'KeyF'
            ) {
                if (!this.host?.hidden) {
                    event.preventDefault();
                    this.setCollapsed(false, { source: 'keyboard', persist: true });
                    this.setActiveView('search', true, { focusSearch: true });
                }
                return;
            }

            if (event.key === 'Escape' && !this.collapsed) {
                const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
                if (
                    this.searchInput &&
                    path.includes(this.searchInput) &&
                    this.searchInput.value
                ) {
                    event.preventDefault();
                    event.stopPropagation();
                    this.clearSearchQuery(true);
                    return;
                }
                if (this.host && path.includes(this.host)) {
                    this.setCollapsed(true, { source: 'keyboard', persist: true });
                }
            }
        }

        onVisibilityChange() {
            if (!document.hidden) {
                this.syncOfficialConversationNav();
                this.refreshConversationTocIfNeeded();
                this.requestFrame(true);
            }
        }

        onRouteSignal() {
            window.setTimeout(() => this.resetForNavigation(), 0);
            window.setTimeout(() => this.requestFrame(true), 180);
        }

        resetForNavigation() {
            this.lastUrl = location.href;
            this.cancelConversationJump();
            this.clearConversationLabelCacheState();
            this.maxObservedOfficialLogicalIndex = -1;
            this.disconnectCurrentAnswer();
            this.clearToc();
            this.clearConversationToc();
            this.resetQuickSearchForNavigation();
            this.bindMainObserver();
            this.syncOfficialConversationNav();
            this.scheduleConversationRebuild(80);
            this.updateInlineEndOffset();
            this.requestFrame(true);
        }

        bindMainObserver() {
            const conversationAnchor =
                document.querySelector('[data-message-author-role="assistant"]') ||
                document.querySelector('[data-message-author-role="user"]') ||
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
            this.markSearchIndexDirty(false);
            this.scheduleConversationRebuild(60);
        }

        nodeMatchesOrContains(node, selector) {
            return node instanceof Element && (
                node.matches?.(selector) || Boolean(node.querySelector?.(selector))
            );
        }

        onMainMutations(records) {
            let assistantAdded = false;
            let conversationChanged = false;
            let searchContentChanged = false;

            for (const record of records) {
                if (
                    this.currentAnswer?.isConnected &&
                    record.target instanceof Node &&
                    this.currentAnswer.contains(record.target)
                ) {
                    searchContentChanged = true;
                    continue;
                }

                for (const node of [...record.addedNodes, ...record.removedNodes]) {
                    if (this.nodeMatchesOrContains(node, '[data-message-author-role="assistant"]')) {
                        assistantAdded = true;
                        searchContentChanged = true;
                    } else if (
                        node instanceof Text &&
                        node.parentElement?.closest?.('[data-message-author-role="assistant"]')
                    ) {
                        searchContentChanged = true;
                    }
                    if (
                        this.nodeMatchesOrContains(node, '[data-message-author-role="user"]') ||
                        this.nodeMatchesOrContains(node, 'button[data-toc-item-index]')
                    ) {
                        conversationChanged = true;
                    }
                }
            }

            if (this.currentAnswer && !this.currentAnswer.isConnected) {
                this.disconnectCurrentAnswer();
                this.clearToc();
                assistantAdded = true;
                searchContentChanged = true;
            }

            if (searchContentChanged) this.markSearchIndexDirty(true);
            if (conversationChanged) this.scheduleConversationRebuild();
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
                characterData: true,
            });

            if (this.config.quickSearchScope === 'current-answer') {
                this.markSearchIndexDirty(true);
            }
            this.rebuildToc();
            this.scheduleConversationRebuild(30);
            this.updateActiveConversation(true);
            this.updateInlineEndOffset();
        }

        disconnectCurrentAnswer() {
            const hadCurrentAnswer = Boolean(this.currentAnswer);
            this.answerObserver?.disconnect();
            this.answerObserver = null;
            this.headingTextObserver?.disconnect();
            this.headingTextObserver = null;
            this.currentAnswer = null;
            this.currentContentRoot = null;
            this.currentScrollRoot = null;
            if (hadCurrentAnswer && this.config.quickSearchScope === 'current-answer') {
                this.markSearchIndexDirty(true);
            }
            this.activeIndex = -1;
            this.lastScrollTop = 0;
            window.clearTimeout(this.answerDetectionTimer);
            this.answerDetectionTimer = 0;
            window.clearTimeout(this.rebuildTimer);
            this.rebuildTimer = 0;
        }

        onAnswerMutations(records) {
            let touchesHeading = false;

            if (records.length) this.markSearchIndexDirty(true);

            for (const record of records) {
                if (record.type === 'characterData') {
                    if (record.target.parentElement?.closest(this.config.answerTocHeadingSelector)) {
                        touchesHeading = true;
                        break;
                    }
                    continue;
                }
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

                const fullLabel = this.normalizeText(element.textContent ?? '');
                if (!fullLabel) continue;

                headings.push({
                    element,
                    level: Number.parseInt(element.tagName.slice(1), 10) || 2,
                    fullLabel,
                    label: this.truncateLabel(fullLabel, this.config.answerTocMaxLabelLength, 180),
                });
            }

            this.headings = headings;
            this.observeHeadingText();
            this.renderTocItems();
            const nextActiveIndex = this.findActiveIndexBinary();
            this.activeIndex = -1;
            this.applyActiveIndex(nextActiveIndex, false);
            this.updateViewMeta();
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

        normalizeText(text) {
            return String(text).replace(/\s+/g, ' ').trim();
        }

        truncateLabel(label, configuredMax, fallback) {
            const max = Math.max(20, Number(configuredMax) || fallback);
            if (label.length <= max) return label;
            return `${label.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
        }

        formatConversationLabel(label) {
            const configuredMax = Number(this.config.conversationTocMaxLabelLength);

            // 0 或负数代表不按字符数截断。
            if (Number.isFinite(configuredMax) && configuredMax <= 0) return label;

            return this.truncateLabel(label, configuredMax, 120);
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
                button.dataset.kind = 'heading';
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
            this.updateViewMeta();
        }

        clearToc() {
            this.headings = [];
            this.itemButtons = [];
            this.activeIndex = -1;
            this.list?.replaceChildren();
            this.updateViewMeta();
            this.syncVisibility();
        }


        onSearchInput() {
            if (!this.searchInput) return;
            this.searchQuery = this.searchInput.value;
            if (this.searchClearButton) {
                this.searchClearButton.hidden = !this.searchInput.value;
            }
            this.scheduleQuickSearch();
        }

        onSearchKeyDown(event) {
            if (!(event instanceof KeyboardEvent)) return;

            if (event.key === 'Enter') {
                if (!this.searchResults.length) return;
                event.preventDefault();
                const index = this.activeSearchResultIndex >= 0
                    ? this.activeSearchResultIndex
                    : 0;
                this.jumpToSearchResult(index);
                return;
            }

            if (event.key === 'ArrowDown' && this.searchResults.length) {
                event.preventDefault();
                const next = Math.min(
                    this.searchResults.length - 1,
                    Math.max(0, this.activeSearchResultIndex + 1),
                );
                this.applyActiveSearchResultIndex(next, true);
                return;
            }

            if (event.key === 'ArrowUp' && this.searchResults.length) {
                event.preventDefault();
                const next = Math.max(0, this.activeSearchResultIndex - 1);
                this.applyActiveSearchResultIndex(next, true);
            }
        }

        clearSearchQuery(focus = false) {
            window.clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = 0;
            this.cancelSearchIndexBuild();
            this.cancelSearchJump();

            if (this.searchInput) {
                this.searchInput.value = '';
                this.searchInput.removeAttribute('aria-busy');
            }
            if (this.searchClearButton) this.searchClearButton.hidden = true;

            this.searchQuery = '';
            this.searchTerms = [];
            this.searchResults = [];
            this.searchResultButtons = [];
            this.activeSearchResultIndex = -1;
            this.searchTotalMatches = 0;
            this.searchList?.replaceChildren();
            if (this.searchEmptyState) {
                this.searchEmptyState.hidden = false;
                this.searchEmptyState.textContent = '输入关键词开始搜索';
            }
            this.setSearchStatus('输入关键词，检索当前已加载的章节和段落');
            this.updateViewMeta();

            if (focus) window.requestAnimationFrame(() => this.searchInput?.focus());
        }

        resetQuickSearchForNavigation() {
            window.clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = 0;
            this.cancelSearchIndexBuild();
            this.cancelSearchJump();
            this.searchIndex = [];
            this.searchIndexBuilt = false;
            this.searchIndexDirty = true;
            this.searchIndexRevision += 1;
            this.searchConversationMapSignature = '';
            this.clearSearchQuery(false);
        }

        setSearchStatus(text) {
            if (this.searchStatus) this.searchStatus.textContent = String(text || '');
        }

        getQuickSearchScopeLabel() {
            return this.config.quickSearchScope === 'current-answer'
                ? '当前回答'
                : '当前已加载内容';
        }

        normalizeSearchText(text) {
            return this.normalizeConversationText(text).toLocaleLowerCase();
        }

        parseQuickSearchQuery(rawQuery) {
            const normalized = this.normalizeSearchText(rawQuery);
            const terms = [...new Set(normalized.split(/\s+/).filter(Boolean))];
            return {
                normalized,
                terms,
                significantLength: normalized.replace(/\s+/g, '').length,
            };
        }

        scheduleQuickSearch(delay = this.config.quickSearchDebounceMs) {
            if (!this.config.enableQuickSearch) return;
            window.clearTimeout(this.searchDebounceTimer);
            this.searchDebounceTimer = window.setTimeout(() => {
                this.searchDebounceTimer = 0;
                this.runQuickSearch();
            }, Math.max(0, Number(delay) || 0));
        }

        markSearchIndexDirty(schedule = true) {
            if (!this.config.enableQuickSearch) return;
            this.searchIndexDirty = true;
            this.searchIndexRevision += 1;
            if (this.searchIndexing) this.cancelSearchIndexBuild();

            if (
                schedule &&
                this.searchInput?.value.trim() &&
                this.activeView === 'search'
            ) {
                this.scheduleQuickSearch(Math.max(180, Number(this.config.quickSearchDebounceMs) || 0));
            }
        }

        cancelSearchIndexBuild() {
            this.searchBuildToken += 1;
            if (this.searchBuildHandle) {
                if (
                    this.searchBuildHandleType === 'idle' &&
                    typeof window.cancelIdleCallback === 'function'
                ) {
                    window.cancelIdleCallback(this.searchBuildHandle);
                } else {
                    window.clearTimeout(this.searchBuildHandle);
                }
            }
            this.searchBuildHandle = 0;
            this.searchBuildHandleType = '';
            this.searchIndexing = false;
            this.searchInput?.removeAttribute('aria-busy');
        }

        queueSearchIndexStep(callback) {
            if (typeof window.requestIdleCallback === 'function') {
                this.searchBuildHandleType = 'idle';
                this.searchBuildHandle = window.requestIdleCallback(callback, { timeout: 140 });
                return;
            }

            this.searchBuildHandleType = 'timeout';
            this.searchBuildHandle = window.setTimeout(() => {
                callback({
                    didTimeout: true,
                    timeRemaining: () => 8,
                });
            }, 0);
        }

        startSearchIndexBuild() {
            if (!this.config.enableQuickSearch || this.searchIndexing) return;

            this.cancelSearchIndexBuild();
            const token = this.searchBuildToken;
            const revision = this.searchIndexRevision;
            let descriptors = [];

            try {
                descriptors = this.collectSearchCandidateDescriptors();
            } catch (error) {
                console.warn('[ChatGPT 双层目录] 建立搜索候选集失败：', error);
                this.searchIndexing = false;
                this.setSearchStatus('搜索索引建立失败，请刷新页面后重试');
                return;
            }

            this.searchIndexing = true;
            this.searchInput?.setAttribute('aria-busy', 'true');
            this.setSearchStatus(`正在建立索引… 0/${descriptors.length}`);
            this.updateViewMeta();

            const entries = [];
            const chunkSize = Math.max(
                20,
                Number(this.config.quickSearchIndexChunkSize) || 160,
            );
            let cursor = 0;

            const processChunk = (deadline) => {
                this.searchBuildHandle = 0;
                this.searchBuildHandleType = '';
                if (token !== this.searchBuildToken) return;

                let processed = 0;
                while (
                    cursor < descriptors.length &&
                    processed < chunkSize &&
                    (
                        processed < 20 ||
                        deadline?.didTimeout ||
                        typeof deadline?.timeRemaining !== 'function' ||
                        deadline.timeRemaining() > 2
                    )
                ) {
                    const entry = this.buildSearchIndexEntry(descriptors[cursor]);
                    if (entry) entries.push(entry);
                    cursor += 1;
                    processed += 1;
                }

                if (cursor < descriptors.length) {
                    this.setSearchStatus(`正在建立索引… ${cursor}/${descriptors.length}`);
                    this.queueSearchIndexStep(processChunk);
                    return;
                }

                this.searchIndexing = false;
                this.searchInput?.removeAttribute('aria-busy');

                if (revision !== this.searchIndexRevision) {
                    this.searchIndexDirty = true;
                    this.scheduleQuickSearch(80);
                    return;
                }

                this.searchIndex = entries;
                this.searchIndexBuilt = true;
                this.searchIndexDirty = false;
                this.runQuickSearch();
            };

            this.queueSearchIndexStep(processChunk);
        }

        getSearchAssistantElements() {
            if (this.config.quickSearchScope === 'current-answer') {
                return this.currentAnswer?.isConnected ? [this.currentAnswer] : [];
            }

            return [...document.querySelectorAll(ASSISTANT_SELECTOR)].filter((element) => (
                element instanceof HTMLElement &&
                element.isConnected &&
                !element.parentElement?.closest('[data-message-author-role="assistant"]') &&
                !element.closest('[hidden], [aria-hidden="true"]')
            ));
        }

        buildSearchAssistantContextMap(assistants) {
            const map = new Map();
            const liveConversationItems = this.conversationItems
                .filter((item) => item.userElement?.isConnected)
                .sort((a, b) => {
                    if (a.userElement === b.userElement) return 0;
                    const relation = a.userElement.compareDocumentPosition(b.userElement);
                    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
                    if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
                    return 0;
                });

            for (const assistant of assistants) {
                let logicalIndex = -1;
                for (const item of liveConversationItems) {
                    const relation = item.userElement.compareDocumentPosition(assistant);
                    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
                        logicalIndex = item.logicalIndex;
                    } else if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
                        break;
                    }
                }

                if (
                    logicalIndex < 0 &&
                    assistant === this.currentAnswer &&
                    this.activeConversationIndex >= 0
                ) {
                    logicalIndex = this.conversationItems[this.activeConversationIndex]?.logicalIndex ?? -1;
                }

                map.set(assistant, logicalIndex);
            }
            return map;
        }

        getSearchKindMeta(element) {
            const tagName = element.tagName.toUpperCase();
            if (/^H[1-6]$/.test(tagName)) {
                const level = Number.parseInt(tagName.slice(1), 10) || 2;
                return { kind: 'heading', kindLabel: `H${level}`, level };
            }
            if (tagName === 'LI') return { kind: 'list', kindLabel: '列表', level: 0 };
            if (tagName === 'BLOCKQUOTE') return { kind: 'quote', kindLabel: '引用', level: 0 };
            if (tagName === 'TR') return { kind: 'table', kindLabel: '表格', level: 0 };
            if (tagName === 'PRE') return { kind: 'code', kindLabel: '代码', level: 0 };
            return { kind: 'paragraph', kindLabel: '段落', level: 0 };
        }

        collectSearchCandidateDescriptors() {
            const assistants = this.getSearchAssistantElements();
            const contextMap = this.buildSearchAssistantContextMap(assistants);
            const headingSelector = String(
                this.config.quickSearchHeadingSelector || 'h1, h2, h3, h4, h5, h6',
            );
            const paragraphSelector = String(
                this.config.quickSearchParagraphSelector || 'p, li, blockquote, pre, table tr',
            );
            const selector = `${headingSelector}, ${paragraphSelector}`;
            const maxBlocks = Math.max(
                1,
                Number(this.config.quickSearchMaxIndexedBlocks) || 8000,
            );
            const descriptors = [];
            const seen = new Set();
            let order = 0;

            for (const assistant of assistants) {
                const markdownRoots = assistant.matches('.markdown')
                    ? [assistant]
                    : [...assistant.querySelectorAll('.markdown')].filter((root) => (
                        root.closest('[data-message-author-role="assistant"]') === assistant &&
                        !root.parentElement?.closest('.markdown')
                    ));
                const roots = markdownRoots.length ? markdownRoots : [assistant];

                for (const root of roots) {
                    let elements;
                    try {
                        elements = root.querySelectorAll(selector);
                    } catch (error) {
                        console.warn('[ChatGPT 双层目录] 搜索选择器无效：', error);
                        return descriptors;
                    }

                    for (const element of elements) {
                        if (!(element instanceof HTMLElement) || seen.has(element)) continue;
                        seen.add(element);
                        if (!element.isConnected) continue;
                        if (element.closest('[hidden], [aria-hidden="true"]')) continue;
                        if (element.closest('[data-message-author-role="assistant"]') !== assistant) continue;
                        if (element.closest('button, nav, aside, [role="toolbar"], [role="menu"]')) {
                            continue;
                        }

                        const tagName = element.tagName.toUpperCase();
                        if (tagName === 'PRE' && !this.config.quickSearchIncludeCodeBlocks) continue;

                        /*
                         * li/blockquote 中若已经有更细粒度的 p/li 等节点，则只索引子节点，
                         * 避免同一段文字以父子容器重复出现。
                         */
                        if (
                            (tagName === 'LI' || tagName === 'BLOCKQUOTE') &&
                            element.querySelector('p, li, blockquote, pre, table tr')
                        ) {
                            continue;
                        }

                        const meta = this.getSearchKindMeta(element);
                        descriptors.push({
                            element,
                            assistant,
                            logicalIndex: contextMap.get(assistant) ?? -1,
                            tagName,
                            order,
                            ...meta,
                        });
                        order += 1;
                        if (descriptors.length >= maxBlocks) return descriptors;
                    }
                }
            }

            return descriptors;
        }

        extractSearchBlockText(element) {
            if (!(element instanceof HTMLElement)) return '';
            if (element.tagName === 'TR') {
                const cells = [...element.querySelectorAll(':scope > th, :scope > td')]
                    .map((cell) => this.normalizeConversationText(cell.textContent ?? ''))
                    .filter(Boolean);
                return cells.join(' · ');
            }
            return this.normalizeConversationText(element.textContent ?? '');
        }

        buildSearchIndexEntry(descriptor) {
            if (!descriptor?.element?.isConnected) return null;
            const fullText = this.extractSearchBlockText(descriptor.element);
            const minLength = Math.max(
                1,
                Number(this.config.quickSearchMinBlockTextLength) || 2,
            );
            if (fullText.length < minLength) return null;

            const searchText = this.normalizeSearchText(fullText);
            if (!searchText) return null;
            return {
                ...descriptor,
                fullText,
                searchText,
            };
        }

        runQuickSearch() {
            if (!this.config.enableQuickSearch || !this.searchInput) return;

            const rawQuery = this.searchInput.value;
            this.searchQuery = rawQuery;
            if (this.searchClearButton) this.searchClearButton.hidden = !rawQuery;

            const parsed = this.parseQuickSearchQuery(rawQuery);
            this.searchTerms = parsed.terms;
            const minLength = Math.max(
                1,
                Number(this.config.quickSearchMinQueryLength) || 1,
            );

            if (!parsed.normalized || parsed.significantLength < minLength) {
                this.searchResults = [];
                this.searchResultButtons = [];
                this.activeSearchResultIndex = -1;
                this.searchTotalMatches = 0;
                this.searchList?.replaceChildren();
                if (this.searchEmptyState) {
                    this.searchEmptyState.hidden = false;
                    this.searchEmptyState.textContent = parsed.normalized
                        ? `请输入至少 ${minLength} 个字符`
                        : '输入关键词开始搜索';
                }
                this.setSearchStatus(`检索范围：${this.getQuickSearchScopeLabel()}`);
                this.updateViewMeta();
                return;
            }

            if (!this.searchIndexBuilt || this.searchIndexDirty) {
                this.startSearchIndexBuild();
                return;
            }

            this.filterQuickSearchIndex(parsed);
        }

        countSearchOccurrences(text, term, limit = 8) {
            if (!term) return 0;
            let count = 0;
            let from = 0;
            while (count < limit) {
                const index = text.indexOf(term, from);
                if (index < 0) break;
                count += 1;
                from = index + Math.max(1, term.length);
            }
            return count;
        }

        filterQuickSearchIndex(parsed) {
            const matches = [];
            for (const entry of this.searchIndex) {
                let firstMatchIndex = Number.POSITIVE_INFINITY;
                let occurrenceCount = 0;
                let allTermsMatch = true;

                for (const term of parsed.terms) {
                    const index = entry.searchText.indexOf(term);
                    if (index < 0) {
                        allTermsMatch = false;
                        break;
                    }
                    firstMatchIndex = Math.min(firstMatchIndex, index);
                    occurrenceCount += this.countSearchOccurrences(entry.searchText, term);
                }
                if (!allTermsMatch) continue;

                const phraseIndex = entry.searchText.indexOf(parsed.normalized);
                let score = entry.kind === 'heading' ? 70 : 0;
                if (entry.searchText === parsed.normalized) score += 160;
                if (entry.searchText.startsWith(parsed.normalized)) score += 65;
                if (phraseIndex >= 0) score += 38;
                score += Math.max(0, 28 - firstMatchIndex / 18);
                score += Math.min(24, occurrenceCount * 3);
                score -= Math.min(18, entry.fullText.length / 600);

                matches.push({
                    ...entry,
                    firstMatchIndex,
                    score,
                });
            }

            matches.sort((a, b) => b.score - a.score || a.order - b.order);
            this.searchTotalMatches = matches.length;
            const maxResults = Math.max(
                1,
                Number(this.config.quickSearchMaxResults) || 80,
            );
            this.searchResults = matches.slice(0, maxResults);
            this.renderSearchResults();
        }

        getSearchResultContextLabel(result) {
            if (Number.isInteger(result?.logicalIndex) && result.logicalIndex >= 0) {
                return `第 ${result.logicalIndex + 1} 问`;
            }
            return this.config.quickSearchScope === 'current-answer'
                ? '当前回答'
                : '回答';
        }

        appendHighlightedSearchSnippet(container, fullText, terms) {
            const maxLength = Math.max(
                60,
                Number(this.config.quickSearchSnippetLength) || 180,
            );
            const folded = fullText.toLocaleLowerCase();
            let firstMatch = Number.POSITIVE_INFINITY;
            for (const term of terms) {
                const index = folded.indexOf(term);
                if (index >= 0) firstMatch = Math.min(firstMatch, index);
            }
            if (!Number.isFinite(firstMatch)) firstMatch = 0;

            let start = Math.max(0, firstMatch - Math.floor(maxLength * 0.34));
            let end = Math.min(fullText.length, start + maxLength);
            if (end - start < maxLength && start > 0) {
                start = Math.max(0, end - maxLength);
            }

            const snippet = fullText.slice(start, end);
            const foldedSnippet = snippet.toLocaleLowerCase();
            const ranges = [];
            for (const term of terms) {
                let from = 0;
                let guard = 0;
                while (guard < 20) {
                    const index = foldedSnippet.indexOf(term, from);
                    if (index < 0) break;
                    ranges.push([index, index + term.length]);
                    from = index + Math.max(1, term.length);
                    guard += 1;
                }
            }
            ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

            const merged = [];
            for (const range of ranges) {
                const previous = merged[merged.length - 1];
                if (previous && range[0] <= previous[1]) {
                    previous[1] = Math.max(previous[1], range[1]);
                } else {
                    merged.push([...range]);
                }
            }

            if (start > 0) container.append('…');
            let cursor = 0;
            for (const [rangeStart, rangeEnd] of merged) {
                if (rangeStart > cursor) container.append(snippet.slice(cursor, rangeStart));
                const mark = document.createElement('mark');
                mark.textContent = snippet.slice(rangeStart, rangeEnd);
                container.appendChild(mark);
                cursor = rangeEnd;
            }
            if (cursor < snippet.length) container.append(snippet.slice(cursor));
            if (end < fullText.length) container.append('…');
        }

        renderSearchResults() {
            if (!this.searchList) return;

            const fragment = document.createDocumentFragment();
            this.searchResultButtons = [];

            this.searchResults.forEach((result, index) => {
                const item = document.createElement('li');
                const button = document.createElement('button');
                const meta = document.createElement('span');
                const kind = document.createElement('span');
                const context = document.createElement('span');
                const snippet = document.createElement('span');

                button.type = 'button';
                button.className = 'toc-item search-result';
                button.dataset.kind = 'search';
                button.dataset.searchResultIndex = String(index);
                button.dataset.active = 'false';
                button.title = result.fullText;

                meta.className = 'search-result-meta';
                kind.className = 'search-result-kind';
                kind.textContent = result.kindLabel;
                context.className = 'search-result-context';
                context.textContent = this.getSearchResultContextLabel(result);
                meta.append(kind, context);

                snippet.className = 'search-result-snippet';
                this.appendHighlightedSearchSnippet(
                    snippet,
                    result.fullText,
                    this.searchTerms,
                );

                button.append(meta, snippet);
                item.appendChild(button);
                fragment.appendChild(item);
                this.searchResultButtons.push(button);
            });

            this.searchList.replaceChildren(fragment);
            if (this.searchEmptyState) {
                this.searchEmptyState.hidden = this.searchResults.length > 0;
                this.searchEmptyState.textContent = this.searchResults.length
                    ? ''
                    : `未在${this.getQuickSearchScopeLabel()}中找到匹配内容`;
            }

            const displayed = this.searchResults.length;
            const indexed = this.searchIndex.length;
            if (this.searchTotalMatches > displayed) {
                this.setSearchStatus(
                    `找到 ${this.searchTotalMatches} 处，显示前 ${displayed} 条 · 已索引 ${indexed} 个文本块`,
                );
            } else {
                this.setSearchStatus(
                    `找到 ${this.searchTotalMatches} 处 · 已索引 ${indexed} 个文本块`,
                );
            }

            this.activeSearchResultIndex = -1;
            if (this.searchResults.length) this.applyActiveSearchResultIndex(0, false);
            this.updateViewMeta();
        }

        applyActiveSearchResultIndex(index, ensureVisible) {
            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= this.searchResultButtons.length
            ) {
                return;
            }
            if (this.activeSearchResultIndex === index && !ensureVisible) return;

            const previous = this.searchResultButtons[this.activeSearchResultIndex];
            if (previous) {
                previous.dataset.active = 'false';
                previous.removeAttribute('aria-current');
            }

            this.activeSearchResultIndex = index;
            const current = this.searchResultButtons[index];
            if (!current) return;
            current.dataset.active = 'true';
            current.setAttribute('aria-current', 'true');
            if (ensureVisible || (!this.collapsed && this.activeView === 'search')) {
                this.scrollItemIntoView(this.searchNav, current);
            }
        }

        clearSearchTargetHighlight() {
            window.clearTimeout(this.searchHighlightTimer);
            this.searchHighlightTimer = 0;
            if (this.searchHighlightElement?.isConnected) {
                this.searchHighlightElement.removeAttribute('data-cgpt-search-jump-target');
            }
            this.searchHighlightElement = null;
        }

        highlightSearchTarget(target) {
            if (!this.config.quickSearchHighlightTarget || !(target instanceof HTMLElement)) {
                return;
            }
            this.clearSearchTargetHighlight();
            this.searchHighlightElement = target;
            target.setAttribute('data-cgpt-search-jump-target', '');
            this.searchHighlightTimer = window.setTimeout(() => {
                this.clearSearchTargetHighlight();
            }, 2200);
        }

        cancelSearchJump() {
            this.searchJumpToken += 1;
            for (const timer of this.searchJumpTimers) window.clearTimeout(timer);
            this.searchJumpTimers.clear();
            this.clearSearchTargetHighlight();
        }

        scheduleSearchJumpTask(callback, delay, token) {
            const timer = window.setTimeout(() => {
                this.searchJumpTimers.delete(timer);
                if (token !== this.searchJumpToken) return;
                callback();
            }, Math.max(0, Number(delay) || 0));
            this.searchJumpTimers.add(timer);
            return timer;
        }

        getQuickSearchScrollOffset() {
            return Math.max(
                0,
                Number(this.config.quickSearchScrollOffsetPx) || 96,
            );
        }

        scrollSearchTarget(target, behavior = 'auto') {
            if (!(target instanceof HTMLElement) || !target.isConnected) return false;
            const turn = this.getConversationTurnElement(target) || target.closest(ASSISTANT_SELECTOR);
            if (turn instanceof HTMLElement) this.revealConversationJumpTarget(turn);

            const targetRect = target.getBoundingClientRect();
            const offset = this.getQuickSearchScrollOffset();
            const scrollRoot = this.findScrollRoot(target);

            if (scrollRoot instanceof HTMLElement) {
                const rootRect = scrollRoot.getBoundingClientRect();
                const visibleTop = Math.max(0, rootRect.top);
                const visibleBottom = Math.min(window.innerHeight, rootRect.bottom);
                const availableHeight = Math.max(1, visibleBottom - visibleTop);
                const desiredTop = visibleTop + Math.min(offset, availableHeight * 0.3);
                scrollRoot.scrollBy({ top: targetRect.top - desiredTop, behavior });
            } else {
                const desiredTop = Math.min(offset, window.innerHeight * 0.3);
                window.scrollBy({ top: targetRect.top - desiredTop, behavior });
            }
            return true;
        }

        performSearchJump(target, resultIndex) {
            if (!(target instanceof HTMLElement) || !target.isConnected) return false;

            this.cancelSearchJump();
            const token = this.searchJumpToken;
            this.applyActiveSearchResultIndex(resultIndex, true);
            this.highlightSearchTarget(target);
            this.scrollSearchTarget(target, this.getConversationJumpBehavior());

            for (const delay of [360, 820, 1450]) {
                this.scheduleSearchJumpTask(() => {
                    if (!target.isConnected) return;
                    this.scrollSearchTarget(target, 'auto');
                    this.highlightSearchTarget(target);
                    this.requestFrame(true);
                }, delay, token);
            }
            return true;
        }

        findLiveSearchTarget(result) {
            if (result?.element?.isConnected) return result.element;
            if (!result?.tagName || !result.fullText) return null;

            const selector = result.tagName.toLowerCase();
            if (!/^(h[1-6]|p|li|blockquote|pre|tr)$/.test(selector)) return null;

            const candidates = [...document.querySelectorAll(`${ASSISTANT_SELECTOR} ${selector}`)]
                .filter((element) => element instanceof HTMLElement && element.isConnected);
            const assistants = [...new Set(candidates.map((element) => (
                element.closest(ASSISTANT_SELECTOR)
            )).filter(Boolean))];
            const contextMap = this.buildSearchAssistantContextMap(assistants);
            let fallback = null;

            for (const element of candidates) {
                const text = this.extractSearchBlockText(element);
                if (text !== result.fullText) continue;
                const assistant = element.closest(ASSISTANT_SELECTOR);
                const logicalIndex = contextMap.get(assistant) ?? -1;
                if (logicalIndex === result.logicalIndex) return element;
                fallback ||= element;
            }
            return fallback;
        }

        jumpToSearchResult(index) {
            const result = this.searchResults[index];
            if (!result) return;

            this.applyActiveSearchResultIndex(index, true);
            if (this.performSearchJump(result.element, index)) return;

            const conversationIndex = this.conversationItems.findIndex(
                (item) => item.logicalIndex === result.logicalIndex,
            );
            if (conversationIndex < 0) {
                this.markSearchIndexDirty(true);
                this.setSearchStatus('目标内容已经重新加载，请稍候后再次点击搜索结果');
                return;
            }

            this.cancelSearchJump();
            const token = this.searchJumpToken;
            this.jumpToConversation(conversationIndex);
            for (const delay of [180, 420, 820, 1380, 2100]) {
                this.scheduleSearchJumpTask(() => {
                    const target = this.findLiveSearchTarget(result);
                    if (target) this.performSearchJump(target, index);
                }, delay, token);
            }
        }

        getConversationTurnElement(element) {
            return element instanceof Element
                ? element.closest('[data-testid^="conversation-turn-"]')
                : null;
        }

        getConversationTurnNumber(element) {
            const turn = this.getConversationTurnElement(element);
            const testId = turn?.getAttribute('data-testid') || '';
            const match = /^conversation-turn-(\d+)$/.exec(testId);
            if (!match) return null;

            const number = Number.parseInt(match[1], 10);
            return Number.isInteger(number) && number >= 0 ? number : null;
        }

        getConversationRecordIdentity(element, fallbackIndex = 0) {
            const turn = this.getConversationTurnElement(element);
            const messageId =
                element?.getAttribute?.('data-message-id') ||
                element?.closest?.('[data-message-id]')?.getAttribute('data-message-id') ||
                turn?.querySelector?.('[data-message-id]')?.getAttribute('data-message-id') ||
                '';
            if (messageId) return `message:${messageId}`;

            const testId = turn?.getAttribute('data-testid') || '';
            return testId || `user-node:${fallbackIndex}`;
        }

        getUserMessageElements() {
            const candidates = [...document.querySelectorAll(USER_SELECTOR)].filter((element) => {
                if (!(element instanceof HTMLElement) || !element.isConnected) return false;
                if (element.parentElement?.closest('[data-message-author-role="user"]')) return false;
                if (element.closest('[hidden]')) return false;
                return true;
            });

            /*
             * 响应式布局或分支切换期间可能同时存在同一轮次的多个副本。
             * 每个 conversation-turn 仅保留“可见且文本更完整”的那个节点。
             */
            const bestByIdentity = new Map();
            candidates.forEach((element, index) => {
                const identity = this.getConversationRecordIdentity(element, index);
                const textLength = (element.textContent ?? '').trim().length;
                const hiddenPenalty = element.closest('[aria-hidden="true"]') ? 0 : 1_000_000;
                const score = hiddenPenalty + textLength;
                const current = bestByIdentity.get(identity);
                if (!current || score > current.score) {
                    bestByIdentity.set(identity, { element, score });
                }
            });

            return [...bestByIdentity.values()]
                .map((entry) => entry.element)
                .sort((a, b) => {
                    if (a === b) return 0;
                    const relation = a.compareDocumentPosition(b);
                    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
                    if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
                    return 0;
                });
        }

        normalizeConversationText(text) {
            return String(text)
                .replace(/\r\n?/g, '\n')
                .replace(/[^\S\n]+/g, ' ')
                .replace(/ *\n */g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
        }

        extractUserPromptText(element) {
            const source =
                element.querySelector('[data-message-content]') ||
                element.querySelector('.whitespace-pre-wrap') ||
                element.querySelector('.markdown') ||
                element;

            const clone = source.cloneNode(true);
            if (clone instanceof Element) {
                for (const removable of clone.querySelectorAll(
                    'button, script, style, svg, [aria-hidden="true"], [role="tooltip"]',
                )) {
                    removable.remove();
                }
            }

            return this.normalizeConversationText(clone.textContent ?? '')
                .replace(/^(?:You said:|你说[:：])\s*/i, '')
                .trim();
        }

        collectUserMessageRecords() {
            return this.getUserMessageElements().map((userElement, index) => ({
                userElement,
                targetElement: this.getConversationTurnElement(userElement) || userElement,
                turnNumber: this.getConversationTurnNumber(userElement),
                identity: this.getConversationRecordIdentity(userElement, index),
                fullLabel: this.extractUserPromptText(userElement),
                ariaHidden: Boolean(userElement.closest('[aria-hidden="true"]')),
            }));
        }

        getOfficialNavButtons() {
            return [...document.querySelectorAll('button[data-toc-item-index]')]
                .filter((button) => button instanceof HTMLButtonElement && button.isConnected)
                .sort((a, b) => {
                    const ai = Number.parseInt(a.dataset.tocItemIndex ?? '', 10);
                    const bi = Number.parseInt(b.dataset.tocItemIndex ?? '', 10);
                    return (Number.isFinite(ai) ? ai : 0) - (Number.isFinite(bi) ? bi : 0);
                });
        }

        getOfficialActiveLogicalIndex(buttons = this.getOfficialNavButtons()) {
            const activeButton = buttons.find((button) => button.hasAttribute('data-toc-active'));
            const index = Number.parseInt(activeButton?.dataset.tocItemIndex ?? '', 10);
            return Number.isInteger(index) && index >= 0 ? index : -1;
        }

        findFixedAncestor(element) {
            for (let current = element?.parentElement; current; current = current.parentElement) {
                if (
                    getComputedStyle(current).position === 'fixed' ||
                    current.classList.contains('fixed')
                ) {
                    return current;
                }
            }
            return null;
        }

        syncOfficialConversationNav() {
            const buttons = this.getOfficialNavButtons();
            const container = buttons.length ? this.findFixedAncestor(buttons[0]) : null;

            if (
                this.officialNavContainer &&
                this.officialNavContainer !== container &&
                this.officialNavContainer.isConnected
            ) {
                this.officialNavContainer.removeAttribute(
                    'data-cgpt-native-conversation-toc-hidden',
                );
            }

            this.officialNavContainer = container;
            if (container) {
                if (this.config.hideOfficialConversationToc) {
                    container.setAttribute('data-cgpt-native-conversation-toc-hidden', '');
                } else {
                    container.removeAttribute('data-cgpt-native-conversation-toc-hidden');
                }
            }

            return buttons;
        }

        getConversationSignature() {
            const users = this.getUserMessageElements();
            const buttons = this.getOfficialNavButtons();
            const currentAnswerIdentity = this.currentAnswer?.closest?.(
                '[data-testid^="conversation-turn-"]',
            )?.getAttribute('data-testid') || '';
            const userSignature = users.map((element, index) => {
                const text = (element.textContent ?? '').trim();
                const identity = this.getConversationRecordIdentity(element, index);
                return `${identity}:${text.length}:${text.slice(0, 16)}:${text.slice(-16)}`;
            }).join('|');
            const buttonSignature = buttons.map((button) => {
                const index = button.dataset.tocItemIndex ?? '?';
                const active = button.hasAttribute('data-toc-active') ? 'a' : '';
                return `${index}${active}`;
            }).join(',');
            return `${currentAnswerIdentity}||${userSignature}||${buttonSignature}`;
        }

        refreshConversationTocIfNeeded() {
            const signature = this.getConversationSignature();
            if (signature !== this.lastConversationSignature) {
                this.scheduleConversationRebuild(40);
            }
        }

        scheduleConversationRebuild(delay = 120) {
            window.clearTimeout(this.conversationRebuildTimer);
            this.conversationRebuildTimer = window.setTimeout(() => {
                this.conversationRebuildTimer = 0;
                this.rebuildConversationToc();
            }, Math.max(0, Number(delay) || 0));
        }

        findCurrentPromptRecordIndex(records) {
            if (!this.currentAnswer?.isConnected || !records.length) return -1;

            let bestIndex = -1;
            for (let index = 0; index < records.length; index += 1) {
                const userElement = records[index].userElement;
                if (!userElement?.isConnected) continue;

                const relation = userElement.compareDocumentPosition(this.currentAnswer);
                if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
                    bestIndex = index;
                } else if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
                    break;
                }
            }
            return bestIndex;
        }

        findViewportPromptRecordIndex(records) {
            if (!records.length) return -1;
            const lineY = this.getActiveLineViewportY();
            let bestIndex = -1;
            let bestDistance = Number.POSITIVE_INFINITY;

            records.forEach((record, index) => {
                const target = record.targetElement || record.userElement;
                if (!(target instanceof HTMLElement) || !target.isConnected) return;
                const rect = target.getBoundingClientRect();
                const distance = rect.top <= lineY && rect.bottom >= lineY
                    ? 0
                    : Math.min(Math.abs(rect.top - lineY), Math.abs(rect.bottom - lineY));
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestIndex = index;
                }
            });
            return bestIndex;
        }

        getUserTurnStride(records) {
            const numbers = records
                .map((record) => record.turnNumber)
                .filter((number) => Number.isInteger(number));
            if (numbers.length < 2) return 2;

            const parity = numbers[0] % 2;
            return numbers.every((number) => number % 2 === parity) ? 2 : 1;
        }

        validateRecordIndexMapping(indices, maxOfficialIndex) {
            if (!indices.length) return false;
            const seen = new Set();
            let previous = -1;

            for (const index of indices) {
                if (!Number.isInteger(index) || index < 0) return false;
                if (maxOfficialIndex >= 0 && index > maxOfficialIndex) return false;
                if (seen.has(index) || index <= previous) return false;
                seen.add(index);
                previous = index;
            }
            return true;
        }

        clearConversationLabelCacheState() {
            this.conversationLabelCache.clear();
            this.conversationCacheIdentityByIndex.clear();
            this.conversationCacheIndexByIdentity.clear();
        }

        removeConversationCachedLabel(logicalIndex) {
            const identity = this.conversationCacheIdentityByIndex.get(logicalIndex);
            if (
                identity &&
                this.conversationCacheIndexByIdentity.get(identity) === logicalIndex
            ) {
                this.conversationCacheIndexByIdentity.delete(identity);
            }
            this.conversationCacheIdentityByIndex.delete(logicalIndex);
            this.conversationLabelCache.delete(logicalIndex);
        }

        cacheConversationRecordLabel(logicalIndex, record) {
            if (
                !Number.isInteger(logicalIndex) ||
                logicalIndex < 0 ||
                !record?.fullLabel
            ) {
                return;
            }

            const identity = String(record.identity || '');
            if (identity) {
                const previousIndex = this.conversationCacheIndexByIdentity.get(identity);
                if (Number.isInteger(previousIndex) && previousIndex !== logicalIndex) {
                    this.removeConversationCachedLabel(previousIndex);
                }

                const displacedIdentity = this.conversationCacheIdentityByIndex.get(logicalIndex);
                if (
                    displacedIdentity &&
                    displacedIdentity !== identity &&
                    this.conversationCacheIndexByIdentity.get(displacedIdentity) === logicalIndex
                ) {
                    this.conversationCacheIndexByIdentity.delete(displacedIdentity);
                }

                this.conversationCacheIdentityByIndex.set(logicalIndex, identity);
                this.conversationCacheIndexByIdentity.set(identity, logicalIndex);
            }

            this.conversationLabelCache.set(logicalIndex, record.fullLabel);
        }

        mapUserRecordsToLogicalIndices(records, officialButtons) {
            const buttonsByIndex = new Map();
            let maxOfficialIndex = -1;

            for (const button of officialButtons) {
                const logicalIndex = Number.parseInt(button.dataset.tocItemIndex ?? '', 10);
                if (!Number.isInteger(logicalIndex) || logicalIndex < 0) continue;
                if (!buttonsByIndex.has(logicalIndex)) buttonsByIndex.set(logicalIndex, button);
                maxOfficialIndex = Math.max(maxOfficialIndex, logicalIndex);
            }

            const officialIndices = [...buttonsByIndex.keys()].sort((a, b) => a - b);
            const officialCount = officialIndices.length;
            const activeLogicalIndex = this.getOfficialActiveLogicalIndex(officialButtons);
            const anchorRecordIndex = this.findCurrentPromptRecordIndex(records);
            const viewportAnchorIndex = this.findViewportPromptRecordIndex(records);
            const stride = this.getUserTurnStride(records);
            const officialNavAppearsPartial =
                this.maxObservedOfficialLogicalIndex >= 0 &&
                maxOfficialIndex >= 0 &&
                maxOfficialIndex < this.maxObservedOfficialLogicalIndex;

            let mappedIndices = null;
            let confident = false;
            let trustLabels = false;
            let source = 'none';
            let tentativeTurnCandidate = null;

            const acceptCandidate = (
                candidate,
                candidateSource,
                candidateConfident,
                candidateTrustLabels,
            ) => {
                if (mappedIndices || !this.validateRecordIndexMapping(candidate, maxOfficialIndex)) {
                    return false;
                }
                mappedIndices = candidate;
                source = candidateSource;
                confident = Boolean(candidateConfident);
                trustLabels = Boolean(candidateTrustLabels);
                return true;
            };

            if (!records.length) {
                return {
                    buttonsByIndex,
                    recordsByIndex: new Map(),
                    maxIndex: maxOfficialIndex,
                    officialMaxIndex: maxOfficialIndex,
                    confident: true,
                    trustLabels: true,
                    source: 'empty',
                };
            }

            if (!officialCount) {
                acceptCandidate(
                    records.map((_, index) => index),
                    'dom-only',
                    true,
                    true,
                );
            }

            /*
             * 官方 active 项与“当前回答之前的用户提问”是最可靠的独立锚点。
             * 必须优先于 conversation-turn-N；页面首轮 hydration/虚拟化期间，
             * 后者可能暂时从 0 重新编号，不能直接视为绝对问答序号。
             */
            if (!mappedIndices && activeLogicalIndex >= 0 && anchorRecordIndex >= 0) {
                const anchorTurn = records[anchorRecordIndex].turnNumber;
                const candidate = records.map((record, index) => {
                    if (Number.isInteger(anchorTurn) && Number.isInteger(record.turnNumber)) {
                        const delta = record.turnNumber - anchorTurn;
                        if (delta % stride === 0) return activeLogicalIndex + delta / stride;
                    }
                    return activeLogicalIndex + index - anchorRecordIndex;
                });
                acceptCandidate(candidate, 'active-current-answer', true, true);
            }

            if (!mappedIndices && activeLogicalIndex >= 0 && viewportAnchorIndex >= 0) {
                const candidate = records.map((_, index) =>
                    activeLogicalIndex + index - viewportAnchorIndex);
                acceptCandidate(candidate, 'active-viewport', true, true);
            }

            if (!mappedIndices) {
                const recordsWithTurns = records.every((record) =>
                    Number.isInteger(record.turnNumber));
                if (recordsWithTurns) {
                    const candidates = [
                        records.map((record) => Math.floor(record.turnNumber / 2)),
                        records.map((record) => record.turnNumber),
                    ];

                    for (const candidate of candidates) {
                        if (!this.validateRecordIndexMapping(candidate, maxOfficialIndex)) continue;

                        const matchesCurrentAnchor =
                            activeLogicalIndex >= 0 &&
                            anchorRecordIndex >= 0 &&
                            candidate[anchorRecordIndex] === activeLogicalIndex;
                        const matchesViewportAnchor =
                            activeLogicalIndex >= 0 &&
                            viewportAnchorIndex >= 0 &&
                            candidate[viewportAnchorIndex] === activeLogicalIndex;
                        const matchesCompleteOfficialSet =
                            records.length === officialCount &&
                            candidate.length === officialIndices.length &&
                            candidate.every((value, index) => value === officialIndices[index]);
                        const reachesKnownConversationEnd =
                            maxOfficialIndex >= 0 &&
                            candidate[candidate.length - 1] === maxOfficialIndex;

                        if (matchesCurrentAnchor || matchesViewportAnchor) {
                            acceptCandidate(candidate, 'turn-number-aligned', true, true);
                            break;
                        }

                        if (
                            reachesKnownConversationEnd &&
                            records.length < officialCount &&
                            !officialNavAppearsPartial
                        ) {
                            acceptCandidate(candidate, 'turn-number-end-aligned', true, true);
                            break;
                        }

                        if (matchesCompleteOfficialSet && !officialNavAppearsPartial) {
                            acceptCandidate(candidate, 'turn-number-complete', true, true);
                            break;
                        }

                        tentativeTurnCandidate ||= candidate;
                    }
                }
            }

            /*
             * DOM 记录数与当前官方按钮数相等时可以临时一一对应；但如果此前
             * 已观察到更多官方项，则当前按钮集只是 React 过渡态，不能缓存标签。
             */
            if (!mappedIndices && records.length === officialCount) {
                acceptCandidate(
                    officialIndices.slice(),
                    'count-match',
                    !officialNavAppearsPartial,
                    !officialNavAppearsPartial,
                );
            }

            if (!mappedIndices && tentativeTurnCandidate) {
                acceptCandidate(tentativeTurnCandidate, 'turn-number-tentative', false, false);
            }

            if (!mappedIndices) {
                const offset = Math.max(0, maxOfficialIndex + 1 - records.length);
                acceptCandidate(
                    records.map((_, index) => index + offset),
                    'tail-fallback',
                    false,
                    false,
                );
            }

            const recordsByIndex = new Map();
            mappedIndices.forEach((logicalIndex, recordIndex) => {
                if (!Number.isInteger(logicalIndex) || logicalIndex < 0) return;
                if (maxOfficialIndex >= 0 && logicalIndex > maxOfficialIndex) return;
                const record = records[recordIndex];
                if (!record) return;

                const previous = recordsByIndex.get(logicalIndex);
                if (!previous) {
                    recordsByIndex.set(logicalIndex, record);
                    return;
                }

                const previousScore = (previous.ariaHidden ? 0 : 1_000_000) + previous.fullLabel.length;
                const nextScore = (record.ariaHidden ? 0 : 1_000_000) + record.fullLabel.length;
                if (nextScore > previousScore) recordsByIndex.set(logicalIndex, record);
            });

            let maxMappedIndex = -1;
            for (const index of recordsByIndex.keys()) {
                maxMappedIndex = Math.max(maxMappedIndex, index);
            }

            return {
                buttonsByIndex,
                recordsByIndex,
                maxIndex: Math.max(maxOfficialIndex, maxMappedIndex),
                officialMaxIndex: maxOfficialIndex,
                confident,
                trustLabels,
                source,
            };
        }

        rebuildConversationToc() {
            if (!this.config.enableConversationToc) {
                this.clearConversationToc();
                return;
            }

            const records = this.collectUserMessageRecords();
            const officialButtons = this.syncOfficialConversationNav();
            const mapping = this.mapUserRecordsToLogicalIndices(records, officialButtons);
            const items = [];

            /*
             * 首次 hydration 时官方目录可能先出现 1～2 项，随后一次性扩展为
             * 完整问答数。此前按“小目录”写入的缓存没有可信的绝对索引，必须清空。
             */
            if (
                this.maxObservedOfficialLogicalIndex >= 0 &&
                mapping.officialMaxIndex > this.maxObservedOfficialLogicalIndex + 1
            ) {
                this.clearConversationLabelCacheState();
            }
            if (mapping.officialMaxIndex >= 0) {
                this.maxObservedOfficialLogicalIndex = Math.max(
                    this.maxObservedOfficialLogicalIndex,
                    mapping.officialMaxIndex,
                );
            }

            if (mapping.trustLabels) {
                for (const [logicalIndex, record] of mapping.recordsByIndex) {
                    this.cacheConversationRecordLabel(logicalIndex, record);
                }
            }

            const liveLabelIndices = new Map();
            if (mapping.trustLabels) {
                for (const [logicalIndex, record] of mapping.recordsByIndex) {
                    if (!record.fullLabel) continue;
                    const indices = liveLabelIndices.get(record.fullLabel) || new Set();
                    indices.add(logicalIndex);
                    liveLabelIndices.set(record.fullLabel, indices);
                }
            }

            const knownIndices = new Set([
                ...mapping.buttonsByIndex.keys(),
                ...mapping.recordsByIndex.keys(),
                ...this.conversationLabelCache.keys(),
            ]);
            const maxKnownIndex = knownIndices.size ? Math.max(...knownIndices) : -1;
            const maxIndex = Math.max(mapping.maxIndex, maxKnownIndex);

            for (let logicalIndex = 0; logicalIndex <= maxIndex; logicalIndex += 1) {
                const mappedRecord = mapping.recordsByIndex.get(logicalIndex) ?? null;
                const displayRecord = mapping.trustLabels ? mappedRecord : null;
                const officialButton = mapping.buttonsByIndex.get(logicalIndex) ?? null;
                let cachedLabel = this.conversationLabelCache.get(logicalIndex) || '';

                /*
                 * 若某个仅来自缓存的标签，与当前已可信挂载在另一个序号的记录完全
                 * 相同，它通常就是 hydration 早期错位留下的副本。宁可退回 Prompt N，
                 * 也不把最后两问错误显示到最前两问。
                 */
                if (!displayRecord && cachedLabel) {
                    const liveIndices = liveLabelIndices.get(cachedLabel);
                    if (liveIndices && !liveIndices.has(logicalIndex)) {
                        this.removeConversationCachedLabel(logicalIndex);
                        cachedLabel = '';
                    }
                }

                if (!mappedRecord && !officialButton && !cachedLabel) continue;

                const fullLabel =
                    displayRecord?.fullLabel ||
                    cachedLabel ||
                    officialButton?.getAttribute('aria-label') ||
                    `提问 ${logicalIndex + 1}`;

                items.push({
                    logicalIndex,
                    userElement: mapping.confident ? mappedRecord?.userElement ?? null : null,
                    targetElement: mapping.confident ? mappedRecord?.targetElement ?? null : null,
                    officialButton,
                    fullLabel,
                    label: this.formatConversationLabel(fullLabel),
                    mappingConfident: mapping.confident,
                });
            }

            this.conversationItems = items;
            this.lastConversationSignature = this.getConversationSignature();
            const searchConversationMapSignature = items.map((item, index) => {
                const identity = item.userElement?.isConnected
                    ? this.getConversationRecordIdentity(item.userElement, index)
                    : '';
                return `${item.logicalIndex}:${identity}`;
            }).join('|');
            if (searchConversationMapSignature !== this.searchConversationMapSignature) {
                this.searchConversationMapSignature = searchConversationMapSignature;
                this.markSearchIndexDirty(true);
            }
            this.renderConversationItems();
            const active = this.findActiveConversationIndex();
            this.activeConversationIndex = -1;
            this.applyActiveConversationIndex(active, false);
            this.updateViewMeta();
            this.syncVisibility();
        }

        renderConversationItems() {
            if (!this.conversationList) return;

            const fragment = document.createDocumentFragment();
            this.conversationItemButtons = [];

            this.conversationItems.forEach((conversation, index) => {
                const item = document.createElement('li');
                const button = document.createElement('button');
                const number = document.createElement('span');
                const label = document.createElement('span');

                button.type = 'button';
                button.className = 'toc-item';
                button.dataset.kind = 'conversation';
                button.dataset.conversationIndex = String(index);
                button.dataset.active = 'false';
                button.title = conversation.fullLabel;

                number.className = 'prompt-index';
                number.textContent = String(conversation.logicalIndex + 1);
                label.className = 'toc-item-label';
                label.textContent = conversation.label;

                button.append(number, label);
                item.appendChild(button);
                fragment.appendChild(item);
                this.conversationItemButtons.push(button);
            });

            this.conversationList.replaceChildren(fragment);
            this.updateViewMeta();
        }

        clearConversationToc(clearCache = false) {
            window.clearTimeout(this.conversationRebuildTimer);
            this.conversationRebuildTimer = 0;
            this.conversationItems = [];
            this.conversationItemButtons = [];
            this.activeConversationIndex = -1;
            this.lastConversationSignature = '';
            this.pendingConversationLogicalIndex = -1;
            this.pendingConversationUntil = 0;
            this.searchConversationMapSignature = '';
            this.markSearchIndexDirty(true);
            if (clearCache) this.clearConversationLabelCacheState();
            this.conversationList?.replaceChildren();
            this.updateViewMeta();
            this.syncVisibility();
        }

        findActiveConversationIndex() {
            if (!this.conversationItems.length) return -1;

            if (
                this.pendingConversationLogicalIndex >= 0 &&
                performance.now() < this.pendingConversationUntil
            ) {
                const pendingIndex = this.conversationItems.findIndex(
                    (item) => item.logicalIndex === this.pendingConversationLogicalIndex,
                );
                if (pendingIndex >= 0) return pendingIndex;
            }

            if (this.currentAnswer?.isConnected) {
                let best = -1;
                for (let index = 0; index < this.conversationItems.length; index += 1) {
                    const userElement = this.conversationItems[index].userElement;
                    if (!userElement?.isConnected) continue;

                    const relation = userElement.compareDocumentPosition(this.currentAnswer);
                    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
                        best = index;
                    } else if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
                        break;
                    }
                }
                if (best >= 0) return best;
            }

            const officialActiveLogicalIndex = this.getOfficialActiveLogicalIndex();
            if (officialActiveLogicalIndex >= 0) {
                const officialActiveIndex = this.conversationItems.findIndex(
                    (item) => item.logicalIndex === officialActiveLogicalIndex,
                );
                if (officialActiveIndex >= 0) return officialActiveIndex;
            }

            if (
                this.activeConversationIndex >= 0 &&
                this.activeConversationIndex < this.conversationItems.length
            ) {
                return this.activeConversationIndex;
            }

            return 0;
        }

        updateActiveConversation(force = false) {
            const index = this.findActiveConversationIndex();
            this.applyActiveConversationIndex(index, force);
        }

        applyActiveConversationIndex(index, ensureVisible) {
            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= this.conversationItemButtons.length
            ) {
                return;
            }
            if (this.activeConversationIndex === index && !ensureVisible) return;

            const previous = this.conversationItemButtons[this.activeConversationIndex];
            if (previous) {
                previous.dataset.active = 'false';
                previous.removeAttribute('aria-current');
            }

            this.activeConversationIndex = index;
            const current = this.conversationItemButtons[index];
            if (!current) return;

            current.dataset.active = 'true';
            current.setAttribute('aria-current', 'location');
            if (ensureVisible || (!this.collapsed && this.activeView === 'conversation')) {
                this.scrollItemIntoView(this.conversationNav, current);
            }
        }

        clearConversationJumpReveal() {
            window.clearTimeout(this.conversationJumpRevealTimer);
            this.conversationJumpRevealTimer = 0;
            if (this.conversationJumpRevealElement?.isConnected) {
                this.conversationJumpRevealElement.removeAttribute(
                    'data-cgpt-conversation-jump-target',
                );
            }
            this.conversationJumpRevealElement = null;
        }

        revealConversationJumpTarget(target) {
            if (!(target instanceof HTMLElement)) return;
            if (this.conversationJumpRevealElement !== target) {
                this.clearConversationJumpReveal();
            }
            this.conversationJumpRevealElement = target;
            target.setAttribute('data-cgpt-conversation-jump-target', '');
            window.clearTimeout(this.conversationJumpRevealTimer);
            this.conversationJumpRevealTimer = window.setTimeout(() => {
                this.clearConversationJumpReveal();
            }, 2400);
        }

        cancelConversationJump() {
            this.conversationJumpToken += 1;
            for (const timer of this.conversationJumpTimers) window.clearTimeout(timer);
            this.conversationJumpTimers.clear();
            this.pendingConversationLogicalIndex = -1;
            this.pendingConversationUntil = 0;
            this.clearConversationJumpReveal();
        }

        scheduleConversationJumpTask(callback, delay, token) {
            const timer = window.setTimeout(() => {
                this.conversationJumpTimers.delete(timer);
                if (token !== this.conversationJumpToken) return;
                callback();
            }, Math.max(0, Number(delay) || 0));
            this.conversationJumpTimers.add(timer);
            return timer;
        }

        resolveConversationTarget(logicalIndex) {
            const currentItem = this.conversationItems.find(
                (item) => item.logicalIndex === logicalIndex,
            );
            if (
                currentItem?.mappingConfident &&
                currentItem.targetElement?.isConnected
            ) {
                return currentItem.targetElement;
            }

            const records = this.collectUserMessageRecords();
            const mapping = this.mapUserRecordsToLogicalIndices(
                records,
                this.getOfficialNavButtons(),
            );
            const record = mapping.recordsByIndex.get(logicalIndex);
            if (!record || !mapping.confident) return null;

            if (record.fullLabel && mapping.trustLabels) {
                this.cacheConversationRecordLabel(logicalIndex, record);
            }
            if (currentItem) {
                currentItem.userElement = record.userElement;
                currentItem.targetElement = record.targetElement;
                currentItem.fullLabel = record.fullLabel || currentItem.fullLabel;
                currentItem.label = this.formatConversationLabel(currentItem.fullLabel);
                currentItem.mappingConfident = true;
            }
            return record.targetElement || record.userElement;
        }

        isUsableConversationTarget(element) {
            if (!(element instanceof HTMLElement) || !element.isConnected) return false;
            if (element.closest('[hidden]')) return false;
            const rect = element.getBoundingClientRect();
            return rect.width > 0 || rect.height > 0 || element.getClientRects().length > 0;
        }

        getConversationJumpBehavior() {
            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            return this.config.answerTocSmoothScroll && !reduceMotion ? 'smooth' : 'auto';
        }

        getConversationScrollOffset() {
            return Math.max(
                0,
                Number(this.config.conversationTocScrollOffsetPx) || 88,
            );
        }

        scrollConversationTarget(target, behavior = 'auto') {
            if (!this.isUsableConversationTarget(target)) return false;
            this.revealConversationJumpTarget(target);

            const targetRect = target.getBoundingClientRect();
            const offset = this.getConversationScrollOffset();
            const scrollRoot = this.findScrollRoot(target);

            if (scrollRoot instanceof HTMLElement) {
                const rootRect = scrollRoot.getBoundingClientRect();
                const visibleTop = Math.max(0, rootRect.top);
                const visibleBottom = Math.min(window.innerHeight, rootRect.bottom);
                const availableHeight = Math.max(1, visibleBottom - visibleTop);
                const desiredTop = visibleTop + Math.min(offset, availableHeight * 0.3);
                const delta = targetRect.top - desiredTop;
                scrollRoot.scrollBy({ top: delta, behavior });
            } else {
                const desiredTop = Math.min(offset, window.innerHeight * 0.3);
                const delta = targetRect.top - desiredTop;
                window.scrollBy({ top: delta, behavior });
            }
            return true;
        }

        correctConversationTargetPosition(target) {
            return this.scrollConversationTarget(target, 'auto');
        }

        activateOfficialConversationButton(logicalIndex) {
            const button = this.getOfficialNavButtons().find((candidate) => (
                Number.parseInt(candidate.dataset.tocItemIndex ?? '', 10) === logicalIndex
            ));
            if (!(button instanceof HTMLButtonElement) || button.disabled) return false;

            try {
                button.click();
                return true;
            } catch (error) {
                console.warn('[ChatGPT 双层目录] 官方问答跳转失败：', error);
                return false;
            }
        }

        jumpToConversation(index) {
            const item = this.conversationItems[index];
            if (!item) return;

            this.cancelConversationJump();
            const token = this.conversationJumpToken;
            const logicalIndex = item.logicalIndex;
            this.pendingConversationLogicalIndex = logicalIndex;
            this.pendingConversationUntil = performance.now() + 2600;
            this.applyActiveConversationIndex(index, true);

            const initialTarget = this.resolveConversationTarget(logicalIndex);
            const canDirectlyScroll = this.isUsableConversationTarget(initialTarget);

            if (canDirectlyScroll) {
                this.scrollConversationTarget(
                    initialTarget,
                    this.getConversationJumpBehavior(),
                );

                for (const delay of [460, 980, 1700]) {
                    this.scheduleConversationJumpTask(() => {
                        const liveTarget = this.resolveConversationTarget(logicalIndex) || initialTarget;
                        this.correctConversationTargetPosition(liveTarget);
                        this.requestFrame(true);
                    }, delay, token);
                }
            } else {
                const activated = this.activateOfficialConversationButton(logicalIndex);

                for (const delay of [100, 280, 620, 1150, 1950]) {
                    this.scheduleConversationJumpTask(() => {
                        this.syncOfficialConversationNav();
                        this.scheduleConversationRebuild(0);
                        this.requestFrame(true);

                        const liveTarget = this.resolveConversationTarget(logicalIndex);
                        if (this.isUsableConversationTarget(liveTarget)) {
                            this.correctConversationTargetPosition(liveTarget);
                            return;
                        }

                        /* React 若替换了官方按钮，在中段再解析并补点一次。 */
                        if (activated && delay === 620) {
                            const activeLogicalIndex = this.getOfficialActiveLogicalIndex();
                            if (activeLogicalIndex !== logicalIndex) {
                                this.activateOfficialConversationButton(logicalIndex);
                            }
                        }
                    }, delay, token);
                }
            }

            this.scheduleConversationJumpTask(() => {
                this.pendingConversationLogicalIndex = -1;
                this.pendingConversationUntil = 0;
                this.requestFrame(true);
                window.setTimeout(() => {
                    if (token === this.conversationJumpToken) {
                        this.clearConversationJumpReveal();
                    }
                }, 240);
            }, 2250, token);
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
            const hasSearchableContent = Boolean(
                this.config.enableQuickSearch &&
                (
                    this.config.quickSearchScope === 'current-answer'
                        ? this.currentAnswer?.isConnected
                        : this.currentAnswer?.isConnected || document.querySelector(ASSISTANT_SELECTOR)
                ),
            );
            const hasAnyNavigation =
                this.conversationItems.length > 0 ||
                this.headings.length > 0 ||
                hasSearchableContent;
            this.host.hidden = !this.isViewportEligible() || !hasAnyNavigation;

            if (this.host.hidden && this.transientHoverOpen) {
                this.transientHoverOpen = false;
                this.transientHoverOriginRect = null;
                this.clearTransientOriginClickSuppression();
                this.collapsed = true;
                this.applyCollapsedState();
            }

            if (!this.host.hidden) {
                this.applyActiveView();
                this.applyCollapsedState();
                this.updateViewMeta();
                if (this.activeView === 'search' && this.searchInput?.value.trim()) {
                    this.scheduleQuickSearch(0);
                }

                if (wasHidden) {
                    window.requestAnimationFrame(() => {
                        this.ensurePanelSizeInViewport(false);
                        this.ensureManualPositionInViewport(true);

                        if (!this.collapsed) {
                            const { nav, button } = this.getActiveViewNavigation();
                            if (button) this.scrollItemIntoView(nav, button);
                        }
                    });
                }
            }
        }

        jumpToHeading(index) {
            const heading = this.headings[index];
            if (!heading?.element?.isConnected) return;

            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            const behavior = this.config.answerTocSmoothScroll && !reduceMotion
                ? 'smooth'
                : 'auto';

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
            if (ensureVisible || (!this.collapsed && this.activeView === 'headings')) {
                this.scrollItemIntoView(this.tocNav, current);
            }
        }

        scrollItemIntoView(nav, button) {
            if (!(nav instanceof HTMLElement) || !(button instanceof HTMLElement)) return;
            if (nav.hidden) return;

            const navRect = nav.getBoundingClientRect();
            const buttonRect = button.getBoundingClientRect();
            const padding = 5;

            if (buttonRect.top < navRect.top + padding) {
                nav.scrollTop += buttonRect.top - navRect.top - padding;
            } else if (buttonRect.bottom > navRect.bottom - padding) {
                nav.scrollTop += buttonRect.bottom - navRect.bottom + padding;
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
            if (this.officialNavContainer?.isConnected) return this.officialNavContainer;
            this.syncOfficialConversationNav();
            return this.officialNavContainer;
        }

        updateInlineEndOffset() {
            if (!this.host || this.positionMode === 'manual') return;

            this.host.dataset.dockSide = 'right';
            let offset = this.config.hideOfficialConversationToc
                ? Math.max(0, Number(this.config.answerTocStandaloneInlineEndPx) || 20)
                : Math.max(0, Number(this.config.answerTocFallbackInlineEndPx) || 68);

            if (!this.config.hideOfficialConversationToc) {
                const container = this.getOfficialNavContainer();
                if (container) {
                    const rect = container.getBoundingClientRect();
                    const direction = getComputedStyle(document.documentElement).direction;
                    const occupiedFromInlineEnd = direction === 'rtl'
                        ? rect.right
                        : window.innerWidth - rect.left;

                    offset = Math.max(
                        offset,
                        Math.ceil(
                            occupiedFromInlineEnd +
                            (Number(this.config.answerTocOfficialNavGapPx) || 12),
                        ),
                    );
                }
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
