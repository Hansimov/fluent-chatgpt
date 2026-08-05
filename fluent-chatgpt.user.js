// ==UserScript==
// @name         ChatGPT 长对话性能优化、导航、搜索与归档
// @namespace    local.chatgpt
// @version      3.0.0
// @description  优化长对话渲染，提供导航、全文搜索、全量加载，以及可靠的 Markdown/HTML/图片附件 ZIP 归档
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      *
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
        answerTocInitialView: 'headings', // 可选：'conversation'、'headings'、'search' 或 'export'
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

        // 全量加载与 Markdown、离线 HTML、附件 ZIP 导出。内容仅保存在当前页面内存中。
        enableConversationArchive: true,
        conversationLoadTimeoutMs: 7000,
        conversationLoadSettleMs: 260,
        conversationLoadRetryCount: 2,
        conversationLoadStepDelayMs: 55,
        conversationExportIncludeMetadata: true,
        conversationExportShiftAnswerHeadingsBy: 3,
        conversationExportFilenameMaxLength: 90,

        // ZIP 导出默认同时包含 Markdown、离线 HTML 和可获取的图片/附件。
        conversationZipIncludeMarkdownByDefault: true,
        conversationZipIncludeHtmlByDefault: true,
        conversationZipIncludeAssetsByDefault: true,

        // 优先读取当前对话的结构化数据，解析 image_asset_pointer、attachments、citations
        // 与 file_id，再通过 /backend-api/files/download/{file_id} 获取临时下载地址。
        conversationExportUseConversationApiAssets: true,

        // 单个附件和整个 ZIP 的软限制；超限文件会写入 manifest，但不会拖垮页面。
        conversationExportAssetTimeoutMs: 30000,
        conversationExportMaxAssetBytes: 512 * 1024 * 1024,
        conversationExportMaxZipBytes: 2 * 1024 * 1024 * 1024,

        // 离线 HTML 使用完全自包含的响应式样式，不依赖 ChatGPT 页面类名或外部 CDN。
        conversationExportHtmlIncludeSidebar: true,
        conversationExportHtmlMaxWidthPx: 1240,

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


    const CRC32_TABLE = (() => {
        const table = new Uint32Array(256);
        for (let index = 0; index < 256; index += 1) {
            let value = index;
            for (let bit = 0; bit < 8; bit += 1) {
                value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
            }
            table[index] = value >>> 0;
        }
        return table;
    })();

    const updateCrc32 = (crc, bytes) => {
        let value = crc >>> 0;
        for (let index = 0; index < bytes.length; index += 1) {
            value = CRC32_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
        }
        return value >>> 0;
    };

    const getBlobCrc32 = async (blob) => {
        let crc = 0xffffffff;
        if (blob.stream && typeof blob.stream === 'function') {
            const reader = blob.stream().getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    crc = updateCrc32(crc, value);
                }
            } finally {
                reader.releaseLock?.();
            }
        } else {
            crc = updateCrc32(crc, new Uint8Array(await blob.arrayBuffer()));
        }
        return (crc ^ 0xffffffff) >>> 0;
    };

    const writeUint16 = (view, offset, value) => view.setUint16(offset, value, true);
    const writeUint32 = (view, offset, value) => view.setUint32(offset, value >>> 0, true);

    const getDosDateTime = (date = new Date()) => {
        const year = Math.max(1980, date.getFullYear());
        return {
            time: ((date.getHours() & 0x1f) << 11) |
                ((date.getMinutes() & 0x3f) << 5) |
                ((Math.floor(date.getSeconds() / 2)) & 0x1f),
            date: (((year - 1980) & 0x7f) << 9) |
                (((date.getMonth() + 1) & 0x0f) << 5) |
                (date.getDate() & 0x1f),
        };
    };

    class StoredZipBuilder {
        constructor() {
            this.parts = [];
            this.entries = [];
            this.offset = 0;
            this.encoder = new TextEncoder();
        }

        async add(path, value, modifiedAt = new Date()) {
            const normalizedPath = String(path || '')
                .replace(/\\/g, '/')
                .replace(/^\/+/, '')
                .replace(/\/{2,}/g, '/');
            if (!normalizedPath || normalizedPath.endsWith('/')) {
                throw new Error(`无效 ZIP 文件名：${path}`);
            }

            const blob = value instanceof Blob ? value : new Blob([value]);
            if (blob.size > 0xffffffff) {
                throw new Error(`ZIP32 不支持超过 4 GiB 的单个文件：${normalizedPath}`);
            }
            if (this.offset + blob.size > 0xffffffff) {
                throw new Error('ZIP32 总大小超过 4 GiB，无法继续打包');
            }

            const nameBytes = this.encoder.encode(normalizedPath);
            const crc32 = await getBlobCrc32(blob);
            const { time, date } = getDosDateTime(modifiedAt);
            const localOffset = this.offset;
            const header = new Uint8Array(30 + nameBytes.length);
            const view = new DataView(header.buffer);
            writeUint32(view, 0, 0x04034b50);
            writeUint16(view, 4, 20);
            writeUint16(view, 6, 0x0800);
            writeUint16(view, 8, 0);
            writeUint16(view, 10, time);
            writeUint16(view, 12, date);
            writeUint32(view, 14, crc32);
            writeUint32(view, 18, blob.size);
            writeUint32(view, 22, blob.size);
            writeUint16(view, 26, nameBytes.length);
            writeUint16(view, 28, 0);
            header.set(nameBytes, 30);

            this.parts.push(header, blob);
            this.entries.push({ normalizedPath, nameBytes, crc32, size: blob.size, time, date, localOffset });
            this.offset += header.length + blob.size;
        }

        build() {
            const centralParts = [];
            let centralSize = 0;
            for (const entry of this.entries) {
                const header = new Uint8Array(46 + entry.nameBytes.length);
                const view = new DataView(header.buffer);
                writeUint32(view, 0, 0x02014b50);
                writeUint16(view, 4, 20);
                writeUint16(view, 6, 20);
                writeUint16(view, 8, 0x0800);
                writeUint16(view, 10, 0);
                writeUint16(view, 12, entry.time);
                writeUint16(view, 14, entry.date);
                writeUint32(view, 16, entry.crc32);
                writeUint32(view, 20, entry.size);
                writeUint32(view, 24, entry.size);
                writeUint16(view, 28, entry.nameBytes.length);
                writeUint16(view, 30, 0);
                writeUint16(view, 32, 0);
                writeUint16(view, 34, 0);
                writeUint16(view, 36, 0);
                writeUint32(view, 38, 0);
                writeUint32(view, 42, entry.localOffset);
                header.set(entry.nameBytes, 46);
                centralParts.push(header);
                centralSize += header.length;
            }

            if (this.entries.length > 0xffff) {
                throw new Error('ZIP32 不支持超过 65535 个文件');
            }
            const centralOffset = this.offset;
            const footer = new Uint8Array(22);
            const footerView = new DataView(footer.buffer);
            writeUint32(footerView, 0, 0x06054b50);
            writeUint16(footerView, 4, 0);
            writeUint16(footerView, 6, 0);
            writeUint16(footerView, 8, this.entries.length);
            writeUint16(footerView, 10, this.entries.length);
            writeUint32(footerView, 12, centralSize);
            writeUint32(footerView, 16, centralOffset);
            writeUint16(footerView, 20, 0);
            return new Blob([...this.parts, ...centralParts, footer], { type: 'application/zip' });
        }
    }

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
            this.exportList = null;
            this.exportNav = null;
            this.exportView = null;
            this.exportEmptyState = null;
            this.headingEmptyState = null;
            this.conversationEmptyState = null;
            this.conversationTools = null;
            this.conversationLoadAllButton = null;
            this.conversationCancelLoadButton = null;
            this.conversationSelectAllButton = null;
            this.conversationClearSelectionButton = null;
            this.conversationExportSelectedButton = null;
            this.conversationExportAllButton = null;
            this.conversationExportSelectedZipButton = null;
            this.conversationExportAllZipButton = null;
            this.exportIncludeMarkdownInput = null;
            this.exportIncludeHtmlInput = null;
            this.exportIncludeAssetsInput = null;
            this.conversationArchiveStatus = null;
            this.conversationSelectionStatus = null;
            this.countLabel = null;
            this.launcherCount = null;
            this.launcherMode = null;
            this.panelHeader = null;
            this.collapseButton = null;
            this.viewConversationButton = null;
            this.viewHeadingsButton = null;
            this.viewSearchButton = null;
            this.viewExportButton = null;
            this.viewConversationCount = null;
            this.viewHeadingsCount = null;
            this.viewSearchCount = null;
            this.viewExportCount = null;
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
            this.exportItemButtons = [];
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

            this.conversationArchive = new Map();
            this.conversationArchiveFailures = new Map();
            this.selectedConversationIndices = new Set();
            this.conversationLoadRunId = 0;
            this.conversationLoadAbortController = null;
            this.conversationLoadPromise = null;
            this.conversationLoadMode = '';
            this.conversationLoadProgress = { completed: 0, total: 0, failed: 0 };
            this.conversationExportInProgress = false;
            this.conversationAssetProgress = { completed: 0, total: 0, failed: 0 };
            this.sessionAccessToken = '';
            this.sessionAccessTokenPromise = null;
            this.conversationApiSnapshot = null;
            this.conversationApiSnapshotPromise = null;
            this.conversationApiSnapshotId = '';
            this.conversationApiAssetsByIndex = new Map();
            this.apiDeviceId = '';
            this.exportIncludeMarkdown = this.config.conversationZipIncludeMarkdownByDefault !== false;
            this.exportIncludeHtml = this.config.conversationZipIncludeHtmlByDefault !== false;
            if (!this.exportIncludeMarkdown && !this.exportIncludeHtml) this.exportIncludeMarkdown = true;
            this.exportIncludeAssets = this.config.conversationZipIncludeAssetsByDefault !== false;

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
            const exportEnabled = Boolean(this.config.enableConversationArchive);
            const viewColumnCount = 2 + Number(searchEnabled) + Number(exportEnabled);
            const searchTabHtml = searchEnabled
                ? `<button id="view-search" class="view-tab" type="button" role="tab" data-view="search" aria-selected="false">
              <span>搜索</span><span id="view-search-count" class="view-count">0</span>
            </button>`
                : '';
            const exportTabHtml = exportEnabled
                ? `<button id="view-export" class="view-tab" type="button" role="tab" data-view="export" aria-selected="false">
              <span>导出</span><span id="view-export-count" class="view-count">0</span>
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
            const exportViewHtml = exportEnabled
                ? `<section id="export-view" class="export-view" aria-label="加载与导出" hidden>
              <div id="conversation-tools" class="conversation-tools" aria-label="问答加载、选择与导出工具">
                <div class="conversation-tool-row">
                  <button id="conversation-load-all" class="tool-button" data-primary="true" type="button" title="依次访问所有问答并将正文和资源描述缓存到当前页面内存">加载全部</button>
                  <button id="conversation-cancel-load" class="tool-button" type="button" title="停止当前加载或导出准备" hidden>停止</button>
                  <span id="conversation-archive-status" class="conversation-tool-status" aria-live="polite">已缓存 0/0</span>
                </div>
                <div class="conversation-tool-row">
                  <button id="conversation-select-all" class="tool-button" type="button">全选</button>
                  <button id="conversation-clear-selection" class="tool-button" type="button">清空</button>
                  <span id="conversation-selection-status" class="conversation-tool-status">已选 0</span>
                </div>
                <fieldset class="export-options">
                  <legend>ZIP 内容</legend>
                  <label class="export-option"><input id="export-include-markdown" type="checkbox" ${this.exportIncludeMarkdown ? 'checked' : ''}/>Markdown</label>
                  <label class="export-option"><input id="export-include-html" type="checkbox" ${this.exportIncludeHtml ? 'checked' : ''}/>离线 HTML</label>
                  <label class="export-option"><input id="export-include-assets" type="checkbox" ${this.exportIncludeAssets ? 'checked' : ''}/>图片和附件</label>
                </fieldset>
                <div class="conversation-tool-row export-button-grid">
                  <button id="conversation-export-selected" class="tool-button" type="button" title="导出单个 Markdown 文件">选中 MD</button>
                  <button id="conversation-export-all" class="tool-button" type="button" title="导出单个 Markdown 文件">全部 MD</button>
                  <button id="conversation-export-selected-zip" class="tool-button" data-primary="true" type="button" title="导出 Markdown/HTML 及可获取附件的 ZIP">选中 ZIP</button>
                  <button id="conversation-export-all-zip" class="tool-button" data-primary="true" type="button" title="导出 Markdown/HTML 及可获取附件的 ZIP">全部 ZIP</button>
                </div>
              </div>
              <nav id="export-nav" class="toc-nav export-nav" aria-label="选择需要导出的问答">
                <div id="export-empty" class="empty-state" hidden>暂未找到可导出的问答</div>
                <ol id="export-list" class="toc-list"></ol>
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
          .export-view[hidden],
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

          .export-view {
            min-height: 0;
            display: flex;
            flex: 1;
            flex-direction: column;
          }

          .conversation-tools {
            flex: none;
            display: flex;
            flex-direction: column;
            gap: 5px;
            padding: 6px 7px;
            border-bottom: 1px solid var(--border-light, rgba(0, 0, 0, 0.09));
          }

          .conversation-tool-row {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 5px;
            flex-wrap: wrap;
          }

          .tool-button {
            min-height: 27px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
            padding: 4px 8px;
            border: 1px solid var(--border-light, rgba(0, 0, 0, 0.13));
            border-radius: 7px;
            background: color-mix(in srgb, var(--main-surface-secondary, #f3f3f3) 66%, transparent);
            color: var(--text-secondary, #4a4a4a);
            font-size: 10.5px;
            line-height: 1.2;
            cursor: pointer;
          }

          .tool-button:hover:not(:disabled) {
            background: var(--main-surface-secondary, var(--bg-secondary, #ededed));
            color: var(--text-primary, #111111);
          }

          .tool-button:disabled {
            cursor: not-allowed;
            opacity: 0.46;
          }

          .tool-button[data-primary="true"] {
            font-weight: 600;
          }

          .export-options {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
            margin: 0;
            padding: 5px 7px;
            border: 1px solid var(--border-light, rgba(0, 0, 0, 0.11));
            border-radius: 8px;
          }

          .export-options legend {
            padding-inline: 4px;
            color: var(--text-tertiary, #777777);
            font-size: 10px;
          }

          .export-option {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            color: var(--text-secondary, #4a4a4a);
            font-size: 10.5px;
            cursor: pointer;
            user-select: none;
          }

          .export-option input {
            width: 13px;
            height: 13px;
            margin: 0;
            accent-color: currentColor;
          }

          .export-button-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .export-button-grid .tool-button {
            min-width: 0;
            padding-inline: 5px;
          }

          .conversation-tool-status {
            min-width: 0;
            flex: 1 1 90px;
            overflow: hidden;
            color: var(--text-tertiary, #777777);
            font-size: 10px;
            line-height: 1.25;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .conversation-row {
            min-width: 0;
            display: grid;
            grid-template-columns: 24px minmax(0, 1fr);
            align-items: stretch;
            gap: 2px;
          }

          .conversation-row[data-selectable="false"] {
            grid-template-columns: minmax(0, 1fr);
          }

          .conversation-select {
            width: 24px;
            display: grid;
            place-items: center;
            cursor: pointer;
          }

          .conversation-select input {
            width: 14px;
            height: 14px;
            margin: 0;
            accent-color: currentColor;
            cursor: pointer;
          }

          .conversation-row[data-archived="true"] .prompt-index::after {
            margin-inline-start: 2px;
            color: var(--text-tertiary, #777777);
            content: "✓";
            font-size: 9px;
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
          #conversation-list .toc-item,
          #export-list .toc-item {
            height: auto;
            flex: 0 0 auto;
          }

          #conversation-list .toc-item-label,
          #export-list .toc-item-label {
            ${conversationPreviewCss}
            max-height: none;
            text-overflow: clip;
            white-space: pre-wrap;
            word-break: break-word;
          }

          .export-asset-count {
            flex: none;
            align-self: center;
            padding: 1px 5px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--text-tertiary, #777777) 11%, transparent);
            color: var(--text-tertiary, #777777);
            font-size: 9.5px;
            white-space: nowrap;
          }

          .export-nav {
            padding-top: 5px;
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
            .search-toolbar,
            .conversation-tools {
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
            ${exportTabHtml}
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

          ${exportViewHtml}

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
            this.exportList = shadow.getElementById('export-list');
            this.exportNav = shadow.getElementById('export-nav');
            this.exportView = shadow.getElementById('export-view');
            this.exportEmptyState = shadow.getElementById('export-empty');
            this.headingEmptyState = shadow.getElementById('heading-empty');
            this.conversationEmptyState = shadow.getElementById('conversation-empty');
            this.conversationTools = shadow.getElementById('conversation-tools');
            this.conversationLoadAllButton = shadow.getElementById('conversation-load-all');
            this.conversationCancelLoadButton = shadow.getElementById('conversation-cancel-load');
            this.conversationSelectAllButton = shadow.getElementById('conversation-select-all');
            this.conversationClearSelectionButton = shadow.getElementById('conversation-clear-selection');
            this.conversationExportSelectedButton = shadow.getElementById('conversation-export-selected');
            this.conversationExportAllButton = shadow.getElementById('conversation-export-all');
            this.conversationExportSelectedZipButton = shadow.getElementById('conversation-export-selected-zip');
            this.conversationExportAllZipButton = shadow.getElementById('conversation-export-all-zip');
            this.exportIncludeMarkdownInput = shadow.getElementById('export-include-markdown');
            this.exportIncludeHtmlInput = shadow.getElementById('export-include-html');
            this.exportIncludeAssetsInput = shadow.getElementById('export-include-assets');
            this.conversationArchiveStatus = shadow.getElementById('conversation-archive-status');
            this.conversationSelectionStatus = shadow.getElementById('conversation-selection-status');
            this.countLabel = shadow.getElementById('count-label');
            this.launcherCount = shadow.getElementById('launcher-count');
            this.launcherMode = shadow.getElementById('launcher-mode');
            this.panelHeader = shadow.querySelector('.panel-header');
            this.collapseButton = shadow.getElementById('collapse-button');
            this.viewConversationButton = shadow.getElementById('view-conversation');
            this.viewHeadingsButton = shadow.getElementById('view-headings');
            this.viewSearchButton = shadow.getElementById('view-search');
            this.viewExportButton = shadow.getElementById('view-export');
            this.viewConversationCount = shadow.getElementById('view-conversation-count');
            this.viewHeadingsCount = shadow.getElementById('view-headings-count');
            this.viewSearchCount = shadow.getElementById('view-search-count');
            this.viewExportCount = shadow.getElementById('view-export-count');
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
            this.viewExportButton?.addEventListener('click', () => {
                this.setActiveView('export', true);
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

            this.conversationLoadAllButton?.addEventListener('click', () => {
                this.loadAllConversations();
            });
            this.conversationCancelLoadButton?.addEventListener('click', () => {
                this.cancelConversationArchiveLoad('用户已停止');
            });
            this.conversationSelectAllButton?.addEventListener('click', () => {
                this.selectAllConversations();
            });
            this.conversationClearSelectionButton?.addEventListener('click', () => {
                this.clearConversationSelection();
            });
            this.conversationExportSelectedButton?.addEventListener('click', () => {
                this.exportSelectedConversations();
            });
            this.conversationExportAllButton?.addEventListener('click', () => {
                this.exportAllConversations();
            });
            this.conversationExportSelectedZipButton?.addEventListener('click', () => {
                this.exportSelectedConversationsZip();
            });
            this.conversationExportAllZipButton?.addEventListener('click', () => {
                this.exportAllConversationsZip();
            });

            const syncExportOptions = () => {
                this.exportIncludeMarkdown = Boolean(this.exportIncludeMarkdownInput?.checked);
                this.exportIncludeHtml = Boolean(this.exportIncludeHtmlInput?.checked);
                this.exportIncludeAssets = Boolean(this.exportIncludeAssetsInput?.checked);
                if (!this.exportIncludeMarkdown && !this.exportIncludeHtml) {
                    this.exportIncludeMarkdown = true;
                    if (this.exportIncludeMarkdownInput) this.exportIncludeMarkdownInput.checked = true;
                }
                this.updateConversationArchiveUi();
            };
            this.exportIncludeMarkdownInput?.addEventListener('change', syncExportOptions);
            this.exportIncludeHtmlInput?.addEventListener('change', syncExportOptions);
            this.exportIncludeAssetsInput?.addEventListener('change', syncExportOptions);

            this.exportList?.addEventListener('change', (event) => {
                const checkbox = event.target instanceof Element
                    ? event.target.closest('input[data-conversation-select-index]')
                    : null;
                if (!(checkbox instanceof HTMLInputElement)) return;
                const logicalIndex = Number.parseInt(checkbox.dataset.conversationSelectIndex ?? '', 10);
                if (!Number.isInteger(logicalIndex)) return;
                this.setConversationSelected(logicalIndex, checkbox.checked);
            });

            const handleConversationJumpClick = (event) => {
                const button = event.target instanceof Element
                    ? event.target.closest('button[data-conversation-index]')
                    : null;
                if (!(button instanceof HTMLButtonElement)) return;

                const index = Number.parseInt(button.dataset.conversationIndex ?? '', 10);
                if (Number.isInteger(index)) this.jumpToConversation(index);
            };
            this.conversationList?.addEventListener('click', handleConversationJumpClick);
            this.exportList?.addEventListener('click', handleConversationJumpClick);

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
            } else if (
                this.config.answerTocInitialView === 'export' &&
                this.config.enableConversationArchive
            ) {
                fallback = 'export';
            }
            if (!this.config.answerTocRememberView) return fallback;

            try {
                const stored = localStorage.getItem('cgpt-answer-toc-view-v1');
                if (stored === 'conversation' || stored === 'headings') return stored;
                if (stored === 'search' && this.config.enableQuickSearch) return stored;
                if (stored === 'export' && this.config.enableConversationArchive) return stored;
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
            } else if (view === 'export' && this.config.enableConversationArchive) {
                nextView = 'export';
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
            const exportActive = this.activeView === 'export' && this.config.enableConversationArchive;
            this.conversationNav.hidden = !conversationActive;
            this.tocNav.hidden = !headingsActive;
            if (this.searchView) this.searchView.hidden = !searchActive;
            if (this.exportView) this.exportView.hidden = !exportActive;
            this.viewConversationButton?.setAttribute('aria-selected', String(conversationActive));
            this.viewHeadingsButton?.setAttribute('aria-selected', String(headingsActive));
            this.viewSearchButton?.setAttribute('aria-selected', String(searchActive));
            this.viewExportButton?.setAttribute('aria-selected', String(exportActive));
            this.viewConversationButton?.setAttribute('tabindex', conversationActive ? '0' : '-1');
            this.viewHeadingsButton?.setAttribute('tabindex', headingsActive ? '0' : '-1');
            this.viewSearchButton?.setAttribute('tabindex', searchActive ? '0' : '-1');
            this.viewExportButton?.setAttribute('tabindex', exportActive ? '0' : '-1');
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
            const archiveTotal = this.getAllConversationLogicalIndices().length;
            const archiveLoaded = this.getAllConversationLogicalIndices()
                .filter((index) => this.conversationArchive.has(index)).length;
            const archiveSelected = this.selectedConversationIndices.size;
            const conversationActive = this.activeView === 'conversation';
            const searchActive = this.activeView === 'search';
            const exportActive = this.activeView === 'export';
            const activeCount = conversationActive
                ? String(conversationCount)
                : searchActive
                    ? searchCountLabel
                    : exportActive
                        ? String(archiveSelected || archiveLoaded)
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
            if (this.viewExportCount) {
                this.viewExportCount.textContent = archiveTotal ? `${archiveLoaded}/${archiveTotal}` : '0';
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
                } else if (exportActive) {
                    this.countLabel.textContent = `缓存 ${archiveLoaded}/${archiveTotal}，已选 ${archiveSelected}`;
                } else {
                    this.countLabel.textContent = `${headingCount} 节`;
                }
            }
            if (this.launcherMode) {
                this.launcherMode.textContent = conversationActive ? '问' : searchActive ? '搜' : exportActive ? '导' : '章';
            }
            if (this.launcherCount) {
                this.launcherCount.textContent = activeCount;
            }
            if (this.launcher) {
                this.launcher.title = `悬停临时展开；在目录中点击、拖动或缩放后保持展开；问答 ${conversationCount}，章节 ${headingCount}，搜索 ${searchCount}，缓存 ${archiveLoaded}/${archiveTotal}（Alt+Shift+F）`;
            }
            if (this.conversationEmptyState) {
                this.conversationEmptyState.hidden = conversationCount > 0;
            }
            if (this.exportEmptyState) {
                this.exportEmptyState.hidden = conversationCount > 0;
            }
            if (this.headingEmptyState) {
                this.headingEmptyState.hidden = headingCount > 0;
            }
            this.updateConversationArchiveUi();
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
            if (this.activeView === 'export') {
                return {
                    nav: this.exportNav,
                    button: this.exportItemButtons[this.activeConversationIndex] || null,
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
            this.cancelConversationArchiveLoad('页面已切换', false, true);
            this.conversationArchive.clear();
            this.conversationArchiveFailures.clear();
            this.selectedConversationIndices.clear();
            this.conversationApiSnapshot = null;
            this.conversationApiSnapshotPromise = null;
            this.conversationApiSnapshotId = '';
            this.conversationApiAssetsByIndex.clear();
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
                : this.conversationArchive.size
                    ? '当前对话（含已缓存问答）'
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
            const liveLogicalIndices = new Set(
                [...contextMap.values()].filter((index) => Number.isInteger(index) && index >= 0),
            );
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

            if (
                this.config.quickSearchScope === 'conversation' &&
                this.conversationArchive.size &&
                descriptors.length < maxBlocks
            ) {
                const archives = [...this.conversationArchive.values()]
                    .sort((a, b) => a.logicalIndex - b.logicalIndex);
                for (const archive of archives) {
                    if (liveLogicalIndices.has(archive.logicalIndex)) continue;
                    const virtualDescriptors = this.parseArchiveMarkdownSearchDescriptors(
                        archive,
                        order,
                    );
                    for (const descriptor of virtualDescriptors) {
                        descriptors.push(descriptor);
                        order += 1;
                        if (descriptors.length >= maxBlocks) return descriptors;
                    }
                }
            }

            return descriptors;
        }

        stripMarkdownInlineForSearch(text) {
            return this.normalizeConversationText(
                String(text || '')
                    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
                    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
                    .replace(/`+([^`]+)`+/g, '$1')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/[*_~]+/g, '')
                    .replace(/\\([\\`*_[\]{}()#+.!|>-])/g, '$1'),
            );
        }

        parseArchiveMarkdownSearchDescriptors(archive, orderStart = 0) {
            const markdown = String(archive?.assistantMarkdown || '');
            if (!markdown) return [];
            const descriptors = [];
            const lines = markdown.split(/\r?\n/);
            let paragraph = [];
            let quote = [];
            let code = [];
            let inCode = false;
            let codeFence = '';
            let order = orderStart;

            const pushDescriptor = (fullText, meta) => {
                const text = this.stripMarkdownInlineForSearch(fullText);
                if (!text) return;
                descriptors.push({
                    element: null,
                    assistant: null,
                    logicalIndex: archive.logicalIndex,
                    tagName: meta.tagName,
                    order,
                    archiveBacked: true,
                    fullText: text,
                    kind: meta.kind,
                    kindLabel: meta.kindLabel,
                    level: meta.level || 0,
                });
                order += 1;
            };
            const flushParagraph = () => {
                if (!paragraph.length) return;
                pushDescriptor(paragraph.join(' '), {
                    tagName: 'P', kind: 'paragraph', kindLabel: '段落', level: 0,
                });
                paragraph = [];
            };
            const flushQuote = () => {
                if (!quote.length) return;
                pushDescriptor(quote.join(' '), {
                    tagName: 'BLOCKQUOTE', kind: 'quote', kindLabel: '引用', level: 0,
                });
                quote = [];
            };
            const flushCode = () => {
                if (!code.length || !this.config.quickSearchIncludeCodeBlocks) {
                    code = [];
                    return;
                }
                pushDescriptor(code.join('\n'), {
                    tagName: 'PRE', kind: 'code', kindLabel: '代码', level: 0,
                });
                code = [];
            };

            for (const rawLine of lines) {
                const fence = /^\s*(`{3,}|~{3,})/.exec(rawLine);
                if (fence) {
                    flushParagraph();
                    flushQuote();
                    if (!inCode) {
                        inCode = true;
                        codeFence = fence[1][0];
                    } else if (fence[1][0] === codeFence) {
                        inCode = false;
                        codeFence = '';
                        flushCode();
                    }
                    continue;
                }
                if (inCode) {
                    code.push(rawLine);
                    continue;
                }

                const line = rawLine.trim();
                if (!line) {
                    flushParagraph();
                    flushQuote();
                    continue;
                }
                const heading = /^(#{1,6})\s+(.+)$/.exec(line);
                if (heading) {
                    flushParagraph();
                    flushQuote();
                    const level = heading[1].length;
                    pushDescriptor(heading[2], {
                        tagName: `H${level}`,
                        kind: 'heading',
                        kindLabel: `H${level}`,
                        level,
                    });
                    continue;
                }
                if (/^>\s?/.test(line)) {
                    flushParagraph();
                    quote.push(line.replace(/^>\s?/, ''));
                    continue;
                }
                const list = /^(?:[-+*]|\d+[.)])\s+(.+)$/.exec(line);
                if (list) {
                    flushParagraph();
                    flushQuote();
                    pushDescriptor(list[1], {
                        tagName: 'LI', kind: 'list', kindLabel: '列表', level: 0,
                    });
                    continue;
                }
                if (/^\|.*\|$/.test(line)) {
                    flushParagraph();
                    flushQuote();
                    if (/^\|(?:\s*:?-+:?\s*\|)+$/.test(line)) continue;
                    const cells = line.slice(1, -1).split('|').map((cell) => cell.trim());
                    pushDescriptor(cells.join(' · '), {
                        tagName: 'TR', kind: 'table', kindLabel: '表格', level: 0,
                    });
                    continue;
                }
                if (/^(?:-{3,}|_{3,}|\*{3,})$/.test(line)) {
                    flushParagraph();
                    flushQuote();
                    continue;
                }
                flushQuote();
                paragraph.push(line);
            }
            flushParagraph();
            flushQuote();
            flushCode();
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
            if (!descriptor) return null;
            if (descriptor.element && !descriptor.element.isConnected) return null;
            if (!descriptor.element && !descriptor.archiveBacked) return null;
            const fullText = descriptor.fullText || this.extractSearchBlockText(descriptor.element);
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
                ...this.conversationArchive.keys(),
            ]);
            const maxKnownIndex = knownIndices.size ? Math.max(...knownIndices) : -1;
            const maxIndex = Math.max(mapping.maxIndex, maxKnownIndex);

            for (let logicalIndex = 0; logicalIndex <= maxIndex; logicalIndex += 1) {
                const mappedRecord = mapping.recordsByIndex.get(logicalIndex) ?? null;
                const displayRecord = mapping.trustLabels ? mappedRecord : null;
                const officialButton = mapping.buttonsByIndex.get(logicalIndex) ?? null;
                let cachedLabel =
                    this.conversationArchive.get(logicalIndex)?.userText ||
                    this.conversationLabelCache.get(logicalIndex) ||
                    '';

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
                    archived: this.conversationArchive.has(logicalIndex),
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

            const navigationFragment = document.createDocumentFragment();
            const exportFragment = document.createDocumentFragment();
            this.conversationItemButtons = [];
            this.exportItemButtons = [];
            const validIndices = new Set(this.conversationItems.map((item) => item.logicalIndex));
            for (const logicalIndex of [...this.selectedConversationIndices]) {
                if (!validIndices.has(logicalIndex)) this.selectedConversationIndices.delete(logicalIndex);
            }

            const buildPromptButton = (conversation, index) => {
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
                return button;
            };

            this.conversationItems.forEach((conversation, index) => {
                const navigationItem = document.createElement('li');
                const navigationRow = document.createElement('div');
                const navigationButton = buildPromptButton(conversation, index);
                navigationRow.className = 'conversation-row';
                navigationRow.dataset.selectable = 'false';
                navigationRow.dataset.archived = String(this.conversationArchive.has(conversation.logicalIndex));
                navigationRow.appendChild(navigationButton);
                navigationItem.appendChild(navigationRow);
                navigationFragment.appendChild(navigationItem);
                this.conversationItemButtons.push(navigationButton);

                if (this.exportList) {
                    const exportItem = document.createElement('li');
                    const exportRow = document.createElement('div');
                    const selectLabel = document.createElement('label');
                    const checkbox = document.createElement('input');
                    const exportButton = buildPromptButton(conversation, index);
                    const archive = this.conversationArchive.get(conversation.logicalIndex);
                    const assetCount = Array.isArray(archive?.assets) ? archive.assets.length : 0;

                    exportRow.className = 'conversation-row';
                    exportRow.dataset.selectable = 'true';
                    exportRow.dataset.archived = String(Boolean(archive));

                    selectLabel.className = 'conversation-select';
                    selectLabel.title = `选择第 ${conversation.logicalIndex + 1} 轮用于导出`;
                    checkbox.type = 'checkbox';
                    checkbox.dataset.conversationSelectIndex = String(conversation.logicalIndex);
                    checkbox.checked = this.selectedConversationIndices.has(conversation.logicalIndex);
                    checkbox.setAttribute('aria-label', `选择第 ${conversation.logicalIndex + 1} 轮`);
                    selectLabel.appendChild(checkbox);

                    if (assetCount > 0) {
                        const badge = document.createElement('span');
                        badge.className = 'export-asset-count';
                        badge.textContent = `附件 ${assetCount}`;
                        badge.title = `已发现 ${assetCount} 个图片、附件或 Artifact 资源`;
                        exportButton.appendChild(badge);
                    }

                    exportRow.append(selectLabel, exportButton);
                    exportItem.appendChild(exportRow);
                    exportFragment.appendChild(exportItem);
                    this.exportItemButtons.push(exportButton);
                }
            });

            this.conversationList.replaceChildren(navigationFragment);
            this.exportList?.replaceChildren(exportFragment);
            this.updateViewMeta();
        }

        clearConversationToc(clearCache = false) {
            window.clearTimeout(this.conversationRebuildTimer);
            this.conversationRebuildTimer = 0;
            this.conversationItems = [];
            this.conversationItemButtons = [];
            this.exportItemButtons = [];
            this.activeConversationIndex = -1;
            this.lastConversationSignature = '';
            this.pendingConversationLogicalIndex = -1;
            this.pendingConversationUntil = 0;
            this.searchConversationMapSignature = '';
            this.markSearchIndexDirty(true);
            if (clearCache) this.clearConversationLabelCacheState();
            this.conversationList?.replaceChildren();
            this.exportList?.replaceChildren();
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
            const previousExport = this.exportItemButtons[this.activeConversationIndex];
            for (const button of [previous, previousExport]) {
                if (!button) continue;
                button.dataset.active = 'false';
                button.removeAttribute('aria-current');
            }

            this.activeConversationIndex = index;
            const current = this.conversationItemButtons[index];
            const currentExport = this.exportItemButtons[index];
            if (!current) return;

            for (const button of [current, currentExport]) {
                if (!button) continue;
                button.dataset.active = 'true';
                button.setAttribute('aria-current', 'location');
            }
            if (ensureVisible || (!this.collapsed && this.activeView === 'conversation')) {
                this.scrollItemIntoView(this.conversationNav, current);
            }
            if (ensureVisible || (!this.collapsed && this.activeView === 'export')) {
                this.scrollItemIntoView(this.exportNav, currentExport);
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


        getAllConversationLogicalIndices() {
            const indices = new Set();
            for (const button of this.getOfficialNavButtons()) {
                const index = Number.parseInt(button.dataset.tocItemIndex ?? '', 10);
                if (Number.isInteger(index) && index >= 0) indices.add(index);
            }
            for (const item of this.conversationItems) {
                if (Number.isInteger(item.logicalIndex) && item.logicalIndex >= 0) {
                    indices.add(item.logicalIndex);
                }
            }
            for (const index of this.conversationArchive.keys()) indices.add(index);
            return [...indices].sort((a, b) => a - b);
        }

        updateConversationArchiveUi(message = '') {
            if (!this.config.enableConversationArchive) return;
            const indices = this.getAllConversationLogicalIndices();
            const total = indices.length;
            const loaded = indices.filter((index) => this.conversationArchive.has(index)).length;
            const selected = indices.filter((index) => this.selectedConversationIndices.has(index)).length;
            const busy = Boolean(this.conversationLoadPromise || this.conversationExportInProgress);

            if (this.conversationArchiveStatus) {
                if (message) {
                    this.conversationArchiveStatus.textContent = message;
                } else if (this.conversationLoadPromise) {
                    const { completed, total: taskTotal, failed } = this.conversationLoadProgress;
                    this.conversationArchiveStatus.textContent = `处理中 ${completed}/${taskTotal}${failed ? `，失败 ${failed}` : ''}`;
                } else if (this.conversationExportInProgress && this.conversationAssetProgress.total) {
                    const { completed, total: taskTotal, failed } = this.conversationAssetProgress;
                    this.conversationArchiveStatus.textContent = `附件 ${completed}/${taskTotal}${failed ? `，失败 ${failed}` : ''}`;
                } else {
                    this.conversationArchiveStatus.textContent = `已缓存 ${loaded}/${total}`;
                }
            }
            if (this.conversationSelectionStatus) {
                this.conversationSelectionStatus.textContent = `已选 ${selected}`;
            }
            if (this.conversationLoadAllButton) {
                this.conversationLoadAllButton.disabled = busy || !total || loaded >= total;
                this.conversationLoadAllButton.textContent = loaded >= total && total > 0 ? '已加载全部' : '加载全部';
            }
            if (this.conversationCancelLoadButton) {
                this.conversationCancelLoadButton.hidden = !this.conversationLoadPromise && !this.conversationExportInProgress;
            }
            if (this.conversationSelectAllButton) {
                this.conversationSelectAllButton.disabled = !total || selected >= total;
            }
            if (this.conversationClearSelectionButton) {
                this.conversationClearSelectionButton.disabled = selected === 0;
            }
            if (this.conversationExportSelectedButton) {
                this.conversationExportSelectedButton.disabled = busy || selected === 0;
            }
            if (this.conversationExportAllButton) {
                this.conversationExportAllButton.disabled = busy || !total;
            }
            if (this.conversationExportSelectedZipButton) {
                this.conversationExportSelectedZipButton.disabled = busy || selected === 0;
            }
            if (this.conversationExportAllZipButton) {
                this.conversationExportAllZipButton.disabled = busy || !total;
            }
            for (const input of [
                this.exportIncludeMarkdownInput,
                this.exportIncludeHtmlInput,
                this.exportIncludeAssetsInput,
            ]) {
                if (input) input.disabled = busy;
            }
            if (this.viewExportCount) {
                this.viewExportCount.textContent = total ? `${loaded}/${total}` : '0';
            }
        }

        setConversationSelected(logicalIndex, selected) {
            if (!Number.isInteger(logicalIndex) || logicalIndex < 0) return;
            if (selected) this.selectedConversationIndices.add(logicalIndex);
            else this.selectedConversationIndices.delete(logicalIndex);
            this.updateViewMeta();
        }

        selectAllConversations() {
            for (const index of this.getAllConversationLogicalIndices()) {
                this.selectedConversationIndices.add(index);
            }
            this.renderConversationItems();
        }

        clearConversationSelection() {
            this.selectedConversationIndices.clear();
            this.renderConversationItems();
        }

        cancelConversationArchiveLoad(reason = '已停止', updateUi = true, invalidate = false) {
            if (invalidate) this.conversationLoadRunId += 1;
            this.conversationLoadAbortController?.abort();
            if (invalidate) {
                this.conversationLoadAbortController = null;
                this.conversationLoadPromise = null;
                this.conversationLoadMode = '';
                this.conversationExportInProgress = false;
            }
            if (updateUi) this.updateConversationArchiveUi(reason);
        }

        waitForDelay(ms, signal) {
            return new Promise((resolve, reject) => {
                if (signal?.aborted) {
                    reject(new DOMException('Aborted', 'AbortError'));
                    return;
                }
                const timer = window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
                signal?.addEventListener('abort', () => {
                    window.clearTimeout(timer);
                    reject(new DOMException('Aborted', 'AbortError'));
                }, { once: true });
            });
        }

        async waitForOfficialConversationButtonsStable(signal) {
            let previousSignature = '';
            const startedAt = performance.now();
            let stableSince = startedAt;
            const deadline = startedAt + 3200;

            while (performance.now() < deadline) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                const buttons = this.syncOfficialConversationNav();
                const signature = buttons.map((button) => button.dataset.tocItemIndex ?? '').join(',');
                const now = performance.now();
                if (signature !== previousSignature) {
                    previousSignature = signature;
                    stableSince = now;
                } else if (
                    buttons.length &&
                    now - startedAt >= 850 &&
                    now - stableSince >= 420
                ) {
                    return buttons;
                }
                await this.waitForDelay(90, signal);
            }
            return this.getOfficialNavButtons();
        }

        getConversationReturnPoint() {
            const officialIndex = this.getOfficialActiveLogicalIndex();
            const activeItem = this.conversationItems[this.activeConversationIndex];
            const logicalIndex = officialIndex >= 0 ? officialIndex : activeItem?.logicalIndex ?? -1;
            const target = logicalIndex >= 0 ? this.resolveConversationTarget(logicalIndex) : null;
            const scrollRoot = target instanceof HTMLElement
                ? this.findScrollRoot(target)
                : this.currentScrollRoot;
            return {
                logicalIndex,
                targetTop: target instanceof HTMLElement ? target.getBoundingClientRect().top : null,
                scrollRoot: scrollRoot instanceof HTMLElement ? scrollRoot : null,
                scrollTop: scrollRoot instanceof HTMLElement
                    ? scrollRoot.scrollTop
                    : window.scrollY || document.documentElement.scrollTop || 0,
            };
        }

        async restoreConversationReturnPoint(returnPoint, signal) {
            if (!returnPoint || signal?.aborted) return;
            const { logicalIndex, targetTop, scrollRoot, scrollTop } = returnPoint;

            if (Number.isInteger(logicalIndex) && logicalIndex >= 0) {
                this.activateOfficialConversationButton(logicalIndex);
                const pair = await this.waitForConversationPair(logicalIndex, signal, 2500, false).catch(() => null);
                const target = pair?.targetElement || this.resolveConversationTarget(logicalIndex);
                if (target instanceof HTMLElement && Number.isFinite(targetTop)) {
                    const delta = target.getBoundingClientRect().top - targetTop;
                    const root = this.findScrollRoot(target);
                    if (root instanceof HTMLElement) root.scrollBy({ top: delta, behavior: 'auto' });
                    else window.scrollBy({ top: delta, behavior: 'auto' });
                    return;
                }
            }

            if (scrollRoot?.isConnected) scrollRoot.scrollTop = scrollTop;
            else window.scrollTo({ top: scrollTop, behavior: 'auto' });
        }

        getAssistantMessageElements() {
            return [...document.querySelectorAll(ASSISTANT_SELECTOR)]
                .filter((element) => element instanceof HTMLElement && element.isConnected)
                .sort((a, b) => {
                    if (a === b) return 0;
                    const relation = a.compareDocumentPosition(b);
                    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
                    if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
                    return 0;
                });
        }

        findAssistantForUser(userElement) {
            if (!(userElement instanceof HTMLElement) || !userElement.isConnected) return null;
            const userTurnNumber = this.getConversationTurnNumber(userElement);
            if (Number.isInteger(userTurnNumber)) {
                const exact = document.querySelector(
                    `[data-testid="conversation-turn-${userTurnNumber + 1}"] ${ASSISTANT_SELECTOR.replace(/^main\s+/, '')}`,
                );
                if (exact instanceof HTMLElement && exact.isConnected) return exact;
            }

            const nextUser = this.getUserMessageElements().find((candidate) => {
                if (candidate === userElement) return false;
                const relation = userElement.compareDocumentPosition(candidate);
                return Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING);
            }) || null;

            for (const assistant of this.getAssistantMessageElements()) {
                const relation = userElement.compareDocumentPosition(assistant);
                if (!(relation & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
                if (nextUser) {
                    const assistantToNext = assistant.compareDocumentPosition(nextUser);
                    if (assistantToNext & Node.DOCUMENT_POSITION_PRECEDING) continue;
                }
                return assistant;
            }
            return null;
        }

        resolveConversationPair(logicalIndex) {
            const officialButtons = this.getOfficialNavButtons();
            const records = this.collectUserMessageRecords();
            const mapping = this.mapUserRecordsToLogicalIndices(records, officialButtons);
            let record = mapping.recordsByIndex.get(logicalIndex) || null;

            if (!record && this.getOfficialActiveLogicalIndex(officialButtons) === logicalIndex) {
                const anchorIndex = this.findViewportPromptRecordIndex(records);
                record = records[anchorIndex] || records[records.length - 1] || null;
            }
            if (!record?.userElement?.isConnected) return null;

            const assistantElement = this.findAssistantForUser(record.userElement);
            if (!(assistantElement instanceof HTMLElement) || !assistantElement.isConnected) return null;
            return {
                record,
                userElement: record.userElement,
                targetElement: record.targetElement || record.userElement,
                assistantElement,
            };
        }

        getConversationPairSignature(pair) {
            if (!pair) return '';
            const userText = this.extractUserPromptText(pair.userElement);
            const assistantText = this.normalizeConversationText(pair.assistantElement.textContent ?? '');
            const assistantRoot = pair.assistantElement.querySelector('.markdown, [data-message-content]') || pair.assistantElement;
            const assetSignature = [...pair.assistantElement.querySelectorAll(
                'img, iframe, canvas, a[href], video[src], audio[src], object[data], embed[src]',
            )].slice(0, 24).map((element) => {
                const value = element.getAttribute('src') || element.getAttribute('href') ||
                    element.getAttribute('data') || element.getAttribute('srcdoc') || '';
                return `${element.tagName}:${value.length}:${value.slice(-24)}`;
            }).join('|');
            return `${userText.length}:${assistantText.length}:${assistantRoot.childElementCount}:${assistantText.slice(-48)}:${assetSignature}`;
        }

        async waitForConversationPair(logicalIndex, signal, timeoutMs = this.config.conversationLoadTimeoutMs, activate = true) {
            const deadline = performance.now() + Math.max(1200, Number(timeoutMs) || 7000);
            const settleMs = Math.max(80, Number(this.config.conversationLoadSettleMs) || 260);
            let lastSignature = '';
            let stableSince = 0;
            let lastActivation = 0;

            while (performance.now() < deadline) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                const now = performance.now();
                if (activate && now - lastActivation >= 900) {
                    const activeIndex = this.getOfficialActiveLogicalIndex();
                    if (activeIndex !== logicalIndex) this.activateOfficialConversationButton(logicalIndex);
                    lastActivation = now;
                }

                this.syncOfficialConversationNav();
                const pair = this.resolveConversationPair(logicalIndex);
                const signature = this.getConversationPairSignature(pair);
                if (pair && signature) {
                    if (signature === lastSignature) {
                        if (!stableSince) stableSince = now;
                        if (now - stableSince >= settleMs) return pair;
                    } else {
                        lastSignature = signature;
                        stableSince = now;
                    }
                }
                await this.waitForDelay(90, signal);
            }
            return null;
        }

        getMessageExportSource(element) {
            if (!(element instanceof HTMLElement)) return null;
            return element.querySelector('.markdown, [data-message-content]') || element;
        }

        getCurrentConversationId() {
            const path = String(location.pathname || '');
            const patterns = [
                /\/c\/([a-z0-9_-]{12,})/i,
                /\/conversation\/([a-z0-9_-]{12,})/i,
            ];
            for (const pattern of patterns) {
                const match = pattern.exec(path);
                if (match?.[1]) return match[1];
            }
            return '';
        }

        getApiDeviceId() {
            if (this.apiDeviceId) return this.apiDeviceId;
            const storageKey = 'cgpt-answer-toc-device-id-v1';
            try {
                const saved = sessionStorage.getItem(storageKey);
                if (saved) {
                    this.apiDeviceId = saved;
                    return saved;
                }
            } catch { }
            const generated = typeof crypto?.randomUUID === 'function'
                ? crypto.randomUUID()
                : `userscript-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            this.apiDeviceId = generated;
            try { sessionStorage.setItem(storageKey, generated); } catch { }
            return generated;
        }

        async getSessionAccessToken(signal) {
            if (this.sessionAccessToken) return this.sessionAccessToken;
            if (!this.sessionAccessTokenPromise) {
                this.sessionAccessTokenPromise = (async () => {
                    const response = await fetch('/api/auth/session', {
                        credentials: 'include',
                        cache: 'no-store',
                        signal,
                        headers: { Accept: 'application/json' },
                    });
                    if (!response.ok) throw new Error(`会话令牌请求失败：HTTP ${response.status}`);
                    const data = await response.json();
                    const token = String(data?.accessToken || '');
                    if (token) this.sessionAccessToken = token;
                    return token;
                })().finally(() => {
                    this.sessionAccessTokenPromise = null;
                });
            }
            try {
                return await this.sessionAccessTokenPromise;
            } catch {
                return '';
            }
        }

        async fetchChatGptApiJson(path, signal) {
            const token = await this.getSessionAccessToken(signal);
            const headers = {
                Accept: 'application/json',
                'Oai-Device-Id': this.getApiDeviceId(),
                'Oai-Language': navigator.language || 'zh-CN',
            };
            if (token) headers.Authorization = `Bearer ${token}`;
            const response = await fetch(path, {
                method: 'GET',
                credentials: 'include',
                redirect: 'follow',
                cache: 'no-store',
                signal,
                headers,
            });
            if (!response.ok) throw new Error(`ChatGPT API HTTP ${response.status}`);
            const contentType = response.headers.get('content-type') || '';
            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch {
                throw new Error(`ChatGPT API 未返回 JSON（${contentType || 'unknown'}）`);
            }
        }

        async getConversationApiSnapshot(signal, force = false) {
            if (this.config.conversationExportUseConversationApiAssets === false) return null;
            const conversationId = this.getCurrentConversationId();
            if (!conversationId) return null;
            if (!force && this.conversationApiSnapshot && this.conversationApiSnapshotId === conversationId) {
                return this.conversationApiSnapshot;
            }
            if (!force && this.conversationApiSnapshotPromise && this.conversationApiSnapshotId === conversationId) {
                return this.conversationApiSnapshotPromise;
            }
            this.conversationApiSnapshotId = conversationId;
            const task = this.fetchChatGptApiJson(
                `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
                signal,
            ).then((snapshot) => {
                this.conversationApiSnapshot = snapshot;
                this.conversationApiAssetsByIndex = this.buildConversationApiAssetMap(snapshot);
                return snapshot;
            }).finally(() => {
                if (this.conversationApiSnapshotPromise === task) this.conversationApiSnapshotPromise = null;
            });
            this.conversationApiSnapshotPromise = task;
            return task;
        }

        getConversationBranchMessages(snapshot) {
            const mapping = snapshot?.mapping && typeof snapshot.mapping === 'object'
                ? snapshot.mapping
                : {};
            const messages = [];
            let nodeId = snapshot?.current_node || snapshot?.currentNode || '';
            const visited = new Set();
            while (nodeId && mapping[nodeId] && !visited.has(nodeId)) {
                visited.add(nodeId);
                const node = mapping[nodeId];
                if (node?.message) messages.push(node.message);
                nodeId = node?.parent || '';
            }
            if (messages.length) return messages.reverse();

            const roots = Object.values(mapping).filter((node) => !node?.parent);
            let node = roots[0] || null;
            while (node) {
                if (node.message) messages.push(node.message);
                const children = Array.isArray(node.children) ? node.children : [];
                node = children.length ? mapping[children[children.length - 1]] : null;
            }
            return messages;
        }

        extractFileIdFromValue(value) {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const pointer = /^(?:file-service|sediment):\/\/(.+)$/i.exec(raw)?.[1];
            if (pointer) return pointer.split(/[?#]/)[0];
            const endpoint = /\/backend-api\/files\/(?:download\/)?([^/?#]+)(?:\/download)?(?:[?#]|$)/i.exec(raw)?.[1];
            if (endpoint) return decodeURIComponent(endpoint);
            return /\b(file-[a-z0-9_-]{8,})\b/i.exec(raw)?.[1] || '';
        }

        getAssetKindFromHints({ mimeType = '', filename = '', signal = '', image = false } = {}) {
            const mime = String(mimeType || '').toLowerCase();
            const combined = `${filename} ${signal}`.toLowerCase();
            if (image || mime.startsWith('image/')) return 'image';
            if (mime.includes('html') || /(?:artifact|\.html?\b)/i.test(combined)) return 'artifact-html';
            if (mime.startsWith('audio/')) return 'audio';
            if (mime.startsWith('video/')) return 'video';
            return 'file';
        }

        collectApiAssetsFromMessage(message, logicalIndex) {
            if (!message || logicalIndex < 0) return [];
            const role = String(message.author?.role || 'assistant');
            const assets = [];
            const seen = new Set();
            let sequence = 0;
            const add = ({ fileId = '', url = '', filename = '', label = '', mimeType = '', kind = '', image = false } = {}) => {
                const normalizedUrl = this.normalizeAssetCandidateUrl(url);
                const resolvedFileId = fileId || this.extractFileIdFromValue(normalizedUrl);
                if (!resolvedFileId && !normalizedUrl) return;
                const dedupe = resolvedFileId ? `id:${resolvedFileId}` : `url:${normalizedUrl}`;
                if (seen.has(dedupe)) return;
                seen.add(dedupe);
                sequence += 1;
                const safeIdPart = String(resolvedFileId || sequence).replace(/[^a-z0-9_.-]+/gi, '-').slice(0, 64);
                const finalFilename = filename || label || (image ? 'image' : 'attachment');
                assets.push({
                    id: `q${String(logicalIndex + 1).padStart(3, '0')}-${role}-api-${safeIdPart || sequence}`,
                    logicalIndex,
                    role,
                    kind: kind || this.getAssetKindFromHints({ mimeType, filename: finalFilename, signal: label, image }),
                    label: String(label || finalFilename || '附件').trim() || '附件',
                    sourceUrl: normalizedUrl,
                    alternateUrls: [],
                    fileId: resolvedFileId,
                    filenameHint: this.sanitizeAssetFilename(finalFilename || `asset-${sequence}`, `asset-${sequence}`),
                    mimeType: String(mimeType || ''),
                    byteLength: 0,
                    blob: null,
                    apiDerived: true,
                    capturedAt: new Date().toISOString(),
                });
            };

            const parts = Array.isArray(message.content?.parts) ? message.content.parts : [];
            for (const part of parts) {
                if (!part || typeof part !== 'object') continue;
                if (part.content_type === 'image_asset_pointer' && part.asset_pointer) {
                    add({
                        fileId: this.extractFileIdFromValue(part.asset_pointer),
                        url: part.download_url || part.url || '',
                        filename: part.metadata?.file_name || part.metadata?.name || (part.metadata?.dalle ? 'generated-image.png' : 'image.png'),
                        label: part.metadata?.dalle?.prompt || part.metadata?.name || '图片',
                        mimeType: part.metadata?.mime_type || 'image/png',
                        image: true,
                    });
                }
            }

            for (const attachment of message.metadata?.attachments || []) {
                add({
                    fileId: attachment?.id || attachment?.file_id || '',
                    url: attachment?.download_url || attachment?.url || '',
                    filename: attachment?.name || attachment?.file_name || 'attachment',
                    label: attachment?.name || attachment?.title || '附件',
                    mimeType: attachment?.mime_type || attachment?.content_type || '',
                });
            }

            for (const citation of message.metadata?.citations || []) {
                add({
                    fileId: citation?.metadata?.file_id || citation?.file_id || '',
                    url: citation?.metadata?.download_url || citation?.download_url || citation?.url || '',
                    filename: citation?.metadata?.title || citation?.title || 'citation',
                    label: citation?.metadata?.title || citation?.title || '引用附件',
                    mimeType: citation?.metadata?.mime_type || citation?.mime_type || '',
                });
            }

            let visitedCount = 0;
            const visited = new WeakSet();
            const walk = (value, keyHint = '', depth = 0) => {
                if (!value || depth > 9 || visitedCount > 2400 || typeof value !== 'object') return;
                if (visited.has(value)) return;
                visited.add(value);
                visitedCount += 1;
                if (Array.isArray(value)) {
                    for (const item of value) walk(item, keyHint, depth + 1);
                    return;
                }
                const signal = `${keyHint} ${value.content_type || ''} ${value.type || ''} ${value.kind || ''}`;
                const fileId = value.file_id || value.fileId || value.asset_id ||
                    (/(?:attachment|file|asset|image|citation)/i.test(signal) ? value.id : '') ||
                    this.extractFileIdFromValue(value.asset_pointer || '');
                const url = value.download_url || value.downloadUrl || value.content_url || value.url || value.href || value.src || '';
                if (fileId || (url && /(?:file|download|oaiusercontent|oaistatic|blob:|data:|sandbox:)/i.test(String(url)))) {
                    const filename = value.file_name || value.filename || value.name || value.title || '';
                    const mimeType = value.mime_type || value.content_type || value.media_type || '';
                    add({
                        fileId,
                        url,
                        filename: filename || (/image/i.test(signal) ? 'image.png' : 'attachment'),
                        label: value.title || value.name || filename || (/image/i.test(signal) ? '图片' : '附件'),
                        mimeType,
                        image: /image/i.test(signal) || String(mimeType).startsWith('image/'),
                    });
                }
                for (const [key, child] of Object.entries(value)) {
                    if (['text', 'content', 'parts'].includes(key) && typeof child === 'string') continue;
                    walk(child, key, depth + 1);
                }
            };
            walk(message.metadata || {}, 'metadata', 0);
            return assets;
        }

        buildConversationApiAssetMap(snapshot) {
            const map = new Map();
            let logicalIndex = -1;
            for (const message of this.getConversationBranchMessages(snapshot)) {
                const role = String(message?.author?.role || '');
                if (role === 'user') logicalIndex += 1;
                if (logicalIndex < 0) continue;
                const assets = this.collectApiAssetsFromMessage(message, logicalIndex);
                if (!assets.length) continue;
                if (!map.has(logicalIndex)) map.set(logicalIndex, []);
                map.get(logicalIndex).push(...assets);
            }
            return map;
        }

        mergeArchiveAsset(existing, incoming) {
            if (!existing || !incoming) return existing || incoming;
            if (!existing.fileId && incoming.fileId) existing.fileId = incoming.fileId;
            if (!existing.sourceUrl && incoming.sourceUrl) existing.sourceUrl = incoming.sourceUrl;
            existing.alternateUrls = [...new Set([
                ...(existing.alternateUrls || []),
                ...(incoming.alternateUrls || []),
                incoming.sourceUrl || '',
            ].filter(Boolean))];
            if (!existing.filenameHint && incoming.filenameHint) existing.filenameHint = incoming.filenameHint;
            if (!existing.mimeType && incoming.mimeType) existing.mimeType = incoming.mimeType;
            if ((!existing.label || existing.label === '附件') && incoming.label) existing.label = incoming.label;
            existing.apiDerived = existing.apiDerived || incoming.apiDerived;
            return existing;
        }

        async enrichConversationArchivesWithApiAssets(indices, signal) {
            let snapshot = null;
            try {
                snapshot = await this.getConversationApiSnapshot(signal);
            } catch (error) {
                console.warn('[ChatGPT 导航与导出] 无法读取结构化附件信息，将继续使用页面 DOM：', error);
                return { added: 0, merged: 0, available: false };
            }
            if (!snapshot) return { added: 0, merged: 0, available: false };
            let added = 0;
            let merged = 0;
            for (const logicalIndex of indices) {
                const archive = this.conversationArchive.get(logicalIndex);
                if (!archive) continue;
                if (!Array.isArray(archive.assets)) archive.assets = [];
                const incomingAssets = this.conversationApiAssetsByIndex.get(logicalIndex) || [];
                const category = (asset) => /image|canvas|svg/i.test(asset?.kind || '')
                    ? 'image'
                    : /artifact|html/i.test(asset?.kind || '') ? 'artifact' : 'file';
                const pairedByOrdinal = new Map();
                for (const role of ['user', 'assistant', 'tool']) {
                    for (const group of ['image', 'artifact', 'file']) {
                        const domCandidates = archive.assets.filter((asset) =>
                            asset.role === role && category(asset) === group && !asset.fileId && !asset.apiDerived);
                        const apiCandidates = incomingAssets.filter((asset) =>
                            asset.role === role && category(asset) === group && asset.fileId);
                        if (domCandidates.length && domCandidates.length === apiCandidates.length) {
                            apiCandidates.forEach((asset, index) => pairedByOrdinal.set(asset, domCandidates[index]));
                        }
                    }
                }
                for (const incoming of incomingAssets) {
                    const incomingName = this.sanitizeAssetFilename(incoming.filenameHint || incoming.label || '').toLowerCase();
                    const existing = archive.assets.find((asset) => {
                        if (incoming.fileId && asset.fileId === incoming.fileId) return true;
                        if (incoming.fileId && [asset.sourceUrl, ...(asset.alternateUrls || [])]
                            .some((url) => String(url || '').includes(incoming.fileId))) return true;
                        const existingName = this.sanitizeAssetFilename(asset.filenameHint || asset.label || '').toLowerCase();
                        return Boolean(incomingName && existingName && incomingName === existingName && asset.role === incoming.role);
                    }) || pairedByOrdinal.get(incoming);
                    if (existing) {
                        this.mergeArchiveAsset(existing, incoming);
                        merged += 1;
                    } else {
                        let id = incoming.id;
                        let suffix = 2;
                        while (archive.assets.some((asset) => asset.id === id)) {
                            id = `${incoming.id}-${suffix}`;
                            suffix += 1;
                        }
                        archive.assets.push({ ...incoming, id });
                        added += 1;
                    }
                }
            }
            if (added || merged) {
                this.markSearchIndexDirty(false);
                this.scheduleConversationRebuild(0);
            }
            return { added, merged, available: true };
        }

        async resolveFileDownloadMetadata(fileId, signal) {
            const id = String(fileId || '').trim();
            if (!id) return null;
            const data = await this.fetchChatGptApiJson(
                `/backend-api/files/download/${encodeURIComponent(id)}`,
                signal,
            );
            const downloadUrl = data?.download_url || data?.downloadUrl || data?.url || '';
            if (!downloadUrl) throw new Error(`文件 ${id} 没有返回 download_url`);
            return {
                downloadUrl: this.normalizeAssetCandidateUrl(downloadUrl),
                filename: data?.file_name || data?.filename || data?.name || '',
                mimeType: data?.mime_type || data?.content_type || '',
                size: Number(data?.size || data?.bytes || 0) || 0,
            };
        }

        normalizeAssetCandidateUrl(rawValue) {
            const raw = String(rawValue || '').trim();
            if (!raw || /^(?:javascript|mailto|tel):/i.test(raw)) return '';
            if (/^(?:data|blob|sandbox):/i.test(raw)) return raw;
            try {
                return new URL(raw, location.href).href;
            } catch {
                return raw;
            }
        }

        getLargestImageCandidate(image) {
            if (!(image instanceof HTMLImageElement)) return '';
            const srcsets = [image.getAttribute('srcset') || ''];
            for (const source of image.closest('picture')?.querySelectorAll('source[srcset]') || []) {
                srcsets.push(source.getAttribute('srcset') || '');
            }
            const candidates = srcsets.flatMap((srcset) => srcset.split(',').map((item) => {
                const match = item.trim().match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)(w|x))?$/);
                if (!match) return null;
                const weight = match[3] === 'w'
                    ? Number(match[2]) || 0
                    : (Number(match[2]) || 1) * 10000;
                return { url: match[1], weight };
            })).filter(Boolean).sort((a, b) => b.weight - a.weight);
            return this.normalizeAssetCandidateUrl(
                candidates[0]?.url || image.currentSrc || image.getAttribute('src') || '',
            );
        }

        getElementUrlAlternates(element, primary = '') {
            const values = [];
            const push = (value) => {
                const normalized = this.normalizeAssetCandidateUrl(value);
                if (normalized && normalized !== primary && !values.includes(normalized)) values.push(normalized);
            };
            if (!(element instanceof Element)) return values;
            for (const attribute of element.attributes) {
                if (!/^(?:href|src|data|poster|data-[\w-]*(?:url|href|src|download|file)[\w-]*)$/i.test(attribute.name)) continue;
                push(attribute.value);
            }
            return values;
        }

        isLikelyDownloadAssetLink(anchor, url) {
            if (!(anchor instanceof HTMLAnchorElement)) return false;
            const raw = anchor.getAttribute('href') || '';
            const signal = [
                anchor.getAttribute('download'),
                anchor.getAttribute('aria-label'),
                anchor.getAttribute('title'),
                anchor.getAttribute('data-testid'),
                anchor.className,
                anchor.textContent,
                raw,
                url,
            ].filter(Boolean).join(' ');
            if (anchor.hasAttribute('download')) return true;
            if (/^(?:blob|data|sandbox):/i.test(raw)) return true;
            if (/(?:下载|附件|文件|artifact|download|attachment|generated[-_ ]?file)/i.test(signal)) return true;
            if (/(?:\/backend-api\/files?\/|\/files?\/|oaiusercontent\.com|oaistatic\.com)/i.test(url)) return true;
            try {
                const pathname = new URL(url, location.href).pathname;
                return /\.(?:avif|bmp|csv|docx?|gif|gz|html?|ico|jpe?g|json|md|m4a|mov|mp3|mp4|odp|ods|odt|pdf|png|pptx?|py|rtf|svg|tar|tgz|tsv|txt|wav|webm|webp|xls[xbm]?|xml|yaml|yml|zip)(?:$|[?#])/i.test(`${pathname}${new URL(url, location.href).search}`);
            } catch {
                return false;
            }
        }

        sanitizeAssetFilename(value, fallback = 'asset') {
            const cleaned = String(value || '')
                .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
                .replace(/\s+/g, ' ')
                .replace(/[. ]+$/g, '')
                .trim();
            return (cleaned || fallback).slice(0, 140);
        }

        getMimeExtension(mimeType) {
            const mime = String(mimeType || '').split(';')[0].trim().toLowerCase();
            const map = {
                'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
                'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif',
                'application/pdf': 'pdf', 'application/zip': 'zip',
                'application/json': 'json', 'text/plain': 'txt', 'text/markdown': 'md',
                'text/html': 'html', 'text/csv': 'csv', 'application/xml': 'xml',
                'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4',
                'video/webm': 'webm',
            };
            return map[mime] || '';
        }

        getAssetFilenameHint(candidate, sequence) {
            const direct = candidate.filenameHint || candidate.element?.getAttribute?.('download') || '';
            if (direct) return this.sanitizeAssetFilename(direct, `asset-${sequence}`);
            const url = candidate.url || '';
            if (/^data:/i.test(url)) {
                const extension = this.getMimeExtension(candidate.mimeType) || 'bin';
                return `asset-${sequence}.${extension}`;
            }
            try {
                const pathname = decodeURIComponent(new URL(url, location.href).pathname);
                const last = pathname.split('/').filter(Boolean).pop();
                if (last && last.includes('.')) return this.sanitizeAssetFilename(last, `asset-${sequence}`);
            } catch {
                // 使用标签后备。
            }
            const base = this.sanitizeAssetFilename(candidate.label || candidate.kind || `asset-${sequence}`, `asset-${sequence}`);
            const extension = this.getMimeExtension(candidate.mimeType);
            return extension && !/\.[a-z0-9]{1,8}$/i.test(base) ? `${base}.${extension}` : base;
        }

        canvasToBlob(canvas) {
            return new Promise((resolve) => {
                try {
                    canvas.toBlob((blob) => resolve(blob || null), 'image/png');
                } catch {
                    resolve(null);
                }
            });
        }

        serializeIframeDocument(iframe) {
            try {
                if (iframe.srcdoc) return iframe.srcdoc;
                const doc = iframe.contentDocument;
                if (doc?.documentElement) {
                    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
                }
            } catch {
                // 跨域 iframe 无法直接读取；保留其 URL，导出时再尝试下载。
            }
            return '';
        }

        async discoverMessageAssets(root, logicalIndex, role, sequenceStart = 0) {
            if (!(root instanceof HTMLElement)) return { assets: [], annotatedElements: [], nextSequence: sequenceStart };
            const candidates = [];
            const addCandidate = (element, data) => {
                if (!(element instanceof Element)) return;
                candidates.push({ element, role, ...data });
            };

            for (const image of root.querySelectorAll('img')) {
                if (image.closest('[role="tooltip"], [data-message-actions]')) continue;
                const url = this.getLargestImageCandidate(image);
                if (!url) continue;
                addCandidate(image, {
                    kind: 'image',
                    url,
                    alternateUrls: [
                        ...this.getElementUrlAlternates(image, url),
                        ...[...(image.closest('picture')?.querySelectorAll('source[srcset]') || [])]
                            .flatMap((source) => String(source.getAttribute('srcset') || '').split(',').map((part) => part.trim().split(/\s+/)[0]))
                            .map((candidateUrl) => this.normalizeAssetCandidateUrl(candidateUrl))
                            .filter(Boolean),
                    ],
                    fileId: this.extractFileIdFromValue(url),
                    label: image.getAttribute('alt') || image.getAttribute('aria-label') || '图片',
                    filenameHint: image.getAttribute('download') || '',
                    mimeType: /^data:([^;,]+)/i.exec(url)?.[1] || '',
                });
            }

            for (const anchor of root.querySelectorAll('a[href]')) {
                const url = this.normalizeAssetCandidateUrl(anchor.getAttribute('href') || anchor.href);
                if (!url || !this.isLikelyDownloadAssetLink(anchor, url)) continue;
                addCandidate(anchor, {
                    kind: /\.html?(?:$|[?#])/i.test(url) || /artifact/i.test(anchor.getAttribute('data-testid') || '')
                        ? 'artifact-html'
                        : 'file',
                    url,
                    alternateUrls: this.getElementUrlAlternates(anchor, url),
                    fileId: this.extractFileIdFromValue(url),
                    label: anchor.textContent?.trim() || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '附件',
                    filenameHint: anchor.getAttribute('download') || '',
                    mimeType: '',
                });
            }

            for (const control of root.querySelectorAll('button, [role="button"]')) {
                const signal = [
                    control.getAttribute('aria-label'),
                    control.getAttribute('title'),
                    control.getAttribute('data-testid'),
                    control.textContent,
                ].filter(Boolean).join(' ');
                if (!/(?:下载|附件|文件|artifact|download|attachment)/i.test(signal)) continue;
                const alternates = this.getElementUrlAlternates(control, '');
                const url = alternates[0] || '';
                addCandidate(control, {
                    kind: /artifact/i.test(signal) ? 'artifact' : 'file-control',
                    url,
                    alternateUrls: alternates.slice(1),
                    fileId: this.extractFileIdFromValue(url),
                    label: control.textContent?.trim() || control.getAttribute('aria-label') || '附件',
                    filenameHint: '',
                    mimeType: '',
                });
            }

            for (const iframe of root.querySelectorAll('iframe')) {
                const html = this.serializeIframeDocument(iframe);
                const url = this.normalizeAssetCandidateUrl(iframe.getAttribute('src') || '');
                if (!html && !url) continue;
                addCandidate(iframe, {
                    kind: 'artifact-html',
                    url,
                    alternateUrls: this.getElementUrlAlternates(iframe, url),
                    label: iframe.getAttribute('title') || iframe.getAttribute('aria-label') || '交互式 Artifact',
                    filenameHint: 'artifact.html',
                    mimeType: 'text/html',
                    inlineBlob: html ? new Blob([html], { type: 'text/html;charset=utf-8' }) : null,
                });
            }

            for (const canvas of root.querySelectorAll('canvas')) {
                const rect = canvas.getBoundingClientRect();
                if (rect.width < 24 && rect.height < 24) continue;
                addCandidate(canvas, {
                    kind: 'canvas-image',
                    url: '',
                    alternateUrls: [],
                    label: canvas.getAttribute('aria-label') || 'Canvas 图像',
                    filenameHint: 'canvas.png',
                    mimeType: 'image/png',
                    inlineBlob: await this.canvasToBlob(canvas),
                });
            }

            for (const svg of root.querySelectorAll('svg:not(.icon)')) {
                if (svg.closest('.katex, button, [aria-hidden="true"]')) continue;
                const box = svg.getBoundingClientRect();
                if (box.width < 48 && box.height < 48) continue;
                const xml = new XMLSerializer().serializeToString(svg);
                addCandidate(svg, {
                    kind: 'svg-image',
                    url: '',
                    alternateUrls: [],
                    label: svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent || 'SVG 图像',
                    filenameHint: 'graphic.svg',
                    mimeType: 'image/svg+xml',
                    inlineBlob: new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }),
                });
            }

            for (const element of root.querySelectorAll('video[src], audio[src], source[src], object[data], embed[src]')) {
                const raw = element.getAttribute('src') || element.getAttribute('data') || '';
                const url = this.normalizeAssetCandidateUrl(raw);
                if (!url) continue;
                addCandidate(element, {
                    kind: element.tagName.toLowerCase(),
                    url,
                    alternateUrls: this.getElementUrlAlternates(element, url),
                    label: element.getAttribute('aria-label') || element.getAttribute('title') || element.tagName.toLowerCase(),
                    filenameHint: '',
                    mimeType: element.getAttribute('type') || '',
                });
            }

            const assets = [];
            const annotatedElements = [];
            const byKey = new Map();
            let sequence = sequenceStart;
            for (const candidate of candidates) {
                const sourceUrl = candidate.url || '';
                let inlineBlob = candidate.inlineBlob instanceof Blob ? candidate.inlineBlob : null;
                if (!inlineBlob && /^(?:blob|data):/i.test(sourceUrl)) {
                    try {
                        const response = await fetch(sourceUrl);
                        if (response.ok) inlineBlob = await response.blob();
                    } catch {
                        // blob: URL 可能已失效；仍保留原始 URL，导出时再尝试一次。
                    }
                }
                const key = sourceUrl
                    ? `${candidate.kind}|${sourceUrl}`
                    : `${candidate.kind}|inline|${sequence + 1}`;
                let asset = byKey.get(key);
                if (!asset) {
                    sequence += 1;
                    const id = `q${String(logicalIndex + 1).padStart(3, '0')}-${role}-a${String(sequence).padStart(3, '0')}`;
                    const mimeType = candidate.mimeType || inlineBlob?.type || '';
                    asset = {
                        id,
                        logicalIndex,
                        role,
                        kind: candidate.kind,
                        label: String(candidate.label || '附件').trim() || '附件',
                        sourceUrl,
                        alternateUrls: [...new Set(candidate.alternateUrls || [])],
                        fileId: candidate.fileId || this.extractFileIdFromValue(sourceUrl),
                        filenameHint: this.getAssetFilenameHint({ ...candidate, mimeType }, sequence),
                        mimeType,
                        byteLength: inlineBlob?.size || 0,
                        blob: inlineBlob,
                        capturedAt: new Date().toISOString(),
                    };
                    byKey.set(key, asset);
                    assets.push(asset);
                } else {
                    for (const alternate of candidate.alternateUrls || []) {
                        if (alternate && !asset.alternateUrls.includes(alternate)) asset.alternateUrls.push(alternate);
                    }
                }
                candidate.element.setAttribute('data-cgpt-export-asset-id', asset.id);
                annotatedElements.push(candidate.element);
            }

            return { assets, annotatedElements, nextSequence: sequence };
        }

        async discoverConversationAssets(logicalIndex, pair) {
            const user = await this.discoverMessageAssets(pair.userElement, logicalIndex, 'user', 0);
            const assistant = await this.discoverMessageAssets(
                pair.assistantElement,
                logicalIndex,
                'assistant',
                user.nextSequence,
            );
            return {
                assets: [...user.assets, ...assistant.assets],
                annotatedElements: [...user.annotatedElements, ...assistant.annotatedElements],
            };
        }

        sanitizeExportHtmlClone(clone) {
            if (!(clone instanceof Element)) return;

            // 将 KaTeX 的页面专用结构替换为可离线显示的 MathML/LaTeX 容器。
            const mathRoots = [...clone.querySelectorAll('.katex-display, .katex')]
                .filter((element) => !element.parentElement?.closest('.katex-display, .katex'));
            for (const mathRoot of mathRoots) {
                const latex = this.getMathLatex(mathRoot);
                const display = mathRoot.matches('.katex-display');
                const replacement = clone.ownerDocument.createElement(display ? 'div' : 'span');
                replacement.className = display ? 'math math-display' : 'math math-inline';
                replacement.setAttribute('data-latex', latex);
                const mathMl = mathRoot.querySelector('math')?.cloneNode(true);
                if (mathMl) replacement.appendChild(mathMl);
                else replacement.textContent = display ? `$$${latex}$$` : `$${latex}$`;
                mathRoot.replaceWith(replacement);
            }

            const selectors = [
                'script', 'style', 'noscript', 'textarea', 'input', 'select',
                '[role="tooltip"]', '[data-testid*="copy"]', '[data-testid*="feedback"]',
                '[data-message-actions]', '.sr-only', 'svg.icon', '[aria-hidden="true"]',
            ];
            for (const removable of clone.querySelectorAll(selectors.join(','))) {
                if (removable.hasAttribute('data-cgpt-export-asset-id')) continue;
                removable.remove();
            }

            for (const button of clone.querySelectorAll('button')) {
                const assetId = button.getAttribute('data-cgpt-export-asset-id');
                if (!assetId) {
                    button.remove();
                    continue;
                }
                const link = clone.ownerDocument.createElement('a');
                link.href = `cgpt-asset://${assetId}`;
                link.setAttribute('data-cgpt-export-asset-id', assetId);
                link.className = 'inline-attachment';
                link.textContent = button.textContent?.trim() || button.getAttribute('aria-label') || '下载附件';
                button.replaceWith(link);
            }

            for (const canvas of clone.querySelectorAll('canvas[data-cgpt-export-asset-id]')) {
                const image = clone.ownerDocument.createElement('img');
                image.src = `cgpt-asset://${canvas.getAttribute('data-cgpt-export-asset-id')}`;
                image.alt = canvas.getAttribute('aria-label') || 'Canvas 图像';
                image.setAttribute('data-cgpt-export-asset-id', canvas.getAttribute('data-cgpt-export-asset-id'));
                canvas.replaceWith(image);
            }

            for (const element of clone.querySelectorAll('*')) {
                for (const attribute of [...element.attributes]) {
                    const name = attribute.name.toLowerCase();
                    const preserve = name === 'data-cgpt-export-asset-id' ||
                        name === 'href' || name === 'src' || name === 'srcset' || name === 'sizes' ||
                        name === 'poster' || name === 'data' || name === 'srcdoc' || name === 'type' ||
                        name === 'alt' || name === 'title' || name === 'download' || name === 'target' ||
                        name === 'rel' || name === 'colspan' || name === 'rowspan' || name === 'start' ||
                        name === 'open' || name === 'controls' || name === 'width' || name === 'height' ||
                        name === 'data-latex' || name === 'class';
                    if (!preserve || /^on/i.test(name)) element.removeAttribute(attribute.name);
                }
                element.removeAttribute('contenteditable');
                element.removeAttribute('autofocus');
                element.removeAttribute('hidden');

                const tag = element.tagName.toLowerCase();
                if (element.classList.contains('math')) {
                    element.className = element.classList.contains('math-display')
                        ? 'math math-display'
                        : 'math math-inline';
                } else if (element.classList.contains('inline-attachment')) {
                    element.className = 'inline-attachment';
                } else {
                    element.removeAttribute('class');
                }
                if (tag === 'img') {
                    element.setAttribute('loading', 'lazy');
                    element.setAttribute('decoding', 'async');
                } else if (tag === 'iframe') {
                    element.setAttribute('loading', 'lazy');
                    if (!element.getAttribute('title')) element.setAttribute('title', 'Artifact');
                } else if (tag === 'a') {
                    element.setAttribute('rel', 'noopener noreferrer');
                }
            }
        }

        elementToExportHtml(element) {
            const source = this.getMessageExportSource(element);
            if (!(source instanceof HTMLElement)) return '';
            const clone = source.cloneNode(true);
            this.sanitizeExportHtmlClone(clone);
            for (const table of [...clone.querySelectorAll('table')]) {
                if (table.parentElement?.classList.contains('table-wrap')) continue;
                const wrapper = clone.ownerDocument.createElement('div');
                wrapper.className = 'table-wrap';
                table.replaceWith(wrapper);
                wrapper.appendChild(table);
            }
            return clone.innerHTML.trim();
        }

        removeExportUiNoise(root) {
            if (!(root instanceof Element)) return;
            const selectors = [
                'button', 'script', 'style', 'svg', 'textarea', 'input',
                '[role="tooltip"]', '[aria-hidden="true"]', '[data-testid*="copy"]',
                '[data-testid*="feedback"]', '[data-message-actions]', '.sr-only',
            ];
            for (const removable of root.querySelectorAll(selectors.join(','))) {
                if (removable.hasAttribute('data-cgpt-export-asset-id')) continue;
                removable.remove();
            }
        }

        escapeMarkdownInline(text) {
            return String(text || '').replace(/([\\[\]*_~])/g, '\\$1');
        }

        getMathLatex(element) {
            if (!(element instanceof Element)) return '';
            const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
            return annotation?.textContent?.trim() || '';
        }

        serializeInlineNodes(nodes) {
            return [...nodes].map((node) => this.serializeInlineNode(node)).join('');
        }

        serializeInlineNode(node) {
            if (node.nodeType === Node.TEXT_NODE) return String(node.nodeValue || '');
            if (!(node instanceof Element)) return '';
            const tag = node.tagName.toLowerCase();
            const assetId = node.getAttribute('data-cgpt-export-asset-id');
            if (assetId) {
                const token = `cgpt-asset://${assetId}`;
                const label = node.getAttribute('alt') || node.getAttribute('aria-label') ||
                    node.getAttribute('title') || node.textContent?.trim() || '附件';
                if (tag === 'img' || tag === 'canvas' || tag === 'svg') {
                    return `![${this.escapeMarkdownInline(label)}](${token})`;
                }
                if (tag === 'a') {
                    const inner = this.serializeInlineNodes(node.childNodes).trim() || this.escapeMarkdownInline(label);
                    return `[${inner}](${token})`;
                }
                return `[${this.escapeMarkdownInline(label)}](${token})`;
            }
            if (tag === 'br') return '\n';
            if (node.matches('.katex, .katex-display')) {
                const latex = this.getMathLatex(node);
                if (latex) return node.matches('.katex-display') ? `\n$$\n${latex}\n$$\n` : `$${latex}$`;
            }
            if (tag === 'strong' || tag === 'b') return `**${this.serializeInlineNodes(node.childNodes)}**`;
            if (tag === 'em' || tag === 'i') return `*${this.serializeInlineNodes(node.childNodes)}*`;
            if (tag === 'del' || tag === 's') return `~~${this.serializeInlineNodes(node.childNodes)}~~`;
            if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') {
                const value = node.textContent || '';
                const maxTicks = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
                const fence = '`'.repeat(Math.max(1, maxTicks + 1));
                return `${fence}${value}${fence}`;
            }
            if (tag === 'a') {
                const label = this.serializeInlineNodes(node.childNodes).trim() || node.textContent?.trim() || '';
                const href = node.getAttribute('href') || '';
                return href ? `[${label}](${href})` : label;
            }
            if (tag === 'img') {
                const alt = node.getAttribute('alt') || 'image';
                const src = node.getAttribute('src') || '';
                return src ? `![${alt}](${src})` : alt;
            }
            if (tag === 'sup') return `<sup>${this.serializeInlineNodes(node.childNodes)}</sup>`;
            if (tag === 'sub') return `<sub>${this.serializeInlineNodes(node.childNodes)}</sub>`;
            return this.serializeInlineNodes(node.childNodes);
        }

        serializeList(element, depth = 0) {
            const ordered = element.tagName.toLowerCase() === 'ol';
            const start = Number.parseInt(element.getAttribute('start') || '1', 10) || 1;
            const lines = [];
            const children = [...element.children].filter((child) => child.tagName.toLowerCase() === 'li');
            children.forEach((li, index) => {
                const clone = li.cloneNode(true);
                for (const nested of clone.querySelectorAll(':scope > ul, :scope > ol')) nested.remove();
                const content = this.serializeInlineNodes(clone.childNodes).replace(/\s+/g, ' ').trim();
                const marker = ordered ? `${start + index}.` : '-';
                const indent = '  '.repeat(depth);
                lines.push(`${indent}${marker} ${content}`.trimEnd());
                for (const nested of [...li.children].filter((child) => /^(UL|OL)$/.test(child.tagName))) {
                    lines.push(this.serializeList(nested, depth + 1));
                }
            });
            return `${lines.filter(Boolean).join('\n')}\n\n`;
        }

        serializeTable(element) {
            const rows = [...element.querySelectorAll('tr')];
            if (!rows.length) return '';
            const values = rows.map((row) => [...row.querySelectorAll(':scope > th, :scope > td')]
                .map((cell) => this.serializeInlineNodes(cell.childNodes).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()));
            const columns = Math.max(...values.map((row) => row.length));
            if (!columns) return '';
            const normalizeRow = (row) => [...row, ...Array(Math.max(0, columns - row.length)).fill('')];
            const header = normalizeRow(values[0]);
            const body = values.slice(1).map(normalizeRow);
            const lines = [
                `| ${header.join(' | ')} |`,
                `| ${header.map(() => '---').join(' | ')} |`,
                ...body.map((row) => `| ${row.join(' | ')} |`),
            ];
            return `${lines.join('\n')}\n\n`;
        }

        serializeBlockNode(node) {
            if (node.nodeType === Node.TEXT_NODE) {
                const value = String(node.nodeValue || '').trim();
                return value ? `${value}\n\n` : '';
            }
            if (!(node instanceof Element)) return '';
            const tag = node.tagName.toLowerCase();
            if (node.hasAttribute('data-cgpt-export-asset-id')) {
                const inline = this.serializeInlineNode(node).trim();
                return inline ? `${inline}\n\n` : '';
            }
            if (/^h[1-6]$/.test(tag)) {
                const level = Number.parseInt(tag.slice(1), 10);
                const text = this.serializeInlineNodes(node.childNodes).trim();
                return text ? `${'#'.repeat(level)} ${text}\n\n` : '';
            }
            if (tag === 'p') {
                const text = this.serializeInlineNodes(node.childNodes).trim();
                return text ? `${text}\n\n` : '';
            }
            if (tag === 'pre') {
                const code = node.querySelector('code') || node;
                const value = (code.textContent || '').replace(/\n$/, '');
                const className = code.getAttribute('class') || '';
                const language = /(?:language-|lang-)([\w+-]+)/.exec(className)?.[1] || '';
                const maxTicks = Math.max(2, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
                const fence = '`'.repeat(maxTicks + 1);
                return `${fence}${language}\n${value}\n${fence}\n\n`;
            }
            if (tag === 'ul' || tag === 'ol') return this.serializeList(node);
            if (tag === 'blockquote') {
                const inner = this.serializeBlockChildren(node).trim();
                return inner ? `${inner.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')}\n\n` : '';
            }
            if (tag === 'table') return this.serializeTable(node);
            if (tag === 'hr') return '---\n\n';
            if (node.matches('.katex-display')) {
                const latex = this.getMathLatex(node);
                return latex ? `$$\n${latex}\n$$\n\n` : '';
            }
            const hasBlockChildren = [...node.children].some((child) => /^(H[1-6]|P|PRE|UL|OL|BLOCKQUOTE|TABLE|HR|DIV|SECTION|ARTICLE)$/.test(child.tagName));
            if (hasBlockChildren) return this.serializeBlockChildren(node);
            const inline = this.serializeInlineNodes(node.childNodes).trim();
            return inline ? `${inline}\n\n` : '';
        }

        serializeBlockChildren(element) {
            return [...element.childNodes].map((node) => this.serializeBlockNode(node)).join('');
        }

        normalizeExportMarkdown(markdown) {
            return String(markdown || '')
                .replace(/\r\n?/g, '\n')
                .replace(/[ \t]+$/gm, '')
                .replace(/\n{4,}/g, '\n\n\n')
                .trim();
        }

        elementToMarkdown(element) {
            if (!(element instanceof HTMLElement)) return '';
            const source = this.getMessageExportSource(element);
            const clone = source.cloneNode(true);
            this.removeExportUiNoise(clone);
            return this.normalizeExportMarkdown(this.serializeBlockChildren(clone));
        }

        async captureConversationPair(logicalIndex, pair) {
            if (!pair) return null;
            const assetCapture = await this.discoverConversationAssets(logicalIndex, pair);
            try {
                const userText = this.extractUserPromptText(pair.userElement);
                const userMarkdown = this.elementToMarkdown(pair.userElement) || userText;
                const assistantMarkdown = this.elementToMarkdown(pair.assistantElement);
                const userHtml = this.elementToExportHtml(pair.userElement);
                const assistantHtml = this.elementToExportHtml(pair.assistantElement);
                if (!userText || (!assistantMarkdown && !assistantHtml && !assetCapture.assets.length)) return null;

                const archive = {
                    logicalIndex,
                    userText,
                    userMarkdown,
                    assistantMarkdown: assistantMarkdown || '_此回答主要包含图片、文件或 Artifact。_',
                    userHtml,
                    assistantHtml,
                    assets: assetCapture.assets,
                    capturedAt: new Date().toISOString(),
                };
                this.conversationArchive.set(logicalIndex, archive);
                this.conversationArchiveFailures.delete(logicalIndex);
                this.cacheConversationRecordLabel(logicalIndex, {
                    ...pair.record,
                    fullLabel: userText,
                });
                this.markSearchIndexDirty(true);
                this.scheduleConversationRebuild(0);
                return archive;
            } finally {
                for (const element of assetCapture.annotatedElements) {
                    if (element?.isConnected) element.removeAttribute('data-cgpt-export-asset-id');
                }
            }
        }

        async loadSingleConversation(logicalIndex, signal) {
            if (this.conversationArchive.has(logicalIndex)) {
                return this.conversationArchive.get(logicalIndex);
            }
            const retries = Math.max(0, Number(this.config.conversationLoadRetryCount) || 0);
            for (let attempt = 0; attempt <= retries; attempt += 1) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                this.activateOfficialConversationButton(logicalIndex);
                const pair = await this.waitForConversationPair(logicalIndex, signal);
                const archive = await this.captureConversationPair(logicalIndex, pair);
                if (archive) return archive;
                if (attempt < retries) await this.waitForDelay(180 + attempt * 140, signal);
            }
            this.conversationArchiveFailures.set(logicalIndex, '未能在页面中挂载完整问答');
            return null;
        }

        async loadConversationIndices(indices, options = {}) {
            if (!this.config.enableConversationArchive) return { loaded: [], failed: [] };
            if (this.conversationLoadPromise) return this.conversationLoadPromise;

            const uniqueIndices = [...new Set(indices)]
                .filter((index) => Number.isInteger(index) && index >= 0)
                .sort((a, b) => a - b);
            if (!uniqueIndices.length) return { loaded: [], failed: [] };

            const controller = new AbortController();
            const signal = controller.signal;
            const runId = ++this.conversationLoadRunId;
            const returnPoint = this.getConversationReturnPoint();
            this.conversationLoadAbortController = controller;
            this.conversationLoadMode = options.mode || 'load';
            this.conversationLoadProgress = { completed: 0, total: uniqueIndices.length, failed: 0 };
            this.pinTransientHoverOpen(true);
            this.updateConversationArchiveUi();

            const task = (async () => {
                const loaded = [];
                const failed = [];
                try {
                    await this.waitForOfficialConversationButtonsStable(signal);
                    for (const logicalIndex of uniqueIndices) {
                        if (signal.aborted || runId !== this.conversationLoadRunId) {
                            throw new DOMException('Aborted', 'AbortError');
                        }
                        const archive = await this.loadSingleConversation(logicalIndex, signal);
                        if (archive) loaded.push(logicalIndex);
                        else failed.push(logicalIndex);
                        this.conversationLoadProgress.completed += 1;
                        this.conversationLoadProgress.failed = failed.length;
                        this.updateConversationArchiveUi();
                        await this.waitForDelay(this.config.conversationLoadStepDelayMs, signal);
                    }
                    return { loaded, failed, aborted: false };
                } catch (error) {
                    if (error?.name !== 'AbortError') {
                        console.warn('[ChatGPT 导航与导出] 加载问答失败：', error);
                    }
                    return { loaded, failed, aborted: true, error };
                } finally {
                    if (options.restore !== false && runId === this.conversationLoadRunId) {
                        await this.restoreConversationReturnPoint(returnPoint, null).catch(() => { });
                    }
                    if (runId === this.conversationLoadRunId) {
                        this.conversationLoadAbortController = null;
                        this.conversationLoadPromise = null;
                        this.conversationLoadMode = '';
                        this.scheduleConversationRebuild(0);
                    }
                }
            })();

            this.conversationLoadPromise = task;
            const result = await task;
            if (runId === this.conversationLoadRunId) {
                const message = result.aborted
                    ? `已停止：缓存 ${this.conversationArchive.size} 轮`
                    : result.failed.length
                        ? `完成：成功 ${result.loaded.length}，失败 ${result.failed.length}`
                        : `已加载 ${result.loaded.length} 轮问答`;
                this.updateConversationArchiveUi(message);
            }
            return result;
        }

        async loadAllConversations() {
            if (this.conversationLoadPromise) return;
            const controller = new AbortController();
            try {
                await this.waitForOfficialConversationButtonsStable(controller.signal);
            } catch {
                // 后续仍使用当前可见索引。
            }
            const indices = this.getAllConversationLogicalIndices();
            const missing = indices.filter((index) => !this.conversationArchive.has(index));
            if (!missing.length) {
                this.updateConversationArchiveUi('全部问答已经缓存');
                return;
            }
            const result = await this.loadConversationIndices(missing, { mode: 'load-all', restore: true });
            if (!result?.aborted) {
                await this.enrichConversationArchivesWithApiAssets(indices, null).catch((error) => {
                    console.warn('[ChatGPT 导航与导出] 刷新附件元数据失败：', error);
                });
                this.updateConversationArchiveUi(`已加载 ${this.conversationArchive.size} 轮；附件信息已刷新`);
            }
        }

        shiftMarkdownHeadings(markdown, amount) {
            const shift = Math.max(0, Number(amount) || 0);
            if (!shift) return markdown;
            let inFence = false;
            let fenceMarker = '';
            return String(markdown || '').split('\n').map((line) => {
                const fence = /^\s*(`{3,}|~{3,})/.exec(line);
                if (fence) {
                    if (!inFence) {
                        inFence = true;
                        fenceMarker = fence[1][0];
                    } else if (fence[1][0] === fenceMarker) {
                        inFence = false;
                        fenceMarker = '';
                    }
                    return line;
                }
                if (inFence) return line;
                return line.replace(/^(#{1,6})\s+/, (match, hashes) => `${'#'.repeat(Math.min(6, hashes.length + shift))} `);
            }).join('\n');
        }

        getConversationExportTitle() {
            return String(document.title || 'ChatGPT Conversation')
                .replace(/\s*[-–—|]\s*ChatGPT\s*$/i, '')
                .trim() || 'ChatGPT Conversation';
        }

        sanitizeExportFilename(value) {
            const max = Math.max(24, Number(this.config.conversationExportFilenameMaxLength) || 90);
            const normalized = String(value || 'ChatGPT Conversation')
                .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
                .replace(/\s+/g, ' ')
                .replace(/[. ]+$/g, '')
                .trim();
            return (normalized || 'ChatGPT Conversation').slice(0, max).trim();
        }

        getAssetFallbackReference(asset) {
            const candidates = [asset?.sourceUrl, ...(asset?.alternateUrls || [])]
                .map((value) => String(value || '').trim())
                .filter(Boolean);
            return candidates[0] || '';
        }

        replaceArchiveAssetTokens(markdown, archive, assetPathMap = new Map()) {
            const assetsById = new Map((archive?.assets || []).map((asset) => [asset.id, asset]));
            return String(markdown || '').replace(/cgpt-asset:\/\/([\w.-]+)/g, (match, assetId) => {
                const local = assetPathMap.get(assetId);
                if (local) return encodeURI(local);
                const fallback = this.getAssetFallbackReference(assetsById.get(assetId));
                return fallback || '#asset-not-available';
            });
        }

        buildArchiveAssetMarkdown(archive, assetPathMap = new Map()) {
            const assets = Array.isArray(archive?.assets) ? archive.assets : [];
            if (!assets.length) return '';
            const lines = ['#### 图片、附件与 Artifacts', ''];
            for (const asset of assets) {
                const local = assetPathMap.get(asset.id);
                const reference = local || this.getAssetFallbackReference(asset);
                const label = this.escapeMarkdownInline(asset.label || asset.filenameHint || '附件');
                const suffix = local ? '' : reference ? '（外部链接）' : '（未能获取）';
                lines.push(reference ? `- [${label}](${encodeURI(reference)})${suffix}` : `- ${label}${suffix}`);
            }
            return `${lines.join('\n')}\n`;
        }

        buildConversationMarkdown(indices, options = {}) {
            const sorted = [...indices].sort((a, b) => a - b);
            const title = this.getConversationExportTitle();
            const assetPathMap = options.assetPathMap instanceof Map ? options.assetPathMap : new Map();
            const includeAssetAppendix = options.includeAssetAppendix !== false;
            const lines = [`# ${title}`, ''];
            if (this.config.conversationExportIncludeMetadata) {
                lines.push(`> 导出时间：${new Date().toLocaleString()}`);
                lines.push(`> 来源：${location.href}`);
                lines.push(`> 问答数量：${sorted.length}`);
                lines.push('');
            }

            const shift = Math.max(0, Number(this.config.conversationExportShiftAnswerHeadingsBy) || 0);
            for (const logicalIndex of sorted) {
                const archive = this.conversationArchive.get(logicalIndex);
                lines.push(`## 问答 ${logicalIndex + 1}`, '');
                lines.push('### 用户', '');
                if (archive?.userMarkdown || archive?.userText) {
                    const userMarkdown = this.replaceArchiveAssetTokens(
                        archive.userMarkdown || archive.userText,
                        archive,
                        assetPathMap,
                    );
                    lines.push(this.shiftMarkdownHeadings(userMarkdown, shift), '');
                } else {
                    const fallback = this.conversationItems.find((item) => item.logicalIndex === logicalIndex)?.fullLabel;
                    lines.push(fallback || `_未能加载第 ${logicalIndex + 1} 轮提问_`, '');
                }
                lines.push('### ChatGPT', '');
                if (archive?.assistantMarkdown) {
                    const assistantMarkdown = this.replaceArchiveAssetTokens(
                        archive.assistantMarkdown,
                        archive,
                        assetPathMap,
                    );
                    lines.push(this.shiftMarkdownHeadings(assistantMarkdown, shift), '');
                } else {
                    const reason = this.conversationArchiveFailures.get(logicalIndex) || '未能加载回答内容';
                    lines.push(`_${reason}_`, '');
                }
                if (archive && includeAssetAppendix) {
                    const appendix = this.buildArchiveAssetMarkdown(archive, assetPathMap);
                    if (appendix) lines.push(appendix, '');
                }
                lines.push('---', '');
            }
            return `${lines.join('\n').replace(/\n{4,}/g, '\n\n\n').trim()}\n`;
        }

        escapeHtml(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        rewriteSrcsetValue(value, urlPathMap) {
            return String(value || '').split(',').map((part) => {
                const trimmed = part.trim();
                if (!trimmed) return '';
                const match = /^(\S+)(\s+.*)?$/.exec(trimmed);
                if (!match) return trimmed;
                const rawUrl = match[1];
                const normalized = this.normalizeAssetCandidateUrl(rawUrl);
                const local = urlPathMap.get(normalized) || urlPathMap.get(rawUrl);
                return `${local || rawUrl}${match[2] || ''}`;
            }).filter(Boolean).join(', ');
        }

        rewriteArchiveHtmlFragment(html, archive, assetPathMap, urlPathMap) {
            const template = document.createElement('template');
            template.innerHTML = String(html || '');
            const assetsById = new Map((archive?.assets || []).map((asset) => [asset.id, asset]));
            const resolveAssetReference = (assetId) => {
                const asset = assetsById.get(assetId);
                return assetPathMap.get(assetId) || this.getAssetFallbackReference(asset) || '';
            };

            for (const element of template.content.querySelectorAll('*')) {
                const tag = element.tagName.toLowerCase();
                const assetId = element.getAttribute('data-cgpt-export-asset-id');
                if (assetId) {
                    const reference = resolveAssetReference(assetId);
                    if (reference) {
                        if (tag === 'a') element.setAttribute('href', reference);
                        else if (tag === 'object') element.setAttribute('data', reference);
                        else {
                            element.setAttribute('src', reference);
                            if (tag === 'iframe' && assetPathMap.has(assetId)) element.removeAttribute('srcdoc');
                        }
                    }
                    element.removeAttribute('data-cgpt-export-asset-id');
                }

                for (const attributeName of ['href', 'src', 'poster', 'data']) {
                    const raw = element.getAttribute(attributeName);
                    if (!raw) continue;
                    const tokenMatch = /^cgpt-asset:\/\/([\w.-]+)$/.exec(raw);
                    if (tokenMatch) {
                        const replacement = resolveAssetReference(tokenMatch[1]);
                        if (replacement) element.setAttribute(attributeName, replacement);
                        else element.removeAttribute(attributeName);
                        continue;
                    }
                    const normalized = this.normalizeAssetCandidateUrl(raw);
                    const local = urlPathMap.get(normalized) || urlPathMap.get(raw);
                    if (local) element.setAttribute(attributeName, local);
                }

                if (element.hasAttribute('srcset')) {
                    const rewritten = this.rewriteSrcsetValue(element.getAttribute('srcset'), urlPathMap);
                    if (rewritten) element.setAttribute('srcset', rewritten);
                    else element.removeAttribute('srcset');
                }

                for (const attribute of [...element.attributes]) {
                    if (/^on/i.test(attribute.name) || attribute.name.toLowerCase() === 'style') {
                        element.removeAttribute(attribute.name);
                    }
                }

                if (tag === 'a') {
                    element.setAttribute('rel', 'noopener noreferrer');
                    const href = element.getAttribute('href') || '';
                    if (!href.startsWith('#') && !/^(?:javascript|mailto|tel):/i.test(href)) {
                        element.setAttribute('target', '_blank');
                    }
                    if (/^(?:assets\/|\.\/assets\/)/i.test(href)) element.setAttribute('download', '');
                } else if (tag === 'iframe') {
                    element.classList.add('artifact-frame');
                    element.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
                    element.setAttribute('loading', 'lazy');
                    if (!element.getAttribute('title')) element.setAttribute('title', 'Artifact');
                } else if (tag === 'img') {
                    element.setAttribute('loading', 'lazy');
                    element.setAttribute('decoding', 'async');
                }
            }
            return template.innerHTML;
        }

        getAssetDisplayMetadata(asset) {
            const filename = asset?.resolvedFilename || asset?.filenameHint || asset?.label || '附件';
            const mime = String(asset?.mimeType || asset?.blob?.type || '').trim();
            const size = Number(asset?.byteLength || asset?.blob?.size || 0) || 0;
            const sizeLabel = size > 0
                ? size >= 1024 * 1024
                    ? `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MiB`
                    : `${Math.max(1, Math.round(size / 1024))} KiB`
                : '';
            return { filename, mime, sizeLabel };
        }

        buildArchiveAssetHtml(archive, assetPathMap) {
            const assets = Array.isArray(archive?.assets) ? archive.assets : [];
            if (!assets.length) return '';
            const cards = assets.map((asset) => {
                const local = assetPathMap.get(asset.id);
                const reference = local || this.getAssetFallbackReference(asset);
                const { filename, mime, sizeLabel } = this.getAssetDisplayMetadata(asset);
                const label = this.escapeHtml(asset.label || filename || '附件');
                const meta = [mime, sizeLabel].filter(Boolean).map((value) => this.escapeHtml(value)).join(' · ');
                const status = local ? '已归档' : reference ? '外部链接' : '未能获取';
                const icon = asset.kind === 'image' ? '图片' : asset.kind === 'artifact-html' ? 'HTML' : '文件';
                const preview = local && asset.kind === 'image'
                    ? `<a class="asset-preview" href="${this.escapeHtml(reference)}" target="_blank" rel="noopener noreferrer"><img src="${this.escapeHtml(reference)}" alt="${label}" loading="lazy" decoding="async"></a>`
                    : '';
                const main = reference
                    ? `<a class="asset-link" href="${this.escapeHtml(reference)}" target="_blank" rel="noopener noreferrer"${local ? ' download' : ''}>${label}</a>`
                    : `<span class="asset-link asset-unavailable">${label}</span>`;
                return `<li class="asset-card ${asset.kind === 'image' ? 'asset-image' : ''}">
          ${preview}
          <div class="asset-card-body"><span class="asset-badge">${icon}</span>${main}
          <div class="asset-meta">${meta ? `${meta} · ` : ''}${status}</div></div>
        </li>`;
            }).join('');
            return `<section class="assets"><h4>图片、附件与 Artifacts</h4><ul class="asset-grid">${cards}</ul></section>`;
        }

        buildConversationHtml(indices, options = {}) {
            const sorted = [...indices].sort((a, b) => a - b);
            const title = this.getConversationExportTitle();
            const assetPathMap = options.assetPathMap instanceof Map ? options.assetPathMap : new Map();
            const urlPathMap = options.urlPathMap instanceof Map ? options.urlPathMap : new Map();
            const maxWidth = Math.max(760, Number(this.config.conversationExportHtmlMaxWidthPx) || 1240);
            const includeSidebar = this.config.conversationExportHtmlIncludeSidebar !== false && sorted.length > 1;
            const sections = [];
            const navItems = [];

            for (const logicalIndex of sorted) {
                const archive = this.conversationArchive.get(logicalIndex);
                const fallbackQuestion = archive?.userText || this.conversationItems.find((item) => item.logicalIndex === logicalIndex)?.fullLabel || `问答 ${logicalIndex + 1}`;
                const navLabel = this.truncateLabel(this.normalizeConversationText(fallbackQuestion), 86, 86);
                navItems.push(`<li><a href="#qa-${logicalIndex + 1}"><span class="nav-index">${logicalIndex + 1}</span><span>${this.escapeHtml(navLabel)}</span></a></li>`);
                const userHtml = archive?.userHtml
                    ? this.rewriteArchiveHtmlFragment(archive.userHtml, archive, assetPathMap, urlPathMap)
                    : `<p>${this.escapeHtml(fallbackQuestion)}</p>`;
                const assistantHtml = archive?.assistantHtml
                    ? this.rewriteArchiveHtmlFragment(archive.assistantHtml, archive, assetPathMap, urlPathMap)
                    : `<pre>${this.escapeHtml(archive?.assistantMarkdown || this.conversationArchiveFailures.get(logicalIndex) || '未能加载回答内容')}</pre>`;
                const assetHtml = archive ? this.buildArchiveAssetHtml(archive, assetPathMap) : '';
                sections.push(`
          <article class="qa" id="qa-${logicalIndex + 1}">
            <header class="qa-header"><span class="qa-kicker">问答</span><h2>${logicalIndex + 1}</h2><a class="back-top" href="#page-top" aria-label="返回顶部">↑</a></header>
            <section class="message user"><header class="message-header"><span class="role-dot"></span><h3>用户</h3></header><div class="message-content">${userHtml}</div></section>
            <section class="message assistant"><header class="message-header"><span class="role-dot"></span><h3>ChatGPT</h3></header><div class="message-content">${assistantHtml}</div></section>
            ${assetHtml}
          </article>`);
            }

            const sourceUrl = this.escapeHtml(location.href);
            const metadata = this.config.conversationExportIncludeMetadata
                ? `<div class="metadata"><span>导出时间：${this.escapeHtml(new Date().toLocaleString())}</span><span>问答数量：${sorted.length}</span><a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">打开原对话</a></div>`
                : '';
            const sidebar = includeSidebar
                ? `<aside class="conversation-nav" aria-label="问答目录"><div class="nav-title">问答目录</div><ol>${navItems.join('')}</ol></aside>`
                : '';

            return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${this.escapeHtml(title)}</title>
<style>
  :root{
    color-scheme:light dark;
    --page:#f7f7f5;--surface:#fff;--surface-soft:#f2f3f1;--surface-user:#eef5ff;
    --text:#202123;--muted:#666b73;--border:#dcdedb;--accent:#2563eb;--accent-soft:#e8efff;
    --code:#16181d;--code-text:#f4f6f8;--quote:#eff2f6;--shadow:0 8px 28px rgba(0,0,0,.07);
  }
  @media(prefers-color-scheme:dark){:root{
    --page:#111210;--surface:#191a18;--surface-soft:#222320;--surface-user:#172235;
    --text:#eceeeb;--muted:#a6aaa4;--border:#343633;--accent:#82aaff;--accent-soft:#253454;
    --code:#0d0f12;--code-text:#f4f6f8;--quote:#23272d;--shadow:0 10px 32px rgba(0,0,0,.3);
  }}
  *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:24px}
  body{margin:0;background:var(--page);color:var(--text);font:15.5px/1.72 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;overflow-wrap:anywhere}
  a{color:var(--accent);text-decoration-thickness:.08em;text-underline-offset:.18em}a:hover{text-decoration-thickness:.12em}
  .page-header{background:var(--surface);border-bottom:1px solid var(--border)}
  .page-header-inner{max-width:${maxWidth}px;margin:auto;padding:34px clamp(20px,4vw,54px) 28px}
  .page-eyebrow{margin:0 0 7px;color:var(--accent);font-size:12px;font-weight:720;letter-spacing:.12em;text-transform:uppercase}
  h1{margin:0;font-size:clamp(28px,4.2vw,46px);line-height:1.14;letter-spacing:-.025em}
  .metadata{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:16px;color:var(--muted);font-size:13px}.metadata a{margin-inline-start:auto}
  .layout{display:grid;grid-template-columns:${includeSidebar ? 'minmax(180px,250px) minmax(0,1fr)' : 'minmax(0,1fr)'};gap:clamp(22px,3vw,42px);max-width:${maxWidth}px;margin:auto;padding:30px clamp(20px,4vw,54px) 64px;align-items:start}
  .conversation-nav{position:sticky;top:20px;max-height:calc(100vh - 40px);overflow:auto;padding:16px 10px 16px 0;scrollbar-width:thin}
  .nav-title{padding:0 10px 10px;color:var(--muted);font-size:12px;font-weight:720;letter-spacing:.08em;text-transform:uppercase}
  .conversation-nav ol{list-style:none;margin:0;padding:0}.conversation-nav li{margin:2px 0}
  .conversation-nav a{display:flex;gap:9px;align-items:flex-start;padding:8px 10px;border-radius:9px;color:var(--muted);text-decoration:none;font-size:13px;line-height:1.35}
  .conversation-nav a:hover{background:var(--surface-soft);color:var(--text)}.nav-index{flex:none;display:grid;place-items:center;min-width:22px;height:22px;border:1px solid var(--border);border-radius:6px;font-size:11px;font-weight:700}
  main{min-width:0}.qa{margin:0 0 36px;scroll-margin-top:24px}.qa-header{display:flex;align-items:baseline;gap:7px;margin-bottom:12px;color:var(--muted)}
  .qa-header h2{margin:0;color:var(--text);font-size:20px}.qa-kicker{font-size:12px;font-weight:720;letter-spacing:.1em;text-transform:uppercase}.back-top{margin-inline-start:auto;color:var(--muted);text-decoration:none}
  .message{margin:12px 0;border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}
  .message.user{background:var(--surface-user)}.message-header{display:flex;align-items:center;gap:8px;padding:13px 18px 0}.message-header h3{margin:0;font-size:13px;letter-spacing:.01em}
  .role-dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}.assistant .role-dot{background:#16a36a}
  .message-content{padding:13px 18px 18px;min-width:0}.message-content>:first-child{margin-top:0}.message-content>:last-child{margin-bottom:0}
  .message-content h1,.message-content h2,.message-content h3,.message-content h4,.message-content h5,.message-content h6{line-height:1.3;letter-spacing:-.012em;margin:1.35em 0 .55em;scroll-margin-top:24px}
  .message-content h1{font-size:1.62em}.message-content h2{font-size:1.38em}.message-content h3{font-size:1.18em}.message-content h4{font-size:1.05em}
  .message-content p{margin:.72em 0}.message-content ul,.message-content ol{padding-inline-start:1.55em;margin:.7em 0}.message-content li+li{margin-top:.3em}
  .message-content blockquote{margin:1em 0;padding:.55em 1em;border-inline-start:4px solid var(--accent);border-radius:0 8px 8px 0;background:var(--quote);color:var(--muted)}
  .message-content hr{border:0;border-top:1px solid var(--border);margin:1.5em 0}.message-content strong{font-weight:720}
  .message-content code{padding:.13em .36em;border:1px solid var(--border);border-radius:5px;background:var(--surface-soft);font:0.9em/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
  .message-content pre{max-width:100%;overflow:auto;margin:1em 0;padding:16px 18px;border-radius:11px;background:var(--code);color:var(--code-text);tab-size:2;white-space:pre}
  .message-content pre code{padding:0;border:0;background:none;color:inherit;font-size:13px;white-space:pre}
  .table-wrap{max-width:100%;overflow:auto;margin:1em 0;border:1px solid var(--border);border-radius:10px}.table-wrap table{width:100%;min-width:480px;border-collapse:collapse;background:var(--surface)}
  .table-wrap th,.table-wrap td{padding:9px 12px;border-bottom:1px solid var(--border);border-inline-end:1px solid var(--border);text-align:start;vertical-align:top}.table-wrap th{background:var(--surface-soft);font-weight:700}.table-wrap tr:last-child>*{border-bottom:0}.table-wrap tr>*:last-child{border-inline-end:0}
  .message-content img,.asset-preview img{display:block;max-width:100%;height:auto;margin:1em auto;border-radius:10px;object-fit:contain}.message-content video,.message-content audio{max-width:100%}
  .artifact-frame,.message-content iframe{display:block;width:100%;min-height:min(68vh,720px);margin:1em 0;border:1px solid var(--border);border-radius:11px;background:#fff}
  .message-content details{margin:.8em 0;padding:.65em .8em;border:1px solid var(--border);border-radius:9px;background:var(--surface-soft)}.message-content summary{cursor:pointer;font-weight:650}
  .math-display{display:block;max-width:100%;overflow:auto;padding:.55em 0;text-align:center}.math-inline{display:inline}.math math{font-size:1.05em}
  .inline-attachment{display:inline-flex;align-items:center;gap:6px;padding:.45em .65em;border:1px solid var(--border);border-radius:8px;background:var(--surface-soft);text-decoration:none}
  .assets{margin:16px 0 0;padding:16px 18px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.assets h4{margin:0 0 12px;font-size:14px}
  .asset-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:10px;list-style:none;margin:0;padding:0}.asset-card{display:flex;min-width:0;gap:11px;padding:11px;border:1px solid var(--border);border-radius:10px;background:var(--surface-soft)}
  .asset-card.asset-image{display:block}.asset-preview{display:block;margin-bottom:9px}.asset-preview img{width:100%;max-height:280px;margin:0;background:var(--surface);object-fit:contain}.asset-card-body{min-width:0}.asset-badge{display:inline-block;margin:0 7px 4px 0;padding:2px 6px;border-radius:5px;background:var(--accent-soft);color:var(--accent);font-size:10px;font-weight:750;letter-spacing:.04em}
  .asset-link{font-weight:650;word-break:break-word}.asset-unavailable{color:var(--muted)}.asset-meta{margin-top:3px;color:var(--muted);font-size:11.5px}
  @media(max-width:820px){.layout{display:block;padding-inline:16px}.conversation-nav{position:static;max-height:none;margin:0 0 24px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.conversation-nav ol{display:flex;gap:6px;overflow:auto}.conversation-nav li{flex:0 0 min(280px,78vw)}.page-header-inner{padding-inline:18px}.metadata a{margin-inline-start:0}.message-content{padding-inline:14px}.message-header{padding-inline:14px}}
  @media(max-width:520px){body{font-size:15px}.page-header-inner{padding-top:24px}.message{border-radius:12px}.asset-grid{grid-template-columns:1fr}.qa{margin-bottom:28px}.artifact-frame,.message-content iframe{min-height:420px}}
  @media print{body{background:#fff;color:#000}.page-header{border:0}.conversation-nav,.back-top{display:none}.layout{display:block;max-width:none;padding:0}.message,.assets{box-shadow:none;break-inside:avoid}.qa{break-before:auto}.message-content a{color:inherit}.artifact-frame{min-height:300px}}
</style>
</head>
<body id="page-top">
<header class="page-header"><div class="page-header-inner"><p class="page-eyebrow">ChatGPT 对话归档</p><h1>${this.escapeHtml(title)}</h1>${metadata}</div></header>
<div class="layout">${sidebar}<main>${sections.join('\n')}</main></div>
</body>
</html>`;
        }

        downloadMarkdown(markdown, selectedOnly) {
            const title = this.sanitizeExportFilename(this.getConversationExportTitle());
            const date = new Date();
            const stamp = [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, '0'),
                String(date.getDate()).padStart(2, '0'),
                '-',
                String(date.getHours()).padStart(2, '0'),
                String(date.getMinutes()).padStart(2, '0'),
            ].join('');
            const suffix = selectedOnly ? '-selected' : '-all';
            const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${title}${suffix}-${stamp}.md`;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 3000);
        }

        getExportTimestamp() {
            const date = new Date();
            return [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, '0'),
                String(date.getDate()).padStart(2, '0'),
                '-',
                String(date.getHours()).padStart(2, '0'),
                String(date.getMinutes()).padStart(2, '0'),
            ].join('');
        }

        downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            anchor.style.display = 'none';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 5000);
        }

        parseContentDispositionFilename(value) {
            const header = String(value || '');
            const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
            if (utf8) {
                try { return decodeURIComponent(utf8); } catch { return utf8; }
            }
            const plain = /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i.exec(header);
            return plain?.[1] || plain?.[2]?.trim() || '';
        }

        async fetchAssetWithPageFetch(url, signal) {
            const controller = new AbortController();
            const timeoutMs = Math.max(2000, Number(this.config.conversationExportAssetTimeoutMs) || 30000);
            const timer = window.setTimeout(() => controller.abort(), timeoutMs);
            const abort = () => controller.abort();
            signal?.addEventListener('abort', abort, { once: true });
            try {
                const response = await fetch(url, {
                    method: 'GET',
                    credentials: 'include',
                    redirect: 'follow',
                    cache: 'no-store',
                    signal: controller.signal,
                });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const declaredSize = Number(response.headers.get('content-length')) || 0;
                const maxAsset = Math.max(1, Number(this.config.conversationExportMaxAssetBytes) || 0);
                if (declaredSize && declaredSize > maxAsset) {
                    throw new Error(`附件超过大小限制（${Math.round(declaredSize / 1024 / 1024)} MiB）`);
                }
                return {
                    blob: await response.blob(),
                    finalUrl: response.url || url,
                    contentType: response.headers.get('content-type') || '',
                    contentDisposition: response.headers.get('content-disposition') || '',
                };
            } finally {
                window.clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
            }
        }

        normalizeGmBinaryResponse(value, contentType = '') {
            if (value instanceof Blob) return value;
            if (value == null) throw new Error('跨域请求没有返回内容');
            if (value instanceof ArrayBuffer) {
                return new Blob([value], { type: contentType || 'application/octet-stream' });
            }
            if (ArrayBuffer.isView(value)) {
                const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                return new Blob([bytes], { type: contentType || 'application/octet-stream' });
            }
            const tag = Object.prototype.toString.call(value);
            if (tag === '[object ArrayBuffer]' || (typeof value === 'object' && Number.isFinite(value.byteLength))) {
                try {
                    return new Blob([new Uint8Array(value)], { type: contentType || 'application/octet-stream' });
                } catch { }
            }
            if (typeof value === 'string') {
                return new Blob([value], { type: contentType || 'text/plain;charset=utf-8' });
            }
            throw new Error(`跨域请求返回了无法识别的二进制类型：${tag}`);
        }

        fetchAssetWithGmRequest(url, signal) {
            if (typeof GM_xmlhttpRequest !== 'function') {
                return Promise.reject(new Error('GM_xmlhttpRequest 不可用'));
            }
            return new Promise((resolve, reject) => {
                let settled = false;
                const finish = (callback, value) => {
                    if (settled) return;
                    settled = true;
                    signal?.removeEventListener('abort', onAbort);
                    callback(value);
                };
                const request = GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'arraybuffer',
                    timeout: Math.max(2000, Number(this.config.conversationExportAssetTimeoutMs) || 30000),
                    anonymous: false,
                    headers: { Accept: '*/*' },
                    onload: (response) => {
                        const status = Number(response.status) || 0;
                        if (status && (status < 200 || status >= 300)) {
                            finish(reject, new Error(`HTTP ${status}`));
                            return;
                        }
                        const headers = String(response.responseHeaders || '');
                        const contentType = /^content-type:\s*(.+)$/im.exec(headers)?.[1]?.trim() || '';
                        const contentDisposition = /^content-disposition:\s*(.+)$/im.exec(headers)?.[1]?.trim() || '';
                        try {
                            const blob = this.normalizeGmBinaryResponse(response.response ?? response.responseText, contentType);
                            finish(resolve, {
                                blob,
                                finalUrl: response.finalUrl || url,
                                contentType: contentType || blob.type || '',
                                contentDisposition,
                            });
                        } catch (error) {
                            finish(reject, error);
                        }
                    },
                    onerror: (response) => finish(reject, new Error(`跨域附件请求失败${response?.status ? `：HTTP ${response.status}` : ''}`)),
                    ontimeout: () => finish(reject, new Error('附件下载超时')),
                    onabort: () => finish(reject, new DOMException('Aborted', 'AbortError')),
                });
                const onAbort = () => {
                    try { request?.abort?.(); } catch { }
                    finish(reject, new DOMException('Aborted', 'AbortError'));
                };
                signal?.addEventListener('abort', onAbort, { once: true });
                if (signal?.aborted) onAbort();
            });
        }

        async unwrapAssetDownloadResponse(result, asset, signal, visitedUrls) {
            const contentType = String(result?.contentType || result?.blob?.type || '').toLowerCase();
            const finalUrl = this.normalizeAssetCandidateUrl(result?.finalUrl || '');
            const mayBeJson = contentType.includes('json') || (!contentType && result?.blob?.size <= 1024 * 1024);
            if (mayBeJson && result?.blob?.size <= 2 * 1024 * 1024) {
                let text = '';
                try { text = await result.blob.text(); } catch { }
                const trimmed = text.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                        const data = JSON.parse(trimmed);
                        const downloadUrl = data?.download_url || data?.downloadUrl || data?.url || data?.file?.download_url || '';
                        if (downloadUrl) {
                            const normalized = this.normalizeAssetCandidateUrl(downloadUrl);
                            if (normalized && !visitedUrls.has(normalized)) {
                                const nested = await this.fetchBinaryAssetCandidates([normalized], asset, signal, visitedUrls);
                                if (!nested.resolvedFilename) {
                                    nested.resolvedFilename = data?.file_name || data?.filename || data?.name || '';
                                }
                                return nested;
                            }
                        }
                        const apiError = data?.detail || data?.error?.message || data?.message;
                        if (apiError) throw new Error(String(apiError));
                    } catch (error) {
                        if (error instanceof SyntaxError) {
                            // JSON 探测失败时仍按普通二进制处理。
                        } else {
                            throw error;
                        }
                    }
                }
            }

            if (contentType.includes('text/html') && result?.blob?.size <= 2 * 1024 * 1024) {
                const text = await result.blob.text().catch(() => '');
                if (/<title>\s*(?:log\s*in|sign\s*in|chatgpt)/i.test(text) || /\/auth\/login/i.test(finalUrl)) {
                    throw new Error('附件地址返回了登录页面，签名链接可能已经失效');
                }
            }

            const maxAsset = Math.max(1, Number(this.config.conversationExportMaxAssetBytes) || 0);
            if (result.blob.size > maxAsset) {
                throw new Error(`附件超过大小限制（${Math.round(result.blob.size / 1024 / 1024)} MiB）`);
            }
            const dispositionName = this.parseContentDispositionFilename(result.contentDisposition);
            let urlName = '';
            try {
                const part = decodeURIComponent(new URL(finalUrl || location.href).pathname.split('/').filter(Boolean).pop() || '');
                if (/\.[a-z0-9]{1,10}$/i.test(part)) urlName = part;
            } catch { }
            return { ...result, resolvedFilename: dispositionName || urlName || '' };
        }

        async fetchBinaryAssetCandidates(candidates, asset, signal, visitedUrls = new Set()) {
            const errors = [];
            const unique = [...new Set((candidates || []).map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean))];
            for (const url of unique) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                if (visitedUrls.has(url)) continue;
                visitedUrls.add(url);
                if (/^sandbox:/i.test(url)) {
                    errors.push(`${url}: sandbox 链接需要 file_id 才能解析`);
                    continue;
                }

                try {
                    const result = await this.fetchAssetWithPageFetch(url, signal);
                    return await this.unwrapAssetDownloadResponse(result, asset, signal, visitedUrls);
                } catch (error) {
                    if (error?.name === 'AbortError') throw error;
                    errors.push(`${url}: 页面请求 ${error?.message || error}`);
                }

                if (/^https?:/i.test(url)) {
                    try {
                        const result = await this.fetchAssetWithGmRequest(url, signal);
                        return await this.unwrapAssetDownloadResponse(result, asset, signal, visitedUrls);
                    } catch (error) {
                        if (error?.name === 'AbortError') throw error;
                        errors.push(`${url}: 跨域请求 ${error?.message || error}`);
                    }
                }
            }
            throw new Error(errors.join('；') || '没有可读取的附件地址');
        }

        async fetchArchiveAsset(asset, signal) {
            if (asset?.blob instanceof Blob) {
                return {
                    blob: asset.blob,
                    finalUrl: asset.sourceUrl || '',
                    contentType: asset.blob.type || asset.mimeType || '',
                    contentDisposition: '',
                    resolvedFilename: asset.filenameHint || '',
                };
            }

            const candidates = [];
            let metadata = null;
            const fileId = asset?.fileId || this.extractFileIdFromValue(asset?.sourceUrl);
            const errors = [];
            if (fileId) {
                try {
                    metadata = await this.resolveFileDownloadMetadata(fileId, signal);
                    if (metadata.size > Math.max(1, Number(this.config.conversationExportMaxAssetBytes) || 0)) {
                        throw new Error(`附件超过大小限制（${Math.round(metadata.size / 1024 / 1024)} MiB）`);
                    }
                    if (metadata.downloadUrl) candidates.push(metadata.downloadUrl);
                } catch (error) {
                    if (error?.name === 'AbortError') throw error;
                    errors.push(`file_id ${fileId}: ${error?.message || error}`);
                }
            }
            candidates.push(asset?.sourceUrl, ...(asset?.alternateUrls || []));

            try {
                const result = await this.fetchBinaryAssetCandidates(candidates, asset, signal);
                return {
                    ...result,
                    contentType: result.contentType || metadata?.mimeType || asset?.mimeType || result.blob.type || '',
                    resolvedFilename: result.resolvedFilename || metadata?.filename || asset?.filenameHint || '',
                };
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                errors.push(error?.message || String(error));
            }
            throw new Error(errors.filter(Boolean).join('；') || '没有可读取的附件地址');
        }

        ensureAssetFilenameExtension(filename, mimeType) {
            const safe = this.sanitizeAssetFilename(filename, 'asset');
            const extension = this.getMimeExtension(mimeType);
            if (/\.bin$/i.test(safe) && extension && extension !== 'bin') {
                return `${safe.slice(0, -4)}.${extension}`;
            }
            if (/\.[a-z0-9]{1,10}$/i.test(safe)) return safe;
            return extension ? `${safe}.${extension}` : safe;
        }

        createUniqueAssetPath(logicalIndex, filename, usedPaths) {
            const folder = `assets/q${String(logicalIndex + 1).padStart(3, '0')}`;
            const safe = this.sanitizeAssetFilename(filename, 'asset').replace(/\s+/g, '-');
            const dot = safe.lastIndexOf('.');
            const stem = dot > 0 ? safe.slice(0, dot) : safe;
            const extension = dot > 0 ? safe.slice(dot) : '';
            let candidate = `${folder}/${safe}`;
            let suffix = 2;
            while (usedPaths.has(candidate.toLowerCase())) {
                candidate = `${folder}/${stem}-${suffix}${extension}`;
                suffix += 1;
            }
            usedPaths.add(candidate.toLowerCase());
            return candidate;
        }

        getArchiveAssetsForIndices(indices) {
            const entries = [];
            for (const logicalIndex of indices) {
                const archive = this.conversationArchive.get(logicalIndex);
                for (const asset of archive?.assets || []) entries.push({ logicalIndex, archive, asset });
            }
            return entries;
        }

        async prepareZipAssets(indices, includeAssets, signal) {
            const tokenPathMap = new Map();
            const urlPathMap = new Map();
            const files = [];
            const manifest = [];
            if (!includeAssets) {
                for (const { logicalIndex, asset } of this.getArchiveAssetsForIndices(indices)) {
                    manifest.push({
                        logicalIndex,
                        id: asset.id,
                        label: asset.label,
                        kind: asset.kind,
                        sourceUrl: asset.sourceUrl || '',
                        fileId: asset.fileId || '',
                        included: false,
                        reason: '用户未勾选“图片和附件”',
                    });
                }
                return { tokenPathMap, urlPathMap, files, manifest };
            }

            const entries = this.getArchiveAssetsForIndices(indices);
            const uniqueJobs = new Map();
            for (const entry of entries) {
                const key = entry.asset.fileId
                    ? `file-id|${entry.asset.fileId}`
                    : entry.asset.sourceUrl || entry.asset.blob
                        ? `${entry.asset.kind}|${entry.asset.sourceUrl || entry.asset.id}`
                        : entry.asset.id;
                if (!uniqueJobs.has(key)) uniqueJobs.set(key, { ...entry, refs: [] });
                uniqueJobs.get(key).refs.push(entry);
            }

            this.conversationAssetProgress = { completed: 0, total: uniqueJobs.size, failed: 0 };
            const usedPaths = new Set();
            let plannedZipBytes = 0;
            const maxZip = Math.max(1, Number(this.config.conversationExportMaxZipBytes) || 0);
            for (const job of uniqueJobs.values()) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                const { asset, logicalIndex } = job;
                this.updateConversationArchiveUi(
                    `正在获取附件 ${this.conversationAssetProgress.completed + 1}/${this.conversationAssetProgress.total}：${asset.label || asset.filenameHint || '附件'}`,
                );
                try {
                    const result = await this.fetchArchiveAsset(asset, signal);
                    if (plannedZipBytes + result.blob.size > maxZip) {
                        throw new Error(`加入此文件后 ZIP 将超过 ${Math.round(maxZip / 1024 / 1024)} MiB 限制`);
                    }
                    const dispositionName = this.parseContentDispositionFilename(result.contentDisposition);
                    const filename = this.ensureAssetFilenameExtension(
                        dispositionName || result.resolvedFilename || asset.filenameHint || asset.label || 'asset',
                        result.contentType || asset.mimeType || result.blob.type,
                    );
                    const path = this.createUniqueAssetPath(logicalIndex, filename, usedPaths);
                    plannedZipBytes += result.blob.size;
                    files.push({ path, blob: result.blob, asset, logicalIndex });
                    for (const ref of job.refs) {
                        ref.asset.byteLength = result.blob.size;
                        ref.asset.mimeType = result.contentType || ref.asset.mimeType || result.blob.type || '';
                        if (result.resolvedFilename) ref.asset.resolvedFilename = result.resolvedFilename;
                        tokenPathMap.set(ref.asset.id, path);
                        for (const url of [ref.asset.sourceUrl, ...(ref.asset.alternateUrls || [])]) {
                            if (!url) continue;
                            urlPathMap.set(url, path);
                            urlPathMap.set(this.normalizeAssetCandidateUrl(url), path);
                        }
                        manifest.push({
                            logicalIndex: ref.logicalIndex,
                            id: ref.asset.id,
                            label: ref.asset.label,
                            kind: ref.asset.kind,
                            sourceUrl: ref.asset.sourceUrl || '',
                            fileId: ref.asset.fileId || '',
                            included: true,
                            path,
                            size: result.blob.size,
                            mimeType: result.contentType || ref.asset.mimeType || result.blob.type || '',
                        });
                    }
                } catch (error) {
                    if (error?.name === 'AbortError') throw error;
                    this.conversationAssetProgress.failed += 1;
                    for (const ref of job.refs) {
                        manifest.push({
                            logicalIndex: ref.logicalIndex,
                            id: ref.asset.id,
                            label: ref.asset.label,
                            kind: ref.asset.kind,
                            sourceUrl: ref.asset.sourceUrl || '',
                            fileId: ref.asset.fileId || '',
                            included: false,
                            reason: error?.message || String(error),
                        });
                    }
                } finally {
                    this.conversationAssetProgress.completed += 1;
                }
            }
            return { tokenPathMap, urlPathMap, files, manifest };
        }

        buildZipReadme(assetManifest) {
            const failures = assetManifest.filter((item) => !item.included);
            const lines = [
                'ChatGPT 对话归档',
                '',
                'conversation.md：适合 Markdown 阅读器。',
                'conversation.html：可直接在浏览器中离线打开。',
                'assets/：成功获取的图片、文件和 HTML Artifacts。',
                'manifest.json：每个资源的来源、导出路径和失败原因。',
                '',
                '资源解析会优先使用对话数据中的 file_id 换取临时下载地址，再以页面 DOM 地址作为后备。',
                'manifest.json 会记录 file_id、来源 URL、归档路径和失败原因。',
                '如果签名链接已过期、账号无权限、文件超过限制，或页面未提供 file_id，附件仍可能无法打包。',
            ];
            if (failures.length) {
                lines.push('', `未打包资源：${failures.length} 个`, '');
                for (const item of failures) {
                    lines.push(`- 第 ${item.logicalIndex + 1} 轮 / ${item.label || item.id}: ${item.reason || '未知原因'}`);
                }
            }
            return `${lines.join('\n')}\n`;
        }

        async exportConversationIndicesZip(indices, selectedOnly) {
            if (this.conversationExportInProgress || this.conversationLoadPromise) return;
            const uniqueIndices = [...new Set(indices)]
                .filter((index) => Number.isInteger(index) && index >= 0)
                .sort((a, b) => a - b);
            if (!uniqueIndices.length) {
                this.updateConversationArchiveUi('没有可导出的问答');
                return;
            }

            this.conversationExportInProgress = true;
            const controller = new AbortController();
            this.conversationLoadAbortController = controller;
            this.pinTransientHoverOpen(true);
            let completionMessage = '';
            try {
                this.updateConversationArchiveUi('正在准备 ZIP…');
                const missing = uniqueIndices.filter((index) => !this.conversationArchive.has(index));
                if (missing.length) {
                    this.conversationLoadAbortController = null;
                    const loadResult = await this.loadConversationIndices(missing, { mode: 'zip-export', restore: true });
                    if (loadResult?.aborted) {
                        completionMessage = 'ZIP 导出已取消';
                        return;
                    }
                    this.conversationLoadAbortController = controller;
                }

                this.updateConversationArchiveUi('正在解析图片和附件元数据…');
                await this.enrichConversationArchivesWithApiAssets(uniqueIndices, controller.signal).catch((error) => {
                    console.warn('[ChatGPT 导航与导出] API 附件元数据解析失败，将使用页面 DOM 作为后备：', error);
                });

                const assetPlan = await this.prepareZipAssets(
                    uniqueIndices,
                    this.exportIncludeAssets,
                    controller.signal,
                );
                const zip = new StoredZipBuilder();
                const title = this.sanitizeExportFilename(this.getConversationExportTitle());
                const documentBase = this.sanitizeAssetFilename(title, 'conversation').replace(/\s+/g, '-');

                if (this.exportIncludeMarkdown) {
                    const markdown = this.buildConversationMarkdown(uniqueIndices, {
                        assetPathMap: assetPlan.tokenPathMap,
                        includeAssetAppendix: true,
                    });
                    await zip.add(`${documentBase}.md`, new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
                }
                if (this.exportIncludeHtml) {
                    const html = this.buildConversationHtml(uniqueIndices, {
                        assetPathMap: assetPlan.tokenPathMap,
                        urlPathMap: assetPlan.urlPathMap,
                    });
                    await zip.add(`${documentBase}.html`, new Blob([html], { type: 'text/html;charset=utf-8' }));
                }
                for (let index = 0; index < assetPlan.files.length; index += 1) {
                    const file = assetPlan.files[index];
                    this.updateConversationArchiveUi(`正在写入 ZIP ${index + 1}/${assetPlan.files.length}：${file.path.split('/').pop()}`);
                    await zip.add(file.path, file.blob);
                }

                const manifest = {
                    version: 2,
                    generatedAt: new Date().toISOString(),
                    source: location.href,
                    title: this.getConversationExportTitle(),
                    selectedOnly,
                    conversationIndices: uniqueIndices.map((index) => index + 1),
                    options: {
                        markdown: this.exportIncludeMarkdown,
                        html: this.exportIncludeHtml,
                        assets: this.exportIncludeAssets,
                    },
                    assets: assetPlan.manifest,
                };
                await zip.add('manifest.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json;charset=utf-8' }));
                await zip.add('README.txt', new Blob([this.buildZipReadme(assetPlan.manifest)], { type: 'text/plain;charset=utf-8' }));

                const blob = zip.build();
                const suffix = selectedOnly ? '-selected' : '-all';
                this.downloadBlob(blob, `${title}${suffix}-${this.getExportTimestamp()}.zip`);
                const failedAssets = assetPlan.manifest.filter((item) => !item.included).length;
                completionMessage = failedAssets
                    ? `ZIP 已导出；${failedAssets} 个资源未能打包，详见 manifest`
                    : `ZIP 已导出：${uniqueIndices.length} 轮，附件 ${assetPlan.files.length} 个`;
            } catch (error) {
                if (error?.name === 'AbortError') completionMessage = 'ZIP 导出已取消';
                else {
                    completionMessage = `ZIP 导出失败：${error?.message || error}`;
                    console.error('[ChatGPT 导航与导出] ZIP 导出失败：', error);
                }
            } finally {
                if (this.conversationLoadAbortController === controller) {
                    this.conversationLoadAbortController = null;
                }
                this.conversationExportInProgress = false;
                this.updateConversationArchiveUi(completionMessage);
                window.setTimeout(() => this.updateConversationArchiveUi(), 2600);
            }
        }

        exportSelectedConversationsZip() {
            const valid = new Set(this.getAllConversationLogicalIndices());
            const indices = [...this.selectedConversationIndices].filter((index) => valid.has(index));
            return this.exportConversationIndicesZip(indices, true);
        }

        exportAllConversationsZip() {
            return this.exportConversationIndicesZip(this.getAllConversationLogicalIndices(), false);
        }

        async exportConversationIndices(indices, selectedOnly) {
            if (this.conversationExportInProgress || this.conversationLoadPromise) return;
            const uniqueIndices = [...new Set(indices)]
                .filter((index) => Number.isInteger(index) && index >= 0)
                .sort((a, b) => a - b);
            if (!uniqueIndices.length) {
                this.updateConversationArchiveUi('没有可导出的问答');
                return;
            }

            this.conversationExportInProgress = true;
            this.updateConversationArchiveUi('正在准备 Markdown…');
            let completionMessage = '';
            try {
                const missing = uniqueIndices.filter((index) => !this.conversationArchive.has(index));
                if (missing.length) {
                    const loadResult = await this.loadConversationIndices(missing, { mode: 'export', restore: true });
                    if (loadResult?.aborted) {
                        completionMessage = '导出已取消';
                        return;
                    }
                }
                const markdown = this.buildConversationMarkdown(uniqueIndices);
                this.downloadMarkdown(markdown, selectedOnly);
                const succeeded = uniqueIndices.filter((index) => this.conversationArchive.has(index)).length;
                const failed = uniqueIndices.length - succeeded;
                completionMessage = failed
                    ? `已导出 ${uniqueIndices.length} 轮，其中 ${failed} 轮不完整`
                    : `已导出 ${uniqueIndices.length} 轮`;
            } finally {
                this.conversationExportInProgress = false;
                this.updateConversationArchiveUi(completionMessage);
                window.setTimeout(() => this.updateConversationArchiveUi(), 1800);
            }
        }

        exportSelectedConversations() {
            const valid = new Set(this.getAllConversationLogicalIndices());
            const indices = [...this.selectedConversationIndices].filter((index) => valid.has(index));
            return this.exportConversationIndices(indices, true);
        }

        exportAllConversations() {
            return this.exportConversationIndices(this.getAllConversationLogicalIndices(), false);
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
        if (window.__CGPT_TOC_TEST_MODE__) window.__cgptAnswerTocController = controller;
        controller.start();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startAnswerToc, { once: true });
    } else {
        startAnswerToc();
    }
})();
