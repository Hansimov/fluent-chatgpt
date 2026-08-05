// ==UserScript==
// @name         ChatGPT 长对话性能优化、导航、搜索与归档
// @namespace    local.chatgpt
// @version      3.5.0
// @description  优化长对话渲染，提供导航、全文搜索、安全全量加载，并支持严格校验原始生成文件、图片、附件与 Artifacts 的离线归档
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
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

        // 网页来源 favicon、站点图标、头像等装饰性小图默认不打包。
        // 它们往往占附件候选的大多数，但对离线阅读价值很低；关闭可显著缩短获取阶段。
        conversationExportIncludeDecorativeIcons: false,

        // 优先读取当前对话的结构化数据，解析 image_asset_pointer、attachments、citations
        // 与 file_id，再通过 /backend-api/files/download/{file_id} 获取临时下载地址。
        conversationExportUseConversationApiAssets: true,

        // 原文件模式：只要存在 file_id，就优先解析 ChatGPT 保存的原始文件，
        // 不再把页面中的缩略图、预览图、预览 HTML 或渲染产物当作原文件。
        conversationExportRequireOriginalAssets: true,
        conversationExportAllowPreviewFallback: false,

        // 使用文件名、MIME、文件头和结构化元数据大小校验下载结果。
        // 原文件大小存在于消息元数据时，允许极小的传输头/容器差异。
        conversationExportValidateOriginalAssets: true,
        conversationExportOriginalSizeToleranceBytes: 16 * 1024,
        conversationExportOriginalSizeToleranceRatio: 0.015,
        conversationExportSignatureProbeBytes: 2 * 1024 * 1024,

        // 安全策略：全量加载、Markdown 导出准备和 ZIP 导出准备都只做“被动发现”，
        // 绝不自动点击文件卡、下载按钮、导出菜单或 Artifact 控件。
        // v3.1.0 的自动点击探测会触发 ChatGPT 自身的下载处理器，导致“加载全部”时连续下载文件。
        conversationArchivePassiveAssetDiscoveryOnly: true,
        conversationArchiveDownloadQuarantine: true,

        // 危险的交互式控件探测已默认彻底关闭。只有把 passive 设为 false、下面两个开关设为 true，
        // 并由代码显式传入 allowInteractiveProbe:true 时才可能运行；正常 UI 流程不会传入该参数。
        conversationExportProbeInteractiveControls: false,
        conversationExportEnableDangerousAutomaticControlActivation: false,
        conversationExportInteractiveProbeTimeoutMs: 1800,
        conversationExportInteractiveProbeSettleMs: 300,
        conversationExportMaxProbeControlsPerMessage: 16,
        conversationExportMaxNestedProbeControls: 8,

        // 尝试从 React 控件属性中补取 DOM 未公开的 file_id、artifact_id、文件名和临时地址。
        // 只扫描疑似文件/Artifact 控件附近的属性，并设置遍历上限。
        conversationExportProbeReactProperties: true,
        conversationExportMaxReactHintControlsPerMessage: 10,

        // 尝试从当前页面已打开或经卡片打开的 Canvas / Artifact 面板中提取 iframe、
        // srcdoc、源码编辑器内容、Canvas 位图与 SVG。关闭后仍保留结构化 API 和普通 DOM 解析。
        conversationExportCaptureArtifactPanels: true,
        conversationExportMaxArtifactSourceBytes: 16 * 1024 * 1024,

        // 附件任务采用较高但有上限的并发。桌面 4G/有线网络默认 10；
        // 节省流量、低内存或慢速网络会自动降到 2～6。允许范围 1～16。
        conversationExportAssetConcurrency: 10,

        // Artifact 端点按小批次并行解析，并限制候选路由数量与总探测预算。
        // 旧版会为每个 Artifact 轮询十余个猜测路由，这是实际环境中最主要的长尾之一。
        conversationExportArtifactResolveConcurrency: 4,
        conversationExportArtifactEndpointCandidateLimit: 6,
        conversationExportArtifactResolveBudgetMs: 9000,

        // file_id 只尝试优先级最高的少量端点；某条后端路由一旦被证实无效，
        // 会在当前页面会话中熔断，后续文件不再重复等待同一错误路由。
        conversationExportFileEndpointCandidateLimit: 5,
        conversationExportRouteFailureCooldownMs: 10 * 60 * 1000,
        conversationExportRouteTimeoutFailureThreshold: 2,

        // 连接/首字节、正文无进展和绝对上限分开控制。
        // 大文件只要持续有数据就不会像旧版那样在固定 30 秒后被中断并重新尝试。
        conversationExportAssetHeaderTimeoutMs: 3800,
        conversationExportAssetIdleTimeoutMs: 30000,
        conversationExportAssetHardTimeoutMs: 10 * 60 * 1000,
        conversationExportAssetTimeoutMs: 30000,

        // 跨域签名地址优先走 GM_xmlhttpRequest。GM 已返回 HTTP/超时错误时默认不再
        // 再走一次几乎必然失败的页面 fetch，避免每个失效链接产生双倍等待。
        conversationExportCrossOriginPreferGm: true,
        conversationExportCrossOriginFallbackAfterGmFailure: false,

        // 让 Tampermonkey 直接返回 Blob，避免大附件先复制成 ArrayBuffer、再复制进 Blob。
        // 现代 Chromium/Tampermonkey 支持该响应类型；关闭后回退到 arraybuffer。
        conversationExportGmPreferBlobResponse: true,

        // 具有不同临时签名参数、但路径相同的同一资源按稳定 URL 去重。
        conversationExportStableUrlDedupe: true,

        // 同一次页面会话内复用已成功获取的二进制资源；短期缓存失败结果，避免重复导出时
        // 对同一个失效地址再次等待完整超时。失败缓存到期后仍可重试。
        conversationExportAssetFailureCacheTtlMs: 60000,
        conversationExportProgressUpdateIntervalMs: 90,

        // 成功二进制只缓存中小型文件，避免一次大归档长期占用过多内存。
        // 正在进行的同一资源请求仍会始终合并，不会重复下载。
        conversationExportBinaryCacheMaxItemBytes: 64 * 1024 * 1024,
        conversationExportBinaryCacheMaxBytes: 256 * 1024 * 1024,

        // 单个附件和整个 ZIP 的软限制；超限文件会写入 manifest，但不会拖垮页面。
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
            this.fileDownloadMetadataCache = new Map();
            this.artifactResolutionCache = new Map();

            // ZIP 附件获取缓存。成功结果在当前对话页面内复用；失败只短期缓存，
            // 避免重复点击“全部 ZIP”时再次等待同一失效端点。
            this.assetBinaryCache = new Map();
            this.assetBinaryCacheBytes = 0;
            this.assetFailureCache = new Map();
            this.assetFetchMethodPreference = new Map();
            this.assetRouteStats = new Map();
            this.assetRouteProbePromises = new Map();
            this.assetProgressLastUiAt = 0;
            this.assetProgressActive = 0;
            this.assetProgressBytes = 0;
            this.assetProgressStartedAt = 0;
            this.assetFetchAttemptSequence = 0;

            this.interactiveProbeRunId = 0;
            this.downloadQuarantineSequence = 0;
            this.lastDownloadQuarantineStats = null;
            this.apiAccountId = '';
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
            this.fileDownloadMetadataCache.clear();
            this.artifactResolutionCache.clear();
            this.assetBinaryCache.clear();
            this.assetBinaryCacheBytes = 0;
            this.assetFailureCache.clear();
            this.assetFetchMethodPreference.clear();
            this.assetRouteStats.clear();
            this.assetRouteProbePromises.clear();
            this.assetProgressStartedAt = 0;
            this.assetFetchAttemptSequence = 0;
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
                    const accountId = String(
                        data?.account?.id || data?.active_account?.id || data?.activeAccount?.id ||
                        data?.user?.account_id || data?.user?.accountId || '',
                    );
                    if (token) this.sessionAccessToken = token;
                    if (accountId) this.apiAccountId = accountId;
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
            if (this.apiAccountId) headers['ChatGPT-Account-Id'] = this.apiAccountId;
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

        extractFileIdFromValue(value, keyHint = '') {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const decoded = (() => {
                try { return decodeURIComponent(raw); } catch { return raw; }
            })();
            const pointer = /^(?:file-service|sediment):\/\/(.+)$/i.exec(decoded)?.[1];
            if (pointer) {
                const clean = pointer.split(/[?#]/)[0];
                const explicit = /\b(file[-_][a-z0-9_-]{6,})\b/i.exec(clean)?.[1];
                return explicit || clean;
            }
            const endpointPatterns = [
                /\/backend-api\/files\/download\/([^/?#]+)/i,
                /\/backend-api\/files\/([^/?#]+)\/download/i,
                /\/backend-api\/file\/([^/?#]+)\/download/i,
                /\/backend-api\/files\/([^/?#]+)/i,
                /\/files\/([^/?#]+)\/download/i,
            ];
            for (const endpointPattern of endpointPatterns) {
                const match = endpointPattern.exec(decoded)?.[1];
                if (match) {
                    try { return decodeURIComponent(match); } catch { return match; }
                }
            }
            const explicit = /\b(file[-_][a-z0-9_-]{6,})\b/i.exec(decoded)?.[1];
            if (explicit) return explicit;
            const hinted = String(keyHint || '').toLowerCase();
            if (/(?:file|attachment|upload|asset)[_-]?(?:id|key|pointer)/i.test(hinted)) {
                const compact = /^([a-z0-9][a-z0-9_-]{7,})$/i.exec(decoded)?.[1];
                if (compact) return compact;
            }
            return '';
        }

        extractArtifactIdFromValue(value, keyHint = '') {
            const raw = String(value || '').trim();
            if (!raw) return '';
            const pointer = /^(?:artifact|canvas|canmore|textdoc|document):\/\/(.+)$/i.exec(raw)?.[1];
            if (pointer) {
                const clean = pointer.split(/[?#]/)[0];
                return /\b((?:artifact|canvas|canmore|textdoc|document)[-_][a-z0-9_-]{6,})\b/i.exec(clean)?.[1] || clean;
            }
            const endpoint = /\/(?:artifacts?|canvas|canmore|textdocs?|documents?)\/([^/?#]+)/i.exec(raw)?.[1];
            if (endpoint && !/^(?:download|export|open|preview|content|source|render|metadata|signed-url)$/i.test(endpoint)) {
                try { return decodeURIComponent(endpoint); } catch { return endpoint; }
            }
            const explicit = /\b((?:artifact|canvas|canmore|textdoc|document)[-_][a-z0-9_-]{6,})\b/i.exec(raw)?.[1];
            if (explicit) return explicit;
            if (/(?:artifact|canvas|canmore|textdoc|document)[_-]?(?:id|key)/i.test(String(keyHint || ''))) {
                return /^([a-z0-9][a-z0-9_-]{7,})$/i.exec(raw)?.[1] || '';
            }
            return '';
        }

        extractUrlLikeValues(value) {
            const raw = String(value || '');
            if (!raw) return [];
            const values = [];
            const patterns = [
                /https?:\/\/[^\s"'<>\])}]+/gi,
                /sandbox:\/mnt\/data\/[^\s"'<>\])}]+/gi,
                /(?:file-service|sediment):\/\/[^\s"'<>\])}]+/gi,
                /(?:artifact|canvas|canmore|textdoc|document):\/\/[^\s"'<>\])}]+/gi,
                /blob:https?:\/\/[^\s"'<>\])}]+/gi,
                /data:[a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[^,\s]+)?,[^\s"'<>]+/gi,
            ];
            for (const pattern of patterns) {
                for (const match of raw.matchAll(pattern)) {
                    const cleaned = String(match[0] || '').replace(/[.,;:!?]+$/g, '');
                    if (cleaned && !values.includes(cleaned)) values.push(cleaned);
                }
            }
            return values;
        }

        inferArtifactPayload(value, signal = '', fallbackName = 'artifact') {
            if (!value || typeof value !== 'object') return null;
            const combined = `${signal} ${value.type || ''} ${value.kind || ''} ${value.content_type || ''} ${value.format || ''} ${value.language || ''} ${value.mime_type || ''}`.toLowerCase();
            const strongSignal = /artifact|canvas|canmore|textdoc|writing[-_ ]?block|code[-_ ]?document|rendered[-_ ]?(?:html|react)|interactive[-_ ]?content/.test(combined);
            const contentCandidates = [
                ['html', value.html], ['source', value.source], ['code', value.code],
                ['text', value.text], ['body', value.body], ['markdown', value.markdown],
                ['content', typeof value.content === 'string' ? value.content : ''],
                ['document', typeof value.document === 'string' ? value.document : ''],
                ['result', typeof value.result === 'string' ? value.result : ''],
            ].filter((entry) => typeof entry[1] === 'string' && entry[1].trim());
            if (!contentCandidates.length) return null;
            const [field, rawContent] = contentCandidates[0];
            const content = String(rawContent || '');
            const looksHtml = /^\s*<!doctype\s+html|^\s*<html\b|<body\b|<svg\b/i.test(content);
            if (!strongSignal && !looksHtml) return null;
            const mimeHint = String(value.mime_type || value.media_type || value.content_type || '').toLowerCase();
            const language = String(value.language || value.lang || value.format || '').toLowerCase();
            let extension = 'txt';
            let mimeType = 'text/plain;charset=utf-8';
            if (looksHtml || mimeHint.includes('html') || /\bhtml\b/.test(language) || field === 'html') {
                extension = 'html'; mimeType = 'text/html;charset=utf-8';
            } else if (mimeHint.includes('markdown') || /markdown|\bmd\b/.test(language) || field === 'markdown') {
                extension = 'md'; mimeType = 'text/markdown;charset=utf-8';
            } else if (/tsx|typescriptreact/.test(language)) {
                extension = 'tsx'; mimeType = 'text/typescript;charset=utf-8';
            } else if (/jsx|react/.test(language)) {
                extension = 'jsx'; mimeType = 'text/jsx;charset=utf-8';
            } else if (/typescript|\bts\b/.test(language)) {
                extension = 'ts'; mimeType = 'text/typescript;charset=utf-8';
            } else if (/javascript|\bjs\b/.test(language)) {
                extension = 'js'; mimeType = 'text/javascript;charset=utf-8';
            } else if (/python|\bpy\b/.test(language)) {
                extension = 'py'; mimeType = 'text/x-python;charset=utf-8';
            } else if (/json/.test(language) || mimeHint.includes('json')) {
                extension = 'json'; mimeType = 'application/json;charset=utf-8';
            } else if (/css/.test(language) || mimeHint.includes('css')) {
                extension = 'css'; mimeType = 'text/css;charset=utf-8';
            } else if (/svg/.test(language) || mimeHint.includes('svg')) {
                extension = 'svg'; mimeType = 'image/svg+xml;charset=utf-8';
            }
            const rawName = value.file_name || value.filename || value.name || value.title || fallbackName;
            const safeName = this.sanitizeAssetFilename(rawName, fallbackName);
            const filename = /\.[a-z0-9]{1,10}$/i.test(safeName) ? safeName : `${safeName}.${extension}`;
            const maxBytes = Math.max(1024, Number(this.config.conversationExportMaxArtifactSourceBytes) || 0);
            const blob = new Blob([content], { type: mimeType });
            if (blob.size > maxBytes) return null;
            return { blob, filename, mimeType, kind: extension === 'html' ? 'artifact-html' : 'artifact-source', content };
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

        isLikelyDownloadableAssetReference({
            url = '', keySignal = '', mimeType = '', filename = '', fileId = '', artifactId = '',
            image = false, blob = null, kind = '',
        } = {}) {
            if (fileId || artifactId || blob instanceof Blob) return true;
            const normalized = this.normalizeAssetCandidateUrl(url);
            const signal = `${keySignal} ${kind} ${filename}`.toLowerCase();
            const mime = String(mimeType || '').toLowerCase();
            const name = String(filename || '').toLowerCase();
            if (!normalized) return false;
            if (/^(?:data|blob|sandbox|file-service|sediment|artifact|canvas|canmore|textdoc|document):/i.test(normalized)) return true;
            const iconSignal = /(?:favicon|site[_ -]?icon|brand[_ -]?icon|logo|thumbnail)/i.test(signal);
            const weakWebSignal = /(?:citation|content[_ -]?reference|search[_ -]?result|web[_ -]?(?:source|page))/i.test(signal) || iconSignal;
            const explicitAssetSignal = /(?:attachment|generated[_ -]?file|output[_ -]?file|file[_ -]?(?:id|name|url|path)|download|asset[_ -]?pointer|image[_ -]?asset|sandbox|artifact|canvas|canmore|textdoc)/i.test(signal);
            if (iconSignal && !/(?:attachment|generated[_ -]?image|image[_ -]?asset|asset[_ -]?pointer)/i.test(signal)) return false;
            if (mime && !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(mime)) return true;
            if (/artifact|canvas|html/.test(signal) && /html|xhtml/.test(mime)) return true;
            const extensionPattern = /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|tiff?|ico|pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf|txt|md|markdown|csv|tsv|json|ya?ml|xml|zip|7z|rar|tar|gz|bz2|xz|mp3|wav|m4a|aac|flac|ogg|mp4|m4v|mov|avi|mkv|webm|py|js|jsx|ts|tsx|css|html?|sql|ipynb)(?:$|[?#])/i;
            if (extensionPattern.test(name) || extensionPattern.test(normalized)) return true;
            if (/(?:\/download(?:[/?#]|$)|\/backend-api\/files?\/|\/attachments?\/|\/files\/download\/)/i.test(normalized)) return true;
            if (image && !weakWebSignal) return true;
            if (explicitAssetSignal && !weakWebSignal) return true;
            return false;
        }

        collectApiAssetsFromMessage(message, logicalIndex) {
            if (!message || logicalIndex < 0) return [];
            const role = String(message.author?.role || 'assistant');
            const messageSignal = [
                message.author?.name, message.recipient, message.content?.content_type,
                message.metadata?.tool_name, message.metadata?.tool, message.metadata?.name,
                message.metadata?.canvas_id, message.metadata?.artifact_id,
            ].filter(Boolean).join(' ');
            const artifactToolMessage = /(?:canmore|canvas|artifact|textdoc|writing[-_ ]?block|code[-_ ]?document|rendered[-_ ]?(?:html|react))/i.test(messageSignal);
            const parsedStringPayloads = [];
            const assets = [];
            const seen = new Map();
            let sequence = 0;
            const add = ({
                fileId = '', fileIds = [], originalFileId = '', artifactId = '', url = '', alternateUrls = [], originalUrls = [], previewUrls = [],
                filename = '', originalFilename = '', label = '', mimeType = '', originalMimeType = '', expectedSize = 0,
                kind = '', image = false, blob = null, sourcePath = '', signal = '', captureMethod = 'conversation-api',
            } = {}) => {
                const normalizedUrl = this.normalizeAssetCandidateUrl(url || sourcePath);
                const fileIdCandidates = [...new Set([
                    this.extractFileIdFromValue(originalFileId, 'original_file_id'),
                    ...(fileIds || []).map((value) => this.extractFileIdFromValue(value, 'file_id')),
                    this.extractFileIdFromValue(fileId, 'file_id'),
                    this.extractFileIdFromValue(normalizedUrl),
                ].filter(Boolean))];
                const resolvedFileId = fileIdCandidates[0] || '';
                const resolvedArtifactId = this.extractArtifactIdFromValue(artifactId, 'artifact_id') || this.extractArtifactIdFromValue(normalizedUrl);
                const inlineBlob = blob instanceof Blob ? blob : null;
                if (!resolvedFileId && !resolvedArtifactId && !normalizedUrl && !inlineBlob) return;
                if (!this.isLikelyDownloadableAssetReference({
                    url: normalizedUrl,
                    keySignal: signal || label,
                    mimeType,
                    filename: filename || label,
                    fileId: resolvedFileId,
                    fileIdCandidates,
                    originalFileId: this.extractFileIdFromValue(originalFileId, 'original_file_id') || '',
                    artifactId: resolvedArtifactId,
                    image,
                    blob: inlineBlob,
                    kind,
                })) return;
                const dedupe = resolvedFileId
                    ? `id:${resolvedFileId}`
                    : resolvedArtifactId
                        ? `artifact:${resolvedArtifactId}`
                        : normalizedUrl
                            ? `url:${normalizedUrl}`
                            : `blob:${filename}:${inlineBlob?.size || 0}:${kind}`;
                let inferredName = filename || label || (image ? 'image' : resolvedArtifactId ? 'artifact' : 'attachment');
                if (!filename && /^sandbox:/i.test(normalizedUrl)) {
                    try { inferredName = decodeURIComponent(normalizedUrl.split('/').pop() || inferredName); } catch { }
                }
                const finalKind = kind || this.getAssetKindFromHints({ mimeType, filename: inferredName, signal: label, image });
                if (seen.has(dedupe)) {
                    const existing = seen.get(dedupe);
                    if (!existing.sourceUrl && normalizedUrl) existing.sourceUrl = normalizedUrl;
                    existing.alternateUrls = [...new Set([
                        ...(existing.alternateUrls || []),
                        ...(alternateUrls || []).map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean),
                        normalizedUrl && normalizedUrl !== existing.sourceUrl ? normalizedUrl : '',
                    ].filter(Boolean))];
                    existing.originalUrls = [...new Set([
                        ...(existing.originalUrls || []),
                        ...(originalUrls || []).map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean),
                    ])];
                    existing.previewUrls = [...new Set([
                        ...(existing.previewUrls || []),
                        ...(previewUrls || []).map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean),
                    ])];
                    existing.fileIdCandidates = [...new Set([...(existing.fileIdCandidates || []), ...fileIdCandidates].filter(Boolean))];
                    if (!existing.originalFileId && originalFileId) existing.originalFileId = this.extractFileIdFromValue(originalFileId, 'original_file_id') || '';
                    if (!existing.originalFilename && originalFilename) existing.originalFilename = this.sanitizeAssetFilename(originalFilename, existing.filenameHint || 'asset');
                    if (!existing.originalMimeType && originalMimeType) existing.originalMimeType = String(originalMimeType);
                    if (!existing.expectedSize && Number(expectedSize) > 0) existing.expectedSize = Number(expectedSize);
                    if (inlineBlob && (!existing.blob || inlineBlob.size > (existing.blob.size || 0))) {
                        existing.blob = inlineBlob;
                        existing.byteLength = inlineBlob.size;
                    }
                    if (mimeType || inlineBlob?.type) existing.mimeType = String(mimeType || inlineBlob.type);
                    if (filename && (!existing.filenameHint || !/\.[a-z0-9]{1,10}$/i.test(existing.filenameHint) ||
                        existing.filenameHint === 'Artifact' || existing.filenameHint === 'attachment')) {
                        existing.filenameHint = this.sanitizeAssetFilename(filename, existing.filenameHint || 'asset');
                    }
                    if (label && (!existing.label || existing.label === '附件' || existing.label === 'Artifact')) existing.label = String(label).trim();
                    if (kind && (existing.kind === 'file' || existing.kind === 'artifact' || !existing.kind)) existing.kind = finalKind;
                    if (captureMethod && /inline|tool|interactive/i.test(captureMethod)) existing.captureMethod = captureMethod;
                    return;
                }
                sequence += 1;
                const safeIdPart = String(resolvedFileId || resolvedArtifactId || sequence).replace(/[^a-z0-9_.-]+/gi, '-').slice(0, 64);
                const asset = {
                    id: `q${String(logicalIndex + 1).padStart(3, '0')}-${role}-api-${safeIdPart || sequence}`,
                    logicalIndex,
                    role,
                    kind: finalKind,
                    label: String(label || inferredName || '附件').trim() || '附件',
                    sourceUrl: normalizedUrl,
                    alternateUrls: [...new Set((alternateUrls || []).map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean))],
                    originalUrls: [...new Set((originalUrls || []).map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean))],
                    previewUrls: [...new Set((previewUrls || []).map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean))],
                    fileId: resolvedFileId,
                    artifactId: resolvedArtifactId,
                    filenameHint: this.sanitizeAssetFilename(inferredName || `asset-${sequence}`, `asset-${sequence}`),
                    originalFilename: originalFilename ? this.sanitizeAssetFilename(originalFilename, inferredName || `asset-${sequence}`) : '',
                    mimeType: String(mimeType || inlineBlob?.type || ''),
                    originalMimeType: String(originalMimeType || ''),
                    expectedSize: Number(expectedSize) > 0 ? Number(expectedSize) : 0,
                    byteLength: inlineBlob?.size || 0,
                    blob: inlineBlob,
                    apiDerived: true,
                    captureMethod,
                    capturedAt: new Date().toISOString(),
                };
                seen.set(dedupe, asset);
                assets.push(asset);
            };

            const addStringReferences = (rawValue, keyHint = '', context = {}) => {
                const raw = String(rawValue || '').trim();
                if (!raw) return;
                const fileId = this.extractFileIdFromValue(raw, keyHint);
                const artifactId = this.extractArtifactIdFromValue(raw, keyHint);
                const urls = this.extractUrlLikeValues(raw);
                const keySignal = String(keyHint || '').toLowerCase();
                if (fileId || artifactId) {
                    add({
                        fileId,
                        originalFileId: /(?:original|source|upload)[_-]?file[_-]?id/i.test(keySignal) ? fileId : '',
                        fileIds: [fileId],
                        artifactId,
                        url: urls[0] || '',
                        alternateUrls: urls.slice(1),
                        filename: context.filename || '',
                        label: context.label || context.filename || (artifactId ? 'Artifact' : '附件'),
                        mimeType: context.mimeType || '',
                        kind: artifactId ? 'artifact' : '',
                    });
                }
                if (urls.length) {
                    for (const foundUrl of urls) {
                        if (!this.isLikelyDownloadableAssetReference({
                            url: foundUrl,
                            keySignal,
                            mimeType: context.mimeType || '',
                            filename: context.filename || '',
                            image: /image/i.test(keySignal),
                            kind: /artifact|canvas/i.test(keySignal) ? 'artifact' : '',
                        })) continue;
                        add({
                            url: foundUrl,
                            filename: context.filename || '',
                            label: context.label || context.filename || (/artifact|canvas/i.test(keySignal) ? 'Artifact' : '附件'),
                            mimeType: context.mimeType || '',
                            kind: /artifact|canvas/i.test(keySignal) ? 'artifact' : '',
                            image: /image/i.test(keySignal),
                            signal: keySignal,
                        });
                    }
                }
            };

            const parts = Array.isArray(message.content?.parts) ? message.content.parts : [];
            for (const part of parts) {
                if (typeof part === 'string') {
                    const trimmed = part.trim();
                    let parsedStructuredPayload = false;
                    if (trimmed && trimmed.length <= Math.max(1024, Number(this.config.conversationExportMaxArtifactSourceBytes) || 0)) {
                        if (/^[{[]/.test(trimmed)) {
                            try {
                                const parsed = JSON.parse(trimmed);
                                if (parsed && typeof parsed === 'object') {
                                    parsedStringPayloads.push(parsed);
                                    parsedStructuredPayload = true;
                                }
                            } catch { }
                        }
                        if (artifactToolMessage && !parsedStructuredPayload && !this.extractUrlLikeValues(trimmed).length) {
                            const payload = this.inferArtifactPayload({
                                content: part,
                                type: messageSignal || 'artifact',
                                language: message.metadata?.language || message.metadata?.format || '',
                                title: message.metadata?.title || message.metadata?.name || `artifact-${sequence + 1}`,
                            }, `artifact tool ${messageSignal}`, `artifact-${sequence + 1}`);
                            if (payload) {
                                add({
                                    artifactId: message.metadata?.artifact_id || message.metadata?.canvas_id || message.metadata?.textdoc_id || '',
                                    filename: payload.filename,
                                    label: message.metadata?.title || message.metadata?.name || payload.filename,
                                    mimeType: payload.mimeType,
                                    kind: payload.kind,
                                    blob: payload.blob,
                                    captureMethod: 'conversation-api-tool-artifact',
                                });
                            }
                        }
                    }
                    if (!parsedStructuredPayload) addStringReferences(part, `content.parts ${messageSignal}`);
                    continue;
                }

                if (!part || typeof part !== 'object') continue;
                const partSignal = `content.parts ${part.content_type || ''} ${part.type || ''} ${part.kind || ''}`;
                if (part.content_type === 'image_asset_pointer' && part.asset_pointer) {
                    add({
                        fileId: this.extractFileIdFromValue(part.asset_pointer, 'asset_pointer'),
                        fileIds: [part.original_file_id, part.source_file_id, part.upload_id, part.file_id, part.asset_pointer].filter(Boolean),
                        originalFileId: part.original_file_id || part.source_file_id || part.upload_id || '',
                        url: part.download_url || part.downloadUrl || part.original_url || part.originalUrl || part.asset_pointer || '',
                        originalUrls: [part.download_url, part.downloadUrl, part.original_url, part.originalUrl, part.file_url, part.fileUrl].filter(Boolean),
                        previewUrls: [part.preview_url, part.previewUrl, part.thumbnail_url, part.thumbnailUrl, part.url, part.src].filter(Boolean),
                        filename: part.metadata?.file_name || part.metadata?.name || (part.metadata?.dalle ? 'generated-image.png' : 'image.png'),
                        originalFilename: part.metadata?.file_name || part.metadata?.filename || part.metadata?.name || '',
                        label: part.metadata?.dalle?.prompt || part.metadata?.name || '图片',
                        mimeType: part.metadata?.mime_type || 'image/png',
                        originalMimeType: part.metadata?.mime_type || '',
                        expectedSize: Number(part.metadata?.size || part.metadata?.byte_size || part.metadata?.bytes || 0) || 0,
                        image: true,
                    });
                }
                const directPayload = this.inferArtifactPayload(part, partSignal, `artifact-${sequence + 1}`);
                if (directPayload) {
                    add({
                        artifactId: part.artifact_id || part.canvas_id || part.textdoc_id || '',
                        filename: directPayload.filename,
                        label: part.title || part.name || directPayload.filename,
                        mimeType: directPayload.mimeType,
                        kind: directPayload.kind,
                        blob: directPayload.blob,
                        captureMethod: 'conversation-api-inline-artifact',
                    });
                }
                const consumedPartKeys = /^(?:file_id|fileId|original_file_id|originalFileId|source_file_id|sourceFileId|upload_id|uploadId|asset_pointer|download_url|downloadUrl|signed_url|signedUrl|original_url|originalUrl|file_url|fileUrl|content_url|contentUrl|preview_url|previewUrl|thumbnail_url|thumbnailUrl|sandbox_path|path|url|href|src|file_name|filename|name|title|mime_type|media_type|content_type|size|byte_size|bytes|content_length)$/;
                for (const [key, value] of Object.entries(part)) {
                    if (typeof value === 'string' && !consumedPartKeys.test(key)) addStringReferences(value, `content.parts.${key}`, {
                        filename: part.file_name || part.filename || part.name || '',
                        label: part.title || part.name || '',
                        mimeType: part.mime_type || part.media_type || '',
                    });
                }
            }

            const explicitCollections = [
                ['attachments', message.metadata?.attachments],
                ['files', message.metadata?.files],
                ['generated_files', message.metadata?.generated_files],
                ['citations', message.metadata?.citations],
                ['content_references', message.metadata?.content_references],
                ['assets', message.metadata?.assets],
                ['artifacts', message.metadata?.artifacts],
            ];
            for (const [collectionName, collection] of explicitCollections) {
                for (const item of Array.isArray(collection) ? collection : []) {
                    if (!item || typeof item !== 'object') continue;
                    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
                    const signal = `${collectionName} ${item.type || ''} ${item.kind || ''} ${item.content_type || ''}`;
                    const payload = this.inferArtifactPayload(item, signal, `${collectionName}-${sequence + 1}`) ||
                        this.inferArtifactPayload(metadata, signal, `${collectionName}-${sequence + 1}`);
                    const genericFileId = /^(?:attachments|files|generated_files|assets)$/.test(collectionName) ? item.id : '';
                    const genericArtifactId = collectionName === 'artifacts' ? item.id : '';
                    add({
                        fileId: item.original_file_id || item.originalFileId || item.source_file_id || item.sourceFileId || item.upload_id ||
                            item.file_id || item.fileId || metadata.original_file_id || metadata.source_file_id || metadata.upload_id || metadata.file_id || metadata.fileId || genericFileId || '',
                        fileIds: [item.original_file_id, item.originalFileId, item.source_file_id, item.sourceFileId, item.upload_id, item.uploadId,
                        item.file_id, item.fileId, item.asset_pointer, metadata.original_file_id, metadata.source_file_id, metadata.upload_id,
                        metadata.file_id, metadata.fileId, metadata.asset_pointer, genericFileId].filter(Boolean),
                        originalFileId: item.original_file_id || item.originalFileId || item.source_file_id || item.sourceFileId || item.upload_id || item.uploadId ||
                            metadata.original_file_id || metadata.source_file_id || metadata.upload_id || '',
                        artifactId: item.artifact_id || item.artifactId || item.canvas_id || item.canvasId || item.textdoc_id || metadata.artifact_id || metadata.canvas_id || genericArtifactId || '',
                        url: item.download_url || item.downloadUrl || item.signed_url || item.signedUrl || item.original_url || item.originalUrl ||
                            item.file_url || item.fileUrl || item.content_url || metadata.download_url || metadata.downloadUrl || metadata.original_url || metadata.file_url ||
                            item.url || item.href || item.src || metadata.url || '',
                        alternateUrls: [item.asset_pointer, item.sandbox_path, item.path, metadata.asset_pointer, metadata.sandbox_path].filter(Boolean),
                        originalUrls: [item.download_url, item.downloadUrl, item.signed_url, item.signedUrl, item.original_url, item.originalUrl,
                        item.file_url, item.fileUrl, metadata.download_url, metadata.downloadUrl, metadata.signed_url, metadata.original_url, metadata.file_url].filter(Boolean),
                        previewUrls: [item.preview_url, item.previewUrl, item.thumbnail_url, item.thumbnailUrl, item.url, item.href, item.src,
                        metadata.preview_url, metadata.thumbnail_url, metadata.url].filter(Boolean),
                        filename: item.name || item.file_name || item.filename || item.title || metadata.title || metadata.file_name || '',
                        originalFilename: item.file_name || item.filename || item.name || metadata.file_name || metadata.filename || '',
                        label: item.title || item.name || item.file_name || metadata.title || '附件',
                        mimeType: item.mime_type || item.content_type || item.media_type || metadata.mime_type || metadata.content_type || payload?.mimeType || '',
                        originalMimeType: item.mime_type || item.media_type || metadata.mime_type || metadata.media_type || '',
                        expectedSize: Number(item.size || item.byte_size || item.bytes || item.content_length || metadata.size || metadata.byte_size || metadata.bytes || 0) || 0,
                        kind: payload?.kind || (/artifact|canvas/i.test(signal) ? 'artifact' : ''),
                        blob: payload?.blob || null,
                        image: /image/i.test(signal) || String(item.mime_type || '').startsWith('image/'),
                        signal,
                        captureMethod: payload ? 'conversation-api-inline-artifact' : 'conversation-api',
                    });
                }
            }

            let visitedCount = 0;
            const visited = new WeakSet();
            const walk = (value, keyPath = '', depth = 0) => {
                if (value == null || depth > 11 || visitedCount > 5200) return;
                if (typeof value === 'string') {
                    addStringReferences(value, keyPath);
                    return;
                }
                if (typeof value !== 'object') return;
                if (visited.has(value)) return;
                visited.add(value);
                visitedCount += 1;
                if (Array.isArray(value)) {
                    for (const item of value) walk(item, keyPath, depth + 1);
                    return;
                }
                const signal = `${keyPath} ${value.content_type || ''} ${value.type || ''} ${value.kind || ''} ${value.format || ''}`;
                const filename = value.file_name || value.filename || value.name || value.title || '';
                const mimeType = value.mime_type || value.media_type || (typeof value.content_type === 'string' && value.content_type.includes('/') ? value.content_type : '') || '';
                const originalFileId = value.original_file_id || value.originalFileId || value.source_file_id || value.sourceFileId || value.upload_id || value.uploadId || '';
                const fileIds = [originalFileId, value.file_id, value.fileId, value.asset_pointer,
                    (/(?:attachment|file|asset|image|generated[_ -]?file)/i.test(signal) && !/(?:citation|content[_ -]?reference|search[_ -]?result)/i.test(signal) ? value.id : '')].filter(Boolean);
                const fileId = fileIds[0] || '';
                const artifactId = value.artifact_id || value.artifactId || value.canvas_id || value.canvasId ||
                    value.canmore_id || value.textdoc_id || value.document_id ||
                    (/(?:artifact|canvas|canmore|textdoc|writing[_ -]?block)/i.test(signal) ? value.id : '') || '';
                const originalUrls = [value.download_url, value.downloadUrl, value.signed_url, value.signedUrl,
                value.original_url, value.originalUrl, value.file_url, value.fileUrl].filter(Boolean);
                const previewUrls = [value.preview_url, value.previewUrl, value.thumbnail_url, value.thumbnailUrl,
                value.preview, value.thumbnail, value.src, value.url, value.href].filter((item) => typeof item === 'string');
                const url = originalUrls[0] || value.content_url || value.contentUrl || value.url || value.href || value.src || value.sandbox_path || value.path || '';
                const payload = this.inferArtifactPayload(value, signal, filename || `artifact-${sequence + 1}`);
                if (fileId || artifactId || url || payload) {
                    add({
                        fileId,
                        fileIds,
                        originalFileId,
                        artifactId,
                        url,
                        alternateUrls: [value.asset_pointer, value.sandbox_path, value.path].filter(Boolean),
                        originalUrls,
                        previewUrls,
                        filename: filename || payload?.filename || (/image/i.test(signal) ? 'image.png' : artifactId ? 'artifact' : 'attachment'),
                        originalFilename: value.file_name || value.filename || value.name || '',
                        label: value.title || value.name || filename || (artifactId ? 'Artifact' : /image/i.test(signal) ? '图片' : '附件'),
                        mimeType: mimeType || payload?.mimeType || '',
                        originalMimeType: value.mime_type || value.media_type || '',
                        expectedSize: Number(value.size || value.byte_size || value.bytes || value.content_length || 0) || 0,
                        kind: payload?.kind || (/artifact|canvas|canmore|textdoc/i.test(signal) ? 'artifact' : ''),
                        blob: payload?.blob || null,
                        image: /image/i.test(signal) || String(mimeType).startsWith('image/'),
                        signal,
                        captureMethod: payload ? 'conversation-api-inline-artifact' : 'conversation-api-recursive',
                    });
                }
                const consumedAssetKeys = /^(?:file_id|fileId|original_file_id|originalFileId|source_file_id|sourceFileId|upload_id|uploadId|asset_pointer|artifact_id|artifactId|canvas_id|canvasId|canmore_id|textdoc_id|document_id|download_url|downloadUrl|signed_download_url|signedDownloadUrl|signed_url|signedUrl|original_url|originalUrl|file_url|fileUrl|content_url|contentUrl|preview_url|previewUrl|thumbnail_url|thumbnailUrl|sandbox_path|path|url|href|src|file_name|filename|original_filename|originalFilename|name|title|mime_type|mimeType|media_type|content_type|size|byte_size|bytes|content_length|contentLength)$/;
                for (const [key, child] of Object.entries(value)) {
                    if (typeof child === 'string') {
                        if (!consumedAssetKeys.test(key)) {
                            addStringReferences(child, `${keyPath}.${key}`, { filename, label: value.title || value.name || '', mimeType });
                        }
                    } else {
                        walk(child, `${keyPath}.${key}`, depth + 1);
                    }
                }
            };
            walk(message.content || {}, `content ${messageSignal}`, 0);
            walk(message.metadata || {}, `metadata ${messageSignal}`, 0);
            for (const parsed of parsedStringPayloads) walk(parsed, `parsed-tool-payload ${messageSignal}`, 0);

            const mergedAssets = [];
            for (const asset of assets) {
                const same = mergedAssets.find((existing) =>
                    (asset.fileId && existing.fileId === asset.fileId) ||
                    (asset.artifactId && existing.artifactId === asset.artifactId) ||
                    (asset.sourceUrl && existing.sourceUrl === asset.sourceUrl) ||
                    (asset.filenameHint && existing.filenameHint === asset.filenameHint &&
                        (/^sandbox:/i.test(asset.sourceUrl || '') || /^sandbox:/i.test(existing.sourceUrl || '')) &&
                        (asset.fileId || existing.fileId))
                );
                if (!same) {
                    mergedAssets.push(asset);
                    continue;
                }
                this.mergeArchiveAsset(same, asset);
                if (!same.kind || same.kind === 'file') same.kind = asset.kind || same.kind;
                if (!same.blob && asset.blob) same.blob = asset.blob;
            }
            return mergedAssets;
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
            existing.fileIdCandidates = [...new Set([...(existing.fileIdCandidates || []), ...(incoming.fileIdCandidates || []), incoming.fileId || ''].filter(Boolean))];
            if (!existing.originalFileId && incoming.originalFileId) existing.originalFileId = incoming.originalFileId;
            if (!existing.artifactId && incoming.artifactId) existing.artifactId = incoming.artifactId;
            if (!existing.sourceUrl && incoming.sourceUrl) existing.sourceUrl = incoming.sourceUrl;
            if (!(existing.blob instanceof Blob) && incoming.blob instanceof Blob) {
                existing.blob = incoming.blob;
                existing.byteLength = incoming.blob.size;
            }
            existing.alternateUrls = [...new Set([
                ...(existing.alternateUrls || []),
                ...(incoming.alternateUrls || []),
                incoming.sourceUrl || '',
            ].filter(Boolean))];
            existing.originalUrls = [...new Set([...(existing.originalUrls || []), ...(incoming.originalUrls || [])].filter(Boolean))];
            existing.previewUrls = [...new Set([...(existing.previewUrls || []), ...(incoming.previewUrls || [])].filter(Boolean))];
            if (!existing.filenameHint && incoming.filenameHint) existing.filenameHint = incoming.filenameHint;
            if (!existing.originalFilename && incoming.originalFilename) existing.originalFilename = incoming.originalFilename;
            if (!existing.mimeType && incoming.mimeType) existing.mimeType = incoming.mimeType;
            if (!existing.originalMimeType && incoming.originalMimeType) existing.originalMimeType = incoming.originalMimeType;
            if (!existing.expectedSize && Number(incoming.expectedSize) > 0) existing.expectedSize = Number(incoming.expectedSize);
            if ((!existing.label || existing.label === '附件') && incoming.label) existing.label = incoming.label;
            existing.apiDerived = existing.apiDerived || incoming.apiDerived;
            existing.captureMethod = existing.captureMethod || incoming.captureMethod || '';
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

        getFileEndpointCandidates(fileId, sourceUrl = '') {
            const id = String(fileId || '').trim();
            if (!id) return [];
            const encoded = encodeURIComponent(id);
            const conversationId = this.getCurrentConversationId();
            const paths = [
                `/backend-api/files/download/${encoded}`,
                `/backend-api/files/${encoded}/download`,
                `/backend-api/files/${encoded}/content`,
                `/backend-api/files/${encoded}/signed-url`,
                `/backend-api/files/${encoded}/download-url`,
                `/backend-api/files/${encoded}`,
                `/backend-api/file/${encoded}/download`,
                `/backend-api/files/${encoded}/metadata`,
            ];
            if (conversationId) {
                const conversation = encodeURIComponent(conversationId);
                paths.push(`/backend-api/conversation/${conversation}/files/${encoded}/download`);
                paths.push(`/backend-api/conversation/${conversation}/files/${encoded}`);
                paths.push(`/backend-api/conversation/${conversation}/attachments/${encoded}`);
            }
            if (/^sandbox:/i.test(String(sourceUrl || ''))) {
                const path = String(sourceUrl).replace(/^sandbox:/i, '');
                for (const endpoint of [
                    `/backend-api/files/download/${encoded}`,
                    `/backend-api/files/${encoded}/download`,
                    `/backend-api/files/${encoded}`,
                ]) {
                    paths.push(`${endpoint}?path=${encodeURIComponent(path)}`);
                    paths.push(`${endpoint}?sandbox_path=${encodeURIComponent(path)}`);
                }
            }
            const urls = [...new Set(paths.map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean))];
            const limit = Math.max(1, Math.min(12, Number(this.config.conversationExportFileEndpointCandidateLimit) || 5));
            const preferredSet = urls.slice(0, limit);
            const active = preferredSet.filter((url) => !this.isAssetRouteSuppressed(url));
            active.sort((a, b) => this.getAssetRoutePriority(a) - this.getAssetRoutePriority(b));
            return active;
        }

        extractDownloadMetadataFromJson(data) {
            if (!data || typeof data !== 'object') return null;
            const visited = new WeakSet();
            const candidates = [];
            const filenameKeys = ['file_name', 'filename', 'original_filename', 'originalFilename', 'name', 'title'];
            const mimeKeys = ['mime_type', 'mimeType', 'media_type', 'content_type'];
            const sizeKeys = ['size', 'bytes', 'byte_size', 'content_length', 'contentLength'];
            const keyScores = new Map([
                ['download_url', 120], ['downloadUrl', 120], ['signed_download_url', 118], ['signedDownloadUrl', 118],
                ['signed_url', 115], ['signedUrl', 115], ['original_url', 112], ['originalUrl', 112],
                ['file_url', 105], ['fileUrl', 105], ['content_url', 90], ['contentUrl', 90],
                ['location', 80], ['url', 40], ['href', 35],
                ['preview_url', -100], ['previewUrl', -100], ['thumbnail_url', -120], ['thumbnailUrl', -120],
            ]);
            const walk = (value, depth = 0, inherited = {}) => {
                if (!value || typeof value !== 'object' || depth > 10 || visited.has(value)) return;
                visited.add(value);
                if (Array.isArray(value)) {
                    for (const item of value) walk(item, depth + 1, inherited);
                    return;
                }
                const local = { ...inherited };
                for (const key of filenameKeys) if (!local.filename && typeof value[key] === 'string') local.filename = value[key];
                for (const key of mimeKeys) if (!local.mimeType && typeof value[key] === 'string') local.mimeType = value[key];
                for (const key of sizeKeys) if (!local.size && Number(value[key]) > 0) local.size = Number(value[key]);
                for (const [key, score] of keyScores) {
                    const raw = value[key];
                    if (typeof raw !== 'string') continue;
                    const url = this.normalizeAssetCandidateUrl(raw);
                    if (!url || !/^(?:https?:|blob:|data:|\/)/i.test(url)) continue;
                    candidates.push({
                        downloadUrl: url,
                        filename: local.filename || '',
                        mimeType: local.mimeType || '',
                        size: local.size || 0,
                        score: score - depth,
                        preview: score < 0 || this.isPreviewAssetUrl(url),
                    });
                }
                for (const child of Object.values(value)) walk(child, depth + 1, local);
            };
            walk(data, 0, {});
            candidates.sort((a, b) => b.score - a.score);
            return candidates.find((item) => !item.preview) || candidates[0] || null;
        }

        async resolveFileDownloadMetadata(fileId, signal) {
            const id = String(fileId || '').trim();
            if (!id) return null;
            if (this.fileDownloadMetadataCache.has(id)) return this.fileDownloadMetadataCache.get(id);
            const task = (async () => {
                const errors = [];
                for (const endpoint of this.getFileEndpointCandidates(id)) {
                    try {
                        const token = await this.getSessionAccessToken(signal);
                        const headers = {
                            Accept: 'application/json, application/octet-stream;q=0.8, */*;q=0.5',
                            'Oai-Device-Id': this.getApiDeviceId(),
                            'Oai-Language': navigator.language || 'zh-CN',
                        };
                        if (token) headers.Authorization = `Bearer ${token}`;
                        if (this.apiAccountId) headers['ChatGPT-Account-Id'] = this.apiAccountId;
                        const response = await fetch(endpoint, {
                            method: 'GET', credentials: 'include', redirect: 'follow', cache: 'no-store', signal, headers,
                        });
                        if (!response.ok) {
                            errors.push(`${new URL(endpoint, location.href).pathname}: HTTP ${response.status}`);
                            continue;
                        }
                        const contentType = response.headers.get('content-type') || '';
                        const disposition = response.headers.get('content-disposition') || '';
                        if (/json/i.test(contentType)) {
                            const data = await response.json();
                            const metadata = this.extractDownloadMetadataFromJson(data);
                            if (metadata?.downloadUrl) return metadata;
                            errors.push(`${new URL(endpoint, location.href).pathname}: JSON 中没有下载地址`);
                            continue;
                        }
                        const blob = await response.blob();
                        if (blob.size) {
                            return {
                                downloadUrl: response.url || endpoint,
                                filename: this.parseContentDispositionFilename(disposition),
                                mimeType: contentType || blob.type || '',
                                size: blob.size,
                                blob,
                                contentDisposition: disposition,
                            };
                        }
                    } catch (error) {
                        if (error?.name === 'AbortError') throw error;
                        errors.push(error?.message || String(error));
                    }
                }
                throw new Error(errors.join('；') || `无法解析文件 ${id}`);
            })();
            this.fileDownloadMetadataCache.set(id, task);
            try {
                const value = await task;
                this.fileDownloadMetadataCache.set(id, value);
                return value;
            } catch (error) {
                this.fileDownloadMetadataCache.delete(id);
                throw error;
            }
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
                'application/pdf': 'pdf', 'application/zip': 'zip', 'application/gzip': 'gz',
                'application/x-7z-compressed': '7z', 'application/vnd.rar': 'rar',
                'application/msword': 'doc', 'application/vnd.ms-excel': 'xls', 'application/vnd.ms-powerpoint': 'ppt',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
                'application/vnd.oasis.opendocument.text': 'odt',
                'application/vnd.oasis.opendocument.spreadsheet': 'ods',
                'application/vnd.oasis.opendocument.presentation': 'odp',
                'application/json': 'json', 'text/plain': 'txt', 'text/markdown': 'md',
                'text/html': 'html', 'text/csv': 'csv', 'text/tab-separated-values': 'tsv', 'application/xml': 'xml',
                'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/flac': 'flac',
                'video/mp4': 'mp4', 'video/webm': 'webm',
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

        getPageRealmWindow() {
            try {
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow;
            } catch { }
            return window;
        }

        isBlobLike(value) {
            if (!value || typeof value !== 'object') return false;
            try { if (value instanceof Blob) return true; } catch { }
            const tag = Object.prototype.toString.call(value);
            return tag === '[object Blob]' || (
                typeof value.size === 'number' && value.size >= 0 &&
                typeof value.type === 'string' && typeof value.arrayBuffer === 'function'
            );
        }

        async normalizeBlobLike(value, fallbackType = '') {
            if (!this.isBlobLike(value)) return null;
            try { if (value instanceof Blob) return value; } catch { }
            try {
                const buffer = await value.arrayBuffer();
                return new Blob([buffer], { type: value.type || fallbackType || 'application/octet-stream' });
            } catch {
                return null;
            }
        }

        isElementActuallyVisible(element) {
            if (!(element instanceof Element) || !element.isConnected) return false;
            try {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return rect.width > 1 && rect.height > 1 && style.display !== 'none' &&
                    style.visibility !== 'hidden' && Number.parseFloat(style.opacity || '1') > 0.01 &&
                    !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true';
            } catch {
                return false;
            }
        }

        getArtifactNodeState(element) {
            if (!(element instanceof Element)) return '';
            try {
                const rect = element.getBoundingClientRect();
                const visible = this.isElementActuallyVisible(element) ? 1 : 0;
                const iframeState = element instanceof HTMLIFrameElement
                    ? `${element.getAttribute('src') || ''}|${String(element.srcdoc || '').length}`
                    : [...(element.querySelectorAll?.('iframe') || [])]
                        .slice(0, 4)
                        .map((iframe) => `${iframe.getAttribute('src') || ''}|${String(iframe.srcdoc || '').length}`)
                        .join('||');
                const signal = `${element.getAttribute('data-testid') || ''}|${element.getAttribute('role') || ''}|${element.textContent?.trim().slice(0, 300) || ''}`;
                return `${visible}|${Math.round(rect.width)}x${Math.round(rect.height)}|${element.childElementCount}|${iframeState}|${signal}`;
            } catch {
                return '';
            }
        }

        captureArtifactNodeBaseline() {
            const selector = [
                'iframe', '[role="dialog"]', '[data-testid*="artifact" i]', '[data-testid*="canvas" i]',
                '[data-testid*="preview" i]', '[class*="artifact" i]', '[class*="canvas" i]',
            ].join(',');
            return new Map(this.queryAllDeep(selector).map((node) => [node, this.getArtifactNodeState(node)]));
        }

        getReactInternalPayloads(element) {
            if (this.config.conversationExportProbeReactProperties === false || !(element instanceof Element)) return [];
            const payloads = [];
            const seen = new Set();
            let node = element;
            for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
                let keys = [];
                try { keys = Reflect.ownKeys(node); } catch { }
                for (const key of keys) {
                    if (typeof key !== 'string') continue;
                    let value;
                    try { value = node[key]; } catch { continue; }
                    if (key.startsWith('__reactProps$')) {
                        if (value && typeof value === 'object' && !seen.has(value)) { seen.add(value); payloads.push(value); }
                    } else if (key.startsWith('__reactFiber$')) {
                        let fiber = value;
                        for (let up = 0; fiber && up < 4; up += 1, fiber = fiber.return) {
                            for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
                                if (props && typeof props === 'object' && !seen.has(props)) { seen.add(props); payloads.push(props); }
                            }
                        }
                    }
                }
            }
            return payloads.slice(0, 16);
        }

        collectReactInternalAssetCandidates(element, logicalIndex, role) {
            const payloads = this.getReactInternalPayloads(element);
            if (!payloads.length) return [];
            const syntheticMessage = {
                author: { role, name: 'react-ui' },
                content: { content_type: 'react_asset_hints', parts: [] },
                metadata: { react_asset_hints: payloads },
            };
            return this.collectApiAssetsFromMessage(syntheticMessage, logicalIndex).map((asset) => ({
                kind: asset.kind,
                url: asset.sourceUrl || '',
                alternateUrls: asset.alternateUrls || [],
                fileId: asset.fileId || '',
                artifactId: asset.artifactId || '',
                label: asset.label || asset.filenameHint || '附件',
                filenameHint: asset.filenameHint || '',
                mimeType: asset.mimeType || '',
                inlineBlob: asset.blob || null,
                captureMethod: 'react-control-properties',
                probeOnly: true,
            }));
        }

        queryAllDeep(selector, root = document, results = []) {
            try {
                for (const element of root.querySelectorAll(selector)) {
                    if (!results.includes(element)) results.push(element);
                }
                for (const element of root.querySelectorAll('*')) {
                    if (element.shadowRoot) this.queryAllDeep(selector, element.shadowRoot, results);
                }
            } catch { }
            return results;
        }

        getInteractiveControlSignal(element) {
            if (!(element instanceof Element)) return '';
            const localSelector = [
                '[data-testid*="file" i]', '[data-testid*="attachment" i]', '[data-testid*="download" i]',
                '[data-testid*="artifact" i]', '[data-testid*="canvas" i]',
                '[class*="file-card" i]', '[class*="attachment" i]', '[class*="artifact" i]', '[class*="canvas" i]',
                '[role="menuitem"]', '[role="group"]', 'li',
            ].join(',');
            let container = element.closest(localSelector) || element.parentElement;
            if (container && container !== element) {
                const interactiveCount = container.querySelectorAll?.('button,a[href],[role="button"],[role="menuitem"]').length || 0;
                if (interactiveCount > 6 || String(container.textContent || '').length > 900) container = element.parentElement;
            }
            return [
                element.getAttribute('aria-label'), element.getAttribute('title'), element.getAttribute('data-testid'),
                element.getAttribute('download'), element.getAttribute('href'), element.className,
                element.textContent, container?.getAttribute?.('data-testid'), container?.getAttribute?.('aria-label'),
                container && container !== element ? container.textContent : '',
            ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
        }

        isStrongInteractiveAssetControl(element, candidate = {}) {
            if (!(element instanceof Element)) return false;
            const signal = this.getInteractiveControlSignal(element);
            if (/(?:下载|导出|附件|文件|打开.*(?:画布|预览|文件)|在.*中打开|download|export|attachment|generated[-_ ]?file|artifact|canvas|canmore|writing[-_ ]?block|open.*(?:preview|canvas|artifact))/i.test(signal)) return true;
            if (/\.(?:csv|docx?|html?|json|md|odp|ods|odt|pdf|pptx?|py|rtf|svg|txt|xlsx?|xml|yaml|yml|zip)\b/i.test(signal)) return true;
            return /^sandbox:/i.test(candidate.url || '') || Boolean(candidate.fileId || candidate.artifactId);
        }

        isLikelyCapturedAssetUrl(url, filename = '', contentType = '') {
            const signal = `${url} ${filename} ${contentType}`.toLowerCase();
            return /(?:sandbox:|\/backend-api\/(?:files?|artifacts?|canvas|canmore)|oaiusercontent|oaistatic|download|attachment|artifact|canvas|blob:|data:)|\.(?:csv|docx?|html?|json|md|odp|ods|odt|pdf|pptx?|py|rtf|svg|txt|xlsx?|xml|yaml|yml|zip)(?:$|[?#\s])/i.test(signal);
        }

        collectArtifactSnapshotCandidates(beforeNodes = new Map(), label = 'Artifact') {
            if (this.config.conversationExportCaptureArtifactPanels === false) return [];
            const candidates = [];
            const nodes = this.queryAllDeep([
                'iframe', '[role="dialog"]', '[data-testid*="artifact" i]', '[data-testid*="canvas" i]',
                '[data-testid*="preview" i]', '[class*="artifact" i]', '[class*="canvas" i]',
            ].join(','));
            let sequence = 0;
            const capturedIframes = new WeakSet();
            const baselineIsMap = beforeNodes instanceof Map;
            for (const node of nodes) {
                if (!(node instanceof Element) || this.host?.contains(node)) continue;
                const currentState = this.getArtifactNodeState(node);
                const existed = baselineIsMap ? beforeNodes.has(node) : beforeNodes?.has?.(node);
                const changed = !existed || (baselineIsMap && beforeNodes.get(node) !== currentState);
                const visible = this.isElementActuallyVisible(node);
                if (!changed && !visible) continue;
                const rect = node.getBoundingClientRect?.();
                if (rect && visible && rect.width < 80 && rect.height < 60) continue;
                const nodeCandidateStart = candidates.length;

                if (node instanceof HTMLIFrameElement) {
                    const iframeSignal = `${node.getAttribute('title') || ''} ${node.getAttribute('data-testid') || ''} ${node.className || ''}`;
                    if (!visible && !/(?:artifact|canvas|canmore|preview|画布|预览)/i.test(iframeSignal)) continue;
                    if (capturedIframes.has(node)) continue;
                    capturedIframes.add(node);
                    const html = this.serializeIframeDocument(node);
                    const url = this.normalizeAssetCandidateUrl(node.getAttribute('src') || '');
                    if (html || url) {
                        sequence += 1;
                        candidates.push({
                            kind: 'artifact-html', url, alternateUrls: this.getElementUrlAlternates(node, url),
                            label: node.getAttribute('title') || label || 'Artifact',
                            filenameHint: `artifact-${sequence}.html`, mimeType: 'text/html',
                            inlineBlob: html ? new Blob([html], { type: 'text/html;charset=utf-8' }) : null,
                            captureMethod: 'interactive-artifact-iframe', probeOnly: true,
                        });
                    }
                    continue;
                }

                const panelSignal = this.getInteractiveControlSignal(node);
                if (!/(?:artifact|canvas|canmore|preview|画布|预览|代码|document|textdoc)/i.test(panelSignal) && !changed) continue;
                for (const iframe of this.queryAllDeep('iframe', node)) {
                    if (capturedIframes.has(iframe)) continue;
                    capturedIframes.add(iframe);
                    const html = this.serializeIframeDocument(iframe);
                    const url = this.normalizeAssetCandidateUrl(iframe.getAttribute('src') || '');
                    if (!html && !url) continue;
                    sequence += 1;
                    candidates.push({
                        kind: 'artifact-html', url, alternateUrls: this.getElementUrlAlternates(iframe, url),
                        label: iframe.getAttribute('title') || label || 'Artifact',
                        filenameHint: `artifact-${sequence}.html`, mimeType: 'text/html',
                        inlineBlob: html ? new Blob([html], { type: 'text/html;charset=utf-8' }) : null,
                        captureMethod: 'interactive-artifact-panel-iframe', probeOnly: true,
                    });
                }

                const sourceElements = [
                    ...node.querySelectorAll?.('textarea, [contenteditable="true"], [data-lexical-editor="true"], .cm-content, .monaco-editor .view-lines, pre code, pre, script[type="application/json"], template') || [],
                ];
                for (const codeElement of sourceElements.slice(0, 8)) {
                    let sourceText = '';
                    if (codeElement instanceof HTMLTextAreaElement) sourceText = codeElement.value;
                    else if (codeElement instanceof HTMLTemplateElement) sourceText = codeElement.innerHTML;
                    else sourceText = codeElement.textContent || '';
                    sourceText = sourceText.trim();
                    if (sourceText.length < 4) continue;
                    const payload = this.inferArtifactPayload({
                        content: sourceText,
                        type: `artifact ${panelSignal}`,
                        language: node.getAttribute('data-language') || codeElement.getAttribute?.('data-language') || codeElement.getAttribute?.('data-lang') || '',
                        title: node.querySelector?.('h1,h2,[data-testid*="title" i]')?.textContent?.trim() || label,
                    }, `artifact panel ${panelSignal}`, `artifact-source-${sequence + 1}`);
                    if (!payload) continue;
                    sequence += 1;
                    candidates.push({
                        kind: payload.kind, url: '', alternateUrls: [], label: payload.filename,
                        filenameHint: payload.filename, mimeType: payload.mimeType, inlineBlob: payload.blob,
                        captureMethod: 'interactive-artifact-source', probeOnly: true,
                    });
                    break;
                }

                for (const canvas of node.querySelectorAll?.('canvas') || []) {
                    const rectCanvas = canvas.getBoundingClientRect();
                    if (rectCanvas.width < 40 || rectCanvas.height < 40) continue;
                    candidates.push({
                        kind: 'canvas-image', url: '', alternateUrls: [], label: `${label} 预览`,
                        filenameHint: `artifact-preview-${sequence + 1}.png`, mimeType: 'image/png',
                        canvasElement: canvas, captureMethod: 'interactive-artifact-canvas', probeOnly: true,
                    });
                    sequence += 1;
                }

                for (const svg of node.querySelectorAll?.('svg') || []) {
                    const svgRect = svg.getBoundingClientRect();
                    if (svgRect.width < 80 || svgRect.height < 60) continue;
                    const serialized = new XMLSerializer().serializeToString(svg);
                    sequence += 1;
                    candidates.push({
                        kind: 'image', url: '', alternateUrls: [], label: `${label} SVG`,
                        filenameHint: `artifact-${sequence}.svg`, mimeType: 'image/svg+xml',
                        inlineBlob: new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }),
                        captureMethod: 'interactive-artifact-svg', probeOnly: true,
                    });
                }

                // 对没有 iframe/源码的渲染型 Artifact，保存一份静态 HTML 快照作为后备。
                const alreadyCapturedPanel = candidates.length > nodeCandidateStart;
                if (visible && !alreadyCapturedPanel && rect && rect.width >= 180 && rect.height >= 100) {
                    try {
                        const clone = node.cloneNode(true);
                        for (const removable of clone.querySelectorAll('button,script,noscript,[role="tooltip"],[aria-hidden="true"]')) removable.remove();
                        const snapshot = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:light dark}body{margin:0;padding:18px;font:15px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}img,svg,canvas,video{max-width:100%;height:auto}pre{overflow:auto;white-space:pre-wrap}table{max-width:100%;display:block;overflow:auto}</style></head><body>${clone.outerHTML}</body></html>`;
                        sequence += 1;
                        candidates.push({
                            kind: 'artifact-html', url: '', alternateUrls: [], label: label || 'Artifact 快照',
                            filenameHint: `artifact-snapshot-${sequence}.html`, mimeType: 'text/html',
                            inlineBlob: new Blob([snapshot], { type: 'text/html;charset=utf-8' }),
                            captureMethod: 'interactive-artifact-static-snapshot', probeOnly: true,
                        });
                    } catch { }
                }
            }
            return candidates;
        }

        isLikelyAutomatedDownloadUrl(value, filename = '', contentType = '') {
            const url = this.normalizeAssetCandidateUrl(value);
            const name = String(filename || '').trim();
            const type = String(contentType || '').trim();
            if (name) return true;
            if (!url) return false;
            if (/^(?:blob:|data:|sandbox:|file-service:|sediment:|artifact:|canvas:|canmore:|textdoc:|document:)/i.test(url)) return true;
            if (/(?:\/backend-api\/(?:files?|artifacts?|canvas|canmore|textdocs?|documents?)\/|\/mnt\/data\/|oaiusercontent|oaistatic|download|attachment|signed[-_]?url)/i.test(url)) return true;
            if (/\.(?:7z|aac|avi|bmp|csv|docx?|epub|gif|gz|html?|jpeg|jpg|json|m4a|md|mov|mp3|mp4|odp|ods|odt|ogg|pdf|png|pptx?|py|rar|rtf|svg|tar|tiff?|tsv|txt|wav|webm|webp|xlsx?|xml|yaml|yml|zip)(?:$|[?#])/i.test(url)) return true;
            return this.isLikelyCapturedAssetUrl(url, name, type);
        }

        isLikelyAutomatedDownloadAnchor(anchor) {
            if (!anchor || Number(anchor.nodeType) !== 1 || String(anchor.tagName || '').toLowerCase() !== 'a') return false;
            const href = anchor.href || anchor.getAttribute?.('href') || '';
            const filename = anchor.download || anchor.getAttribute?.('download') || '';
            if (anchor.hasAttribute?.('download')) return true;
            if (this.isLikelyAutomatedDownloadUrl(href, filename, '')) return true;
            try { return this.isLikelyDownloadAssetLink(anchor, this.normalizeAssetCandidateUrl(href)); } catch { return false; }
        }

        installAutomatedDownloadQuarantine(context = 'archive-load') {
            if (this.config.conversationArchiveDownloadQuarantine === false) return null;
            const pageWindow = this.getPageRealmWindow();
            const id = ++this.downloadQuarantineSequence;
            const stats = {
                id,
                context,
                blocked: 0,
                anchorClicks: 0,
                syntheticEvents: 0,
                windowOpens: 0,
                samples: [],
            };
            let active = true;
            const record = (kind, value = '') => {
                stats.blocked += 1;
                if (kind === 'anchor-click') stats.anchorClicks += 1;
                else if (kind === 'synthetic-event') stats.syntheticEvents += 1;
                else if (kind === 'window-open') stats.windowOpens += 1;
                if (stats.samples.length < 8) stats.samples.push({ kind, value: String(value || '').slice(0, 300) });
            };
            let trustedDownloadIntentUntil = 0;
            const getClosestElement = (target, selector) => {
                try {
                    if (!target || Number(target.nodeType) !== 1) return null;
                    return target.closest?.(selector) || null;
                } catch { return null; }
            };
            const isExplicitUserDownloadControl = (element) => {
                if (!element) return false;
                if (String(element.tagName || '').toLowerCase() === 'a' && this.isLikelyAutomatedDownloadAnchor(element)) return true;
                const signal = this.getInteractiveControlSignal(element);
                return /(?:下载|另存为|保存文件|导出(?:为|文件)?|download|save(?: as)?|export(?: file)?|attachment|generated[-_ ]?file)/i.test(signal);
            };
            const hasRecentExplicitUserDownloadIntent = () => performance.now() < trustedDownloadIntentUntil;
            const shouldBlockAnchor = (anchor) => active && !hasRecentExplicitUserDownloadIntent() && this.isLikelyAutomatedDownloadAnchor(anchor);
            const shouldBlockUrl = (url) => active && !hasRecentExplicitUserDownloadIntent() && this.isLikelyAutomatedDownloadUrl(url, '', '');

            const original = {};
            const onTrustedDownloadIntent = (event) => {
                if (!active || !event.isTrusted) return;
                const target = getClosestElement(event.target, 'a[href],a[download],button,[role="button"],[role="menuitem"]');
                if (target && isExplicitUserDownloadControl(target)) {
                    // 只为明确点击文件/下载控件的真实用户操作开放短时间窗口；
                    // 点击“加载全部”不会获得此豁免。
                    trustedDownloadIntentUntil = performance.now() + 1600;
                }
            };
            const onSyntheticClick = (event) => {
                if (!active || event.isTrusted || hasRecentExplicitUserDownloadIntent()) return;
                const target = getClosestElement(event.target, 'a[href],a[download]');
                if (!target || !this.isLikelyAutomatedDownloadAnchor(target)) return;
                record('synthetic-event', target.href || target.getAttribute('href') || target.getAttribute('download') || '');
                event.preventDefault();
                event.stopImmediatePropagation();
            };
            document.addEventListener('pointerdown', onTrustedDownloadIntent, true);
            document.addEventListener('click', onTrustedDownloadIntent, true);
            document.addEventListener('click', onSyntheticClick, true);

            try {
                const Anchor = pageWindow.HTMLAnchorElement;
                original.anchorClick = Anchor?.prototype?.click;
                if (typeof original.anchorClick === 'function') {
                    const controller = this;
                    Anchor.prototype.click = function (...args) {
                        if (shouldBlockAnchor(this)) {
                            record('anchor-click', this.href || this.getAttribute?.('href') || this.download || '');
                            return undefined;
                        }
                        return original.anchorClick.apply(this, args);
                    };
                }
            } catch { }

            try {
                original.open = pageWindow.open;
                if (typeof original.open === 'function') {
                    pageWindow.open = function (url, ...rest) {
                        if (shouldBlockUrl(url)) {
                            record('window-open', url);
                            return null;
                        }
                        return original.open.call(this, url, ...rest);
                    };
                }
            } catch { }

            const restore = () => {
                if (!active) return stats;
                active = false;
                document.removeEventListener('pointerdown', onTrustedDownloadIntent, true);
                document.removeEventListener('click', onTrustedDownloadIntent, true);
                document.removeEventListener('click', onSyntheticClick, true);
                try {
                    const Anchor = pageWindow.HTMLAnchorElement;
                    if (original.anchorClick && Anchor?.prototype) Anchor.prototype.click = original.anchorClick;
                } catch { }
                try { if (original.open) pageWindow.open = original.open; } catch { }
                this.lastDownloadQuarantineStats = stats;
                if (stats.blocked) {
                    console.warn(`[ChatGPT 导航与导出] 安全加载期间拦截了 ${stats.blocked} 次非用户触发的下载尝试。`, stats);
                }
                return stats;
            };
            return { id, stats, restore };
        }

        async probeInteractiveAssetControl(element, baseCandidate = {}) {
            if (
                this.config.conversationArchivePassiveAssetDiscoveryOnly === true ||
                this.config.conversationExportProbeInteractiveControls !== true ||
                this.config.conversationExportEnableDangerousAutomaticControlActivation !== true ||
                !(element instanceof Element) ||
                !element.isConnected
            ) {
                return { primary: null, extras: [] };
            }
            const pageWindow = this.getPageRealmWindow();
            const timeoutMs = Math.max(500, Number(this.config.conversationExportInteractiveProbeTimeoutMs) || 1800);
            const settleMs = Math.max(120, Number(this.config.conversationExportInteractiveProbeSettleMs) || 300);
            const runId = ++this.interactiveProbeRunId;
            const capturedUrls = [];
            const capturedBlobs = [];
            const captureTasks = [];
            const addedNodes = [];
            const beforeArtifactNodes = this.captureArtifactNodeBaseline();
            const performanceStart = performance.now();
            const blobByUrl = new Map();
            const recordUrl = (value, filename = '') => {
                const url = this.normalizeAssetCandidateUrl(value);
                if (!url || !this.isLikelyCapturedAssetUrl(url, filename, '')) return;
                const existing = capturedUrls.find((item) => item.url === url);
                if (existing) {
                    if (!existing.filename && filename) existing.filename = filename;
                    return;
                }
                capturedUrls.push({ url, filename });
            };
            const recordBlob = (blob, filename = '', url = '', contentType = '') => {
                if (!this.isBlobLike(blob) || !(Number(blob.size) > 0)) return;
                const sameObject = capturedBlobs.find((item) => item.blob === blob || (url && item.url === url));
                if (sameObject) {
                    if (!sameObject.filename && filename) sameObject.filename = filename;
                    if (!sameObject.url && url) sameObject.url = url;
                    if (!sameObject.contentType && contentType) sameObject.contentType = contentType;
                    return;
                }
                capturedBlobs.push({ blob, filename, url, contentType });
            };
            const recordJson = (data) => {
                const metadata = this.extractDownloadMetadataFromJson(data);
                if (metadata?.downloadUrl) recordUrl(metadata.downloadUrl, metadata.filename);
                if (data && typeof data === 'object') {
                    const synthetic = {
                        author: { role: baseCandidate.role || 'assistant', name: 'interactive-download' },
                        content: { parts: [] },
                        metadata: { interactive_response: data },
                    };
                    for (const asset of this.collectApiAssetsFromMessage(synthetic, Number(baseCandidate.logicalIndex) || 0)) {
                        if (asset.sourceUrl) recordUrl(asset.sourceUrl, asset.filenameHint);
                        if (asset.blob) recordBlob(asset.blob, asset.filenameHint, asset.sourceUrl, asset.mimeType);
                    }
                }
            };

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) if (node instanceof Element) addedNodes.push(node);
                }
            });
            try { observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'style', 'src', 'srcdoc'] }); } catch { }

            const original = {};
            const xhrMeta = new WeakMap();
            const thisController = this;
            try {
                original.open = pageWindow.open;
                pageWindow.open = function (url) {
                    recordUrl(url);
                    return null;
                };
            } catch { }
            try {
                original.createObjectURL = pageWindow.URL?.createObjectURL;
                if (original.createObjectURL) {
                    pageWindow.URL.createObjectURL = function (blob) {
                        const url = original.createObjectURL.call(this, blob);
                        if (thisController.isBlobLike(blob)) {
                            blobByUrl.set(url, blob);
                            recordBlob(blob, '', url, blob.type || '');
                        }
                        return url;
                    };
                }
            } catch { }
            try {
                original.anchorClick = pageWindow.HTMLAnchorElement?.prototype?.click;
                if (original.anchorClick) {
                    pageWindow.HTMLAnchorElement.prototype.click = function () {
                        const href = this.href || this.getAttribute?.('href') || '';
                        const filename = this.download || this.getAttribute?.('download') || '';
                        recordUrl(href, filename);
                        if (blobByUrl.has(href)) recordBlob(blobByUrl.get(href), filename, href);
                        return undefined;
                    };
                }
            } catch { }
            try {
                original.fetch = pageWindow.fetch;
                if (typeof original.fetch === 'function') {
                    pageWindow.fetch = async function (...args) {
                        const response = await original.fetch.apply(this, args);
                        try {
                            const requestUrl = String(args[0]?.url || args[0] || response.url || '');
                            const contentType = response.headers?.get?.('content-type') || '';
                            const disposition = response.headers?.get?.('content-disposition') || '';
                            const filename = thisController.parseContentDispositionFilename(disposition);
                            const likely = thisController.isLikelyCapturedAssetUrl(requestUrl, filename, contentType) ||
                                thisController.isLikelyCapturedAssetUrl(response.url || '', filename, contentType) || Boolean(disposition);
                            if (likely) {
                                const clone = response.clone();
                                captureTasks.push((async () => {
                                    if (/json/i.test(contentType)) {
                                        try { recordJson(await clone.json()); } catch { }
                                    } else {
                                        try { recordBlob(await clone.blob(), filename, response.url || requestUrl, contentType); } catch { }
                                    }
                                    recordUrl(response.url || requestUrl, filename);
                                })());
                            }
                        } catch { }
                        return response;
                    };
                }
            } catch { }
            try {
                const Xhr = pageWindow.XMLHttpRequest;
                if (Xhr?.prototype) {
                    original.xhrOpen = Xhr.prototype.open;
                    original.xhrSend = Xhr.prototype.send;
                    Xhr.prototype.open = function (method, url, ...rest) {
                        xhrMeta.set(this, { method: String(method || 'GET'), url: String(url || '') });
                        return original.xhrOpen.call(this, method, url, ...rest);
                    };
                    Xhr.prototype.send = function (...args) {
                        const xhr = this;
                        const meta = xhrMeta.get(xhr) || {};
                        const onLoadEnd = () => {
                            try {
                                const url = xhr.responseURL || meta.url || '';
                                const contentType = xhr.getResponseHeader?.('content-type') || '';
                                const disposition = xhr.getResponseHeader?.('content-disposition') || '';
                                const filename = thisController.parseContentDispositionFilename(disposition);
                                if (!thisController.isLikelyCapturedAssetUrl(url, filename, contentType) && !disposition) return;
                                recordUrl(url, filename);
                                const responseType = String(xhr.responseType || '').toLowerCase();
                                if (responseType === 'blob' || responseType === 'arraybuffer') {
                                    recordBlob(xhr.response, filename, url, contentType);
                                } else {
                                    const text = String(xhr.responseText || xhr.response || '');
                                    if (/json/i.test(contentType) || /^[{[]/.test(text.trim())) {
                                        try { recordJson(JSON.parse(text)); } catch { }
                                    }
                                }
                            } catch { }
                        };
                        try { xhr.addEventListener('loadend', onLoadEnd, { once: true }); } catch { }
                        return original.xhrSend.apply(this, args);
                    };
                }
            } catch { }

            let sourceEventSeen = false;
            const onDocumentClick = (event) => {
                const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
                if (target) {
                    const href = target.href || target.getAttribute('href') || '';
                    const filename = target.getAttribute('download') || '';
                    if (this.isLikelyCapturedAssetUrl(href, filename, '')) {
                        recordUrl(href, filename);
                        if (blobByUrl.has(href)) recordBlob(blobByUrl.get(href), filename, href);
                        event.preventDefault();
                    }
                }
                if (element.contains(event.target)) sourceEventSeen = true;
            };
            document.addEventListener('click', onDocumentClick, true);

            const restore = () => {
                observer.disconnect();
                document.removeEventListener('click', onDocumentClick, true);
                try { if (original.open) pageWindow.open = original.open; } catch { }
                try { if (original.createObjectURL) pageWindow.URL.createObjectURL = original.createObjectURL; } catch { }
                try { if (original.anchorClick) pageWindow.HTMLAnchorElement.prototype.click = original.anchorClick; } catch { }
                try { if (original.fetch) pageWindow.fetch = original.fetch; } catch { }
                try {
                    const Xhr = pageWindow.XMLHttpRequest;
                    if (original.xhrOpen && Xhr?.prototype) Xhr.prototype.open = original.xhrOpen;
                    if (original.xhrSend && Xhr?.prototype) Xhr.prototype.send = original.xhrSend;
                } catch { }
            };

            const dispatchProbeClick = (target) => {
                if (!(target instanceof Element) || !target.isConnected) return false;
                try {
                    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window }));
                    return true;
                } catch {
                    try { target.click?.(); return true; } catch { return false; }
                }
            };

            const collectNestedControls = () => {
                const panels = this.queryAllDeep([
                    '[role="dialog"]', '[role="menu"]', '[data-radix-menu-content]',
                    '[data-testid*="artifact" i]', '[data-testid*="canvas" i]', '[class*="artifact" i]', '[class*="canvas" i]',
                ].join(',')).filter((node) => this.isElementActuallyVisible(node));
                const controls = [];
                for (const panel of panels) {
                    for (const control of this.queryAllDeep('button,a[href],[role="button"],[role="menuitem"]', panel)) {
                        if (!this.isElementActuallyVisible(control)) continue;
                        const signal = this.getInteractiveControlSignal(control);
                        const directSignal = [control.getAttribute('aria-label'), control.getAttribute('title'), control.getAttribute('data-testid'), control.textContent]
                            .filter(Boolean).join(' ');
                        if (!/(?:下载|导出|保存|获取|download|export|save|html|markdown|md|zip|pdf|docx?|pptx?|xlsx?|csv|json|源码|source)/i.test(signal)) continue;
                        if (/(?:关闭|close|取消|cancel)/i.test(directSignal)) continue;
                        if (!controls.includes(control)) controls.push(control);
                    }
                }
                // 菜单经 Portal 挂到 body 时，不一定属于 Artifact 面板。
                for (const control of this.queryAllDeep('[role="menuitem"], [data-radix-menu-content] button, [data-radix-menu-content] a[href]')) {
                    if (!this.isElementActuallyVisible(control)) continue;
                    const signal = this.getInteractiveControlSignal(control);
                    if (/(?:下载|导出|保存|download|export|save|html|markdown|md|zip|pdf|docx?|pptx?|xlsx?|csv|json|源码|source)/i.test(signal) && !controls.includes(control)) controls.push(control);
                }
                return controls;
            };

            try {
                dispatchProbeClick(element);
                await this.waitForDelay(Math.min(220, settleMs)).catch(() => { });

                const maxNested = Math.max(0, Number(this.config.conversationExportMaxNestedProbeControls) || 8);
                const nestedControls = collectNestedControls().slice(0, maxNested);
                for (const control of nestedControls) {
                    dispatchProbeClick(control);
                    await this.waitForDelay(100).catch(() => { });
                }

                const startedAt = performance.now();
                let lastChangeAt = startedAt;
                let previousCount = 0;
                while (performance.now() - startedAt < timeoutMs) {
                    await this.waitForDelay(80).catch(() => { });
                    const currentCount = capturedUrls.length + capturedBlobs.length + addedNodes.length;
                    if (currentCount !== previousCount) {
                        previousCount = currentCount;
                        lastChangeAt = performance.now();
                    }
                    if (currentCount && performance.now() - lastChangeAt >= settleMs) break;
                }
                await Promise.allSettled(captureTasks);

                try {
                    for (const entry of performance.getEntriesByType?.('resource') || []) {
                        if (Number(entry.startTime || 0) + 5 < performanceStart) continue;
                        recordUrl(entry.name || '');
                    }
                } catch { }

                const artifactCandidates = this.collectArtifactSnapshotCandidates(beforeArtifactNodes, baseCandidate.label || 'Artifact');
                for (const artifactCandidate of artifactCandidates) {
                    if (artifactCandidate.canvasElement instanceof HTMLCanvasElement) {
                        artifactCandidate.inlineBlob = await this.canvasToBlob(artifactCandidate.canvasElement);
                        delete artifactCandidate.canvasElement;
                    }
                }

                const resolved = [];
                const resolvedBlobKeys = new Set();
                for (const item of capturedBlobs) {
                    const normalizedBlob = await this.normalizeBlobLike(item.blob, item.contentType || baseCandidate.mimeType || '');
                    if (!normalizedBlob?.size) continue;
                    const inferredFilename = item.filename || baseCandidate.filenameHint || '';
                    const blobKey = `${inferredFilename.toLowerCase()}|${normalizedBlob.size}|${normalizedBlob.type || item.contentType || ''}`;
                    if (resolvedBlobKeys.has(blobKey)) continue;
                    resolvedBlobKeys.add(blobKey);
                    const baseKind = baseCandidate.kind === 'artifact' || /artifact|canvas/i.test(baseCandidate.kind || '')
                        ? 'artifact'
                        : /file-control/.test(baseCandidate.kind || '')
                            ? 'file'
                            : baseCandidate.kind || this.getAssetKindFromHints({ mimeType: normalizedBlob.type, filename: item.filename });
                    resolved.push({
                        kind: baseKind,
                        url: item.url || '', alternateUrls: [], label: baseCandidate.label || item.filename || '生成文件',
                        filenameHint: item.filename || baseCandidate.filenameHint || '', mimeType: normalizedBlob.type || item.contentType || baseCandidate.mimeType || '',
                        inlineBlob: normalizedBlob, captureMethod: 'interactive-download-blob', probeOnly: true,
                    });
                }
                for (const item of capturedUrls) {
                    if (resolved.some((candidate) => candidate.url === item.url)) continue;
                    if (blobByUrl.has(item.url)) continue;
                    if (item.filename && resolved.some((candidate) =>
                        String(candidate.filenameHint || '').toLowerCase() === String(item.filename).toLowerCase())) continue;
                    resolved.push({
                        kind: /file-control/.test(baseCandidate.kind || '')
                            ? 'file'
                            : baseCandidate.kind || this.getAssetKindFromHints({ filename: item.filename, signal: baseCandidate.label }),
                        url: item.url, alternateUrls: [], label: baseCandidate.label || item.filename || '生成文件',
                        filenameHint: item.filename || baseCandidate.filenameHint || '', mimeType: baseCandidate.mimeType || '',
                        fileId: this.extractFileIdFromValue(item.url), artifactId: this.extractArtifactIdFromValue(item.url),
                        captureMethod: 'interactive-download-url', probeOnly: true,
                    });
                }
                resolved.push(...artifactCandidates.filter((candidate) => candidate.inlineBlob || candidate.url));

                const openedPanel = [...addedNodes].reverse().find((node) => node instanceof Element &&
                    node.matches?.('[role="dialog"],[data-testid*="artifact" i],[data-testid*="canvas" i],[class*="artifact" i],[class*="canvas" i]'));
                if (openedPanel) {
                    const close = openedPanel.querySelector?.('button[aria-label*="关闭"],button[aria-label*="Close" i],[data-testid*="close" i]');
                    try { close?.click?.(); } catch { }
                }
                if (!resolved.length && sourceEventSeen && /^sandbox:/i.test(baseCandidate.url || '')) {
                    resolved.push({ ...baseCandidate, captureMethod: 'interactive-unresolved-sandbox', probeOnly: true });
                }
                return { primary: resolved[0] || null, extras: resolved.slice(1) };
            } finally {
                restore();
                if (runId === this.interactiveProbeRunId) this.requestFrame(true);
            }
        }

        async discoverMessageAssets(root, logicalIndex, role, sequenceStart = 0, options = {}) {
            if (!(root instanceof HTMLElement)) return { assets: [], annotatedElements: [], nextSequence: sequenceStart };
            const candidates = [];
            const allowInteractiveProbe = (
                options.allowInteractiveProbe === true &&
                this.config.conversationArchivePassiveAssetDiscoveryOnly !== true &&
                this.config.conversationExportProbeInteractiveControls === true &&
                this.config.conversationExportEnableDangerousAutomaticControlActivation === true
            );
            const addCandidate = (element, data) => {
                if (!(element instanceof Element) && !data?.probeOnly) return;
                const normalizedElement = element instanceof Element ? element : null;
                const incoming = { element: normalizedElement, role, ...data };
                const incomingName = String(incoming.filenameHint || incoming.label || '').trim().toLowerCase();
                const existing = candidates.find((candidate) => {
                    if (incoming.fileId && candidate.fileId === incoming.fileId) return true;
                    if (incoming.artifactId && candidate.artifactId === incoming.artifactId) return true;
                    if (incoming.url && candidate.url === incoming.url) return true;
                    if (normalizedElement && candidate.element === normalizedElement) {
                        const existingName = String(candidate.filenameHint || candidate.label || '').trim().toLowerCase();
                        return !incomingName || !existingName || incomingName === existingName ||
                            incomingName.includes(existingName) || existingName.includes(incomingName);
                    }
                    return false;
                });
                if (!existing) {
                    candidates.push(incoming);
                    return;
                }
                existing.fileId = incoming.fileId || existing.fileId || '';
                existing.artifactId = incoming.artifactId || existing.artifactId || '';
                if (!existing.url || /^sandbox:/i.test(existing.url)) existing.url = incoming.url || existing.url || '';
                existing.alternateUrls = [...new Set([
                    ...(existing.alternateUrls || []), ...(incoming.alternateUrls || []),
                    incoming.url && incoming.url !== existing.url ? incoming.url : '',
                ].filter(Boolean))];
                existing.filenameHint = incoming.filenameHint || existing.filenameHint || '';
                existing.mimeType = incoming.mimeType || existing.mimeType || '';
                existing.inlineBlob = incoming.inlineBlob || existing.inlineBlob || null;
                existing.presentation = incoming.presentation || existing.presentation || '';
                if (!existing.label || existing.label === '附件') existing.label = incoming.label || existing.label;
                const genericKinds = new Set(['file-control', 'file', 'artifact']);
                if (!existing.kind || (genericKinds.has(existing.kind) && incoming.kind && !genericKinds.has(incoming.kind))) existing.kind = incoming.kind;
                if (/interactive|react/.test(incoming.captureMethod || '')) existing.captureMethod = incoming.captureMethod;
                existing.probeOnly = existing.probeOnly || incoming.probeOnly;
            };

            for (const image of root.querySelectorAll('img')) {
                if (image.closest('[role="tooltip"], [data-message-actions]')) continue;
                const url = this.getLargestImageCandidate(image);
                if (!url) continue;
                let presentation = 'content';
                try {
                    const rect = image.getBoundingClientRect();
                    const signal = `${image.className} ${image.getAttribute('alt') || ''} ${image.getAttribute('data-testid') || ''} ${url}`.toLowerCase();
                    const small = rect.width > 0 && rect.height > 0 && rect.width <= 80 && rect.height <= 80;
                    if (/favicon|site[-_ ]?icon|domain[-_ ]?icon|avatar|emoji|logo|icon\b/i.test(signal) ||
                        (small && image.closest('a[href^="http"], p, li, span'))) presentation = 'inline-icon';
                } catch { }
                addCandidate(image, {
                    kind: presentation === 'inline-icon' ? 'inline-icon' : 'image', presentation, url,
                    alternateUrls: [
                        ...this.getElementUrlAlternates(image, url),
                        ...[...(image.closest('picture')?.querySelectorAll('source[srcset]') || [])]
                            .flatMap((source) => String(source.getAttribute('srcset') || '').split(',').map((part) => part.trim().split(/\s+/)[0]))
                            .map((candidateUrl) => this.normalizeAssetCandidateUrl(candidateUrl)).filter(Boolean),
                    ],
                    fileId: this.extractFileIdFromValue(url), artifactId: '',
                    label: image.getAttribute('alt') || image.getAttribute('aria-label') || '图片',
                    filenameHint: image.getAttribute('download') || '',
                    mimeType: /^data:([^;,]+)/i.exec(url)?.[1] || '',
                    captureMethod: 'dom-image',
                });
            }

            for (const anchor of root.querySelectorAll('a[href]')) {
                const url = this.normalizeAssetCandidateUrl(anchor.getAttribute('href') || anchor.href);
                if (!url || !this.isLikelyDownloadAssetLink(anchor, url)) continue;
                addCandidate(anchor, {
                    kind: /\.html?(?:$|[?#])/i.test(url) || /artifact|canvas/i.test(this.getInteractiveControlSignal(anchor)) ? 'artifact-html' : 'file',
                    url, alternateUrls: this.getElementUrlAlternates(anchor, url),
                    fileId: this.extractFileIdFromValue(url), artifactId: this.extractArtifactIdFromValue(url),
                    label: anchor.textContent?.trim() || anchor.getAttribute('aria-label') || anchor.getAttribute('title') || '附件',
                    filenameHint: anchor.getAttribute('download') || '', mimeType: '', captureMethod: 'dom-link',
                });
            }

            const controlSelector = 'button, [role="button"], [data-testid*="artifact" i], [data-testid*="canvas" i], [data-testid*="file" i]';
            for (const control of root.querySelectorAll(controlSelector)) {
                if (control.closest('[role="tooltip"], [data-message-actions]')) continue;
                const signal = this.getInteractiveControlSignal(control);
                if (!/(?:下载|导出|附件|文件|artifact|canvas|canmore|download|export|attachment|generated[-_ ]?file|open.*(?:preview|canvas|artifact)|\.(?:csv|docx?|html?|json|md|pdf|pptx?|py|svg|txt|xlsx?|zip)\b)/i.test(signal)) continue;
                const alternates = this.getElementUrlAlternates(control, '');
                const url = alternates[0] || '';
                addCandidate(control, {
                    kind: /artifact|canvas|canmore/i.test(signal) ? 'artifact' : 'file-control',
                    url, alternateUrls: alternates.slice(1),
                    fileId: this.extractFileIdFromValue(url), artifactId: this.extractArtifactIdFromValue(url),
                    label: control.textContent?.trim() || control.getAttribute('aria-label') || control.getAttribute('title') || '附件',
                    filenameHint: '', mimeType: '', captureMethod: 'dom-control',
                });
            }

            if (this.config.conversationExportProbeReactProperties !== false) {
                const maxReactControls = Math.max(0, Number(this.config.conversationExportMaxReactHintControlsPerMessage) || 10);
                let scanned = 0;
                for (const candidate of [...candidates]) {
                    if (scanned >= maxReactControls || !(candidate.element instanceof Element)) break;
                    if (!this.isStrongInteractiveAssetControl(candidate.element, candidate)) continue;
                    scanned += 1;
                    for (const hint of this.collectReactInternalAssetCandidates(candidate.element, logicalIndex, role)) {
                        addCandidate(candidate.element, hint);
                    }
                }
            }

            for (const iframe of root.querySelectorAll('iframe')) {
                const html = this.serializeIframeDocument(iframe);
                const url = this.normalizeAssetCandidateUrl(iframe.getAttribute('src') || '');
                if (!html && !url) continue;
                addCandidate(iframe, {
                    kind: 'artifact-html', url, alternateUrls: this.getElementUrlAlternates(iframe, url),
                    artifactId: this.extractArtifactIdFromValue(url),
                    label: iframe.getAttribute('title') || iframe.getAttribute('aria-label') || '交互式 Artifact',
                    filenameHint: 'artifact.html', mimeType: 'text/html',
                    inlineBlob: html ? new Blob([html], { type: 'text/html;charset=utf-8' }) : null,
                    captureMethod: 'dom-iframe',
                });
            }

            for (const canvas of root.querySelectorAll('canvas')) {
                const rect = canvas.getBoundingClientRect();
                if (rect.width < 24 && rect.height < 24) continue;
                addCandidate(canvas, {
                    kind: 'canvas-image', url: '', alternateUrls: [], label: canvas.getAttribute('aria-label') || 'Canvas 图像',
                    filenameHint: 'canvas.png', mimeType: 'image/png', inlineBlob: await this.canvasToBlob(canvas),
                    captureMethod: 'dom-canvas',
                });
            }

            for (const svg of root.querySelectorAll('svg:not(.icon)')) {
                if (svg.closest('.katex, button, [aria-hidden="true"]')) continue;
                const box = svg.getBoundingClientRect();
                if (box.width < 48 && box.height < 48) continue;
                const xml = new XMLSerializer().serializeToString(svg);
                addCandidate(svg, {
                    kind: 'svg-image', url: '', alternateUrls: [],
                    label: svg.getAttribute('aria-label') || svg.querySelector('title')?.textContent || 'SVG 图像',
                    filenameHint: 'graphic.svg', mimeType: 'image/svg+xml',
                    inlineBlob: new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }), captureMethod: 'dom-svg',
                });
            }

            for (const element of root.querySelectorAll('video[src], audio[src], source[src], object[data], embed[src]')) {
                const raw = element.getAttribute('src') || element.getAttribute('data') || '';
                const url = this.normalizeAssetCandidateUrl(raw);
                if (!url) continue;
                addCandidate(element, {
                    kind: element.tagName.toLowerCase(), url, alternateUrls: this.getElementUrlAlternates(element, url),
                    fileId: this.extractFileIdFromValue(url), artifactId: this.extractArtifactIdFromValue(url),
                    label: element.getAttribute('aria-label') || element.getAttribute('title') || element.tagName.toLowerCase(),
                    filenameHint: '', mimeType: element.getAttribute('type') || '', captureMethod: 'dom-media',
                });
            }

            if (allowInteractiveProbe) {
                const maxControls = Math.max(0, Number(this.config.conversationExportMaxProbeControlsPerMessage) || 12);
                let probed = 0;
                const originalCandidates = [...candidates];
                for (const candidate of originalCandidates) {
                    if (probed >= maxControls || !(candidate.element instanceof Element)) break;
                    const needsProbe = this.isStrongInteractiveAssetControl(candidate.element, candidate) && (
                        candidate.element.matches('button,[role="button"]') || /^sandbox:/i.test(candidate.url || '') ||
                        (!candidate.fileId && !candidate.artifactId && !/^https?:|^data:|^blob:/i.test(candidate.url || '')) ||
                        /artifact|canvas|canmore/i.test(candidate.kind || '')
                    );
                    if (!needsProbe) continue;
                    probed += 1;
                    try {
                        const result = await this.probeInteractiveAssetControl(candidate.element, { ...candidate, logicalIndex, role });
                        if (result.primary) {
                            const primary = result.primary;
                            candidate.kind = primary.kind || candidate.kind;
                            candidate.url = primary.url || candidate.url;
                            candidate.alternateUrls = [...new Set([...(candidate.alternateUrls || []), ...(primary.alternateUrls || [])])];
                            candidate.fileId = primary.fileId || candidate.fileId;
                            candidate.artifactId = primary.artifactId || candidate.artifactId;
                            candidate.filenameHint = primary.filenameHint || candidate.filenameHint;
                            candidate.mimeType = primary.mimeType || candidate.mimeType;
                            candidate.inlineBlob = primary.inlineBlob || candidate.inlineBlob;
                            candidate.captureMethod = primary.captureMethod || candidate.captureMethod;
                        }
                        for (const extra of result.extras || []) addCandidate(null, { ...extra, probeOnly: true });
                    } catch (error) {
                        console.debug('[ChatGPT 导航与导出] 资源控件探测未获取内容：', error);
                    }
                }
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
                    } catch { }
                }
                const fileId = candidate.fileId || this.extractFileIdFromValue(sourceUrl);
                const artifactId = candidate.artifactId || this.extractArtifactIdFromValue(sourceUrl);
                const key = fileId ? `file|${fileId}`
                    : artifactId ? `artifact|${artifactId}`
                        : sourceUrl ? `${candidate.kind}|${sourceUrl}`
                            : `${candidate.kind}|inline|${candidate.filenameHint || ''}|${inlineBlob?.size || sequence + 1}`;
                let asset = byKey.get(key);
                if (!asset) {
                    sequence += 1;
                    const id = `q${String(logicalIndex + 1).padStart(3, '0')}-${role}-a${String(sequence).padStart(3, '0')}`;
                    const mimeType = candidate.mimeType || inlineBlob?.type || '';
                    asset = {
                        id, logicalIndex, role, kind: candidate.kind,
                        presentation: candidate.presentation || (candidate.kind === 'inline-icon' ? 'inline-icon' : ''),
                        label: String(candidate.label || '附件').trim() || '附件',
                        sourceUrl, alternateUrls: [...new Set(candidate.alternateUrls || [])],
                        fileId, artifactId,
                        filenameHint: this.getAssetFilenameHint({ ...candidate, mimeType }, sequence),
                        mimeType, byteLength: inlineBlob?.size || 0, blob: inlineBlob,
                        captureMethod: candidate.captureMethod || 'dom', capturedAt: new Date().toISOString(),
                    };
                    byKey.set(key, asset);
                    assets.push(asset);
                } else {
                    for (const alternate of candidate.alternateUrls || []) {
                        if (alternate && !asset.alternateUrls.includes(alternate)) asset.alternateUrls.push(alternate);
                    }
                    if (!(asset.blob instanceof Blob) && inlineBlob instanceof Blob) {
                        asset.blob = inlineBlob; asset.byteLength = inlineBlob.size;
                    }
                    if (!asset.fileId && fileId) asset.fileId = fileId;
                    if (!asset.artifactId && artifactId) asset.artifactId = artifactId;
                }
                if (candidate.element instanceof Element) {
                    candidate.element.setAttribute('data-cgpt-export-asset-id', asset.id);
                    annotatedElements.push(candidate.element);
                }
            }

            return { assets, annotatedElements, nextSequence: sequence };
        }

        async discoverConversationAssets(logicalIndex, pair, options = {}) {
            const user = await this.discoverMessageAssets(pair.userElement, logicalIndex, 'user', 0, options);
            const assistant = await this.discoverMessageAssets(
                pair.assistantElement,
                logicalIndex,
                'assistant',
                user.nextSequence,
                options,
            );
            return {
                assets: [...user.assets, ...assistant.assets],
                annotatedElements: [...user.annotatedElements, ...assistant.annotatedElements],
            };
        }

        annotateExportCloneMetrics(source, clone) {
            if (!(source instanceof Element) || !(clone instanceof Element)) return;
            const sourceImages = [...source.querySelectorAll('img')];
            const cloneImages = [...clone.querySelectorAll('img')];
            for (let index = 0; index < Math.min(sourceImages.length, cloneImages.length); index += 1) {
                const original = sourceImages[index];
                const copy = cloneImages[index];
                try {
                    const rect = original.getBoundingClientRect();
                    const style = getComputedStyle(original);
                    copy.setAttribute('data-cgpt-render-width', String(Math.round(rect.width || 0)));
                    copy.setAttribute('data-cgpt-render-height', String(Math.round(rect.height || 0)));
                    copy.setAttribute('data-cgpt-render-display', style.display || '');
                    const parentStyle = original.parentElement ? getComputedStyle(original.parentElement) : null;
                    if (parentStyle) copy.setAttribute('data-cgpt-parent-display', parentStyle.display || '');
                } catch { }
            }
        }

        classifyExportImage(image) {
            if (!(image instanceof HTMLImageElement)) return;
            const src = String(image.getAttribute('src') || image.getAttribute('data-src') || '');
            const signal = [
                image.className, image.getAttribute('data-testid'), image.getAttribute('alt'), image.getAttribute('title'),
                image.getAttribute('aria-label'), src,
            ].filter(Boolean).join(' ').toLowerCase();
            const width = Number.parseFloat(image.getAttribute('data-cgpt-render-width') || image.getAttribute('width') || '') || 0;
            const height = Number.parseFloat(image.getAttribute('data-cgpt-render-height') || image.getAttribute('height') || '') || 0;
            const renderedSmall = width > 0 && height > 0 && width <= 80 && height <= 80;
            const tinyOrIconAspect = renderedSmall && Math.max(width, height) / Math.max(1, Math.min(width, height)) <= 2.2;
            const iconSignal = /favicon|site[-_ ]?icon|domain[-_ ]?icon|source[-_ ]?icon|avatar|emoji|logo|icon\b|\/favicon(?:\.ico|\/|\?)/i.test(signal);
            const nearText = Boolean(image.closest('a,span,p,li,div')?.textContent?.trim());
            const linkedExternalSite = Boolean(image.closest('a[href^="http"]')) && renderedSmall;
            const isInlineIcon = iconSignal || linkedExternalSite || (tinyOrIconAspect && nearText && !/generated|preview|photo|diagram|chart|screenshot/i.test(signal));
            image.removeAttribute('data-cgpt-render-width');
            image.removeAttribute('data-cgpt-render-height');
            image.removeAttribute('data-cgpt-render-display');
            image.removeAttribute('data-cgpt-parent-display');
            if (isInlineIcon) {
                image.className = /emoji/i.test(signal) ? 'inline-site-icon emoji-image' : 'inline-site-icon';
                image.setAttribute('width', String(Math.min(24, width || 18)));
                image.setAttribute('height', String(Math.min(24, height || 18)));
                image.setAttribute('data-cgpt-export-presentation', 'inline-icon');
                const holder = image.parentElement;
                if (holder && /^(A|SPAN|DIV)$/.test(holder.tagName)) {
                    holder.classList.add('inline-icon-holder');
                    const row = holder.parentElement;
                    if (row && /^(DIV|LI|P|A)$/.test(row.tagName) && row.children.length <= 6 && row.textContent?.trim()) {
                        row.classList.add('icon-text-row');
                    }
                }
            } else {
                image.className = 'content-image';
                image.removeAttribute('data-cgpt-export-presentation');
                if (width && width < 120) image.removeAttribute('width');
                if (height && height < 120) image.removeAttribute('height');
            }
        }

        sanitizeExportHtmlClone(clone) {
            if (!(clone instanceof Element)) return;

            for (const image of clone.querySelectorAll('img')) this.classifyExportImage(image);

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
                    const preserve = name === 'data-cgpt-export-asset-id' || name === 'data-cgpt-export-presentation' ||
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
                } else if (element.classList.contains('inline-site-icon')) {
                    element.className = element.classList.contains('emoji-image') ? 'inline-site-icon emoji-image' : 'inline-site-icon';
                } else if (element.classList.contains('content-image')) {
                    element.className = 'content-image';
                } else if (element.classList.contains('inline-icon-holder')) {
                    element.className = 'inline-icon-holder';
                } else if (element.classList.contains('icon-text-row')) {
                    element.className = 'icon-text-row';
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
            this.annotateExportCloneMetrics(source, clone);
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

        async captureConversationPair(logicalIndex, pair, options = {}) {
            if (!pair) return null;
            const assetCapture = await this.discoverConversationAssets(logicalIndex, pair, options);
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

        async loadSingleConversation(logicalIndex, signal, options = {}) {
            if (this.conversationArchive.has(logicalIndex)) {
                return this.conversationArchive.get(logicalIndex);
            }
            const retries = Math.max(0, Number(this.config.conversationLoadRetryCount) || 0);
            for (let attempt = 0; attempt <= retries; attempt += 1) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                this.activateOfficialConversationButton(logicalIndex);
                const pair = await this.waitForConversationPair(logicalIndex, signal);
                const archive = await this.captureConversationPair(logicalIndex, pair, options);
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

            // “加载全部”只允许官方问答导航切换和被动 DOM/API 读取。
            // 防御性隔离任何非用户触发的 a[download]、文件 URL 和 window.open 下载。
            const downloadQuarantine = this.installAutomatedDownloadQuarantine(this.conversationLoadMode);

            const task = (async () => {
                const loaded = [];
                const failed = [];
                try {
                    await this.waitForOfficialConversationButtonsStable(signal);
                    for (const logicalIndex of uniqueIndices) {
                        if (signal.aborted || runId !== this.conversationLoadRunId) {
                            throw new DOMException('Aborted', 'AbortError');
                        }
                        const archive = await this.loadSingleConversation(logicalIndex, signal, {
                            allowInteractiveProbe: false,
                            sourceMode: this.conversationLoadMode,
                        });
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
                    const quarantineStats = downloadQuarantine?.restore?.() || null;
                    if (runId === this.conversationLoadRunId) {
                        this.conversationLoadAbortController = null;
                        this.conversationLoadPromise = null;
                        this.conversationLoadMode = '';
                        this.scheduleConversationRebuild(0);
                        if (quarantineStats?.blocked) {
                            this.updateConversationArchiveUi(`安全拦截 ${quarantineStats.blocked} 次自动下载；加载内容已保留`);
                        }
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
            const assets = (Array.isArray(archive?.assets) ? archive.assets : [])
                .filter((asset) => asset?.presentation !== 'inline-icon' && asset?.kind !== 'inline-icon');
            if (!assets.length) return '';
            const cards = assets.map((asset) => {
                const local = assetPathMap.get(asset.id);
                const reference = local || this.getAssetFallbackReference(asset);
                const { filename, mime, sizeLabel } = this.getAssetDisplayMetadata(asset);
                const label = this.escapeHtml(asset.label || filename || '附件');
                const meta = [mime, sizeLabel].filter(Boolean).map((value) => this.escapeHtml(value)).join(' · ');
                const status = local ? '已归档' : reference ? '外部链接' : '未能获取';
                const isImage = /image|canvas|svg/i.test(asset.kind || '') || String(mime).startsWith('image/');
                const isHtmlArtifact = /artifact-html/i.test(asset.kind || '') || /text\/html/i.test(mime) || /\.html?(?:$|[?#])/i.test(reference || filename);
                const icon = isImage ? '图片' : isHtmlArtifact ? 'Artifact' : /artifact/i.test(asset.kind || '') ? '源码' : '文件';
                let preview = '';
                if (local && isImage) {
                    preview = `<a class="asset-preview" href="${this.escapeHtml(reference)}" target="_blank" rel="noopener noreferrer"><img class="content-image" src="${this.escapeHtml(reference)}" alt="${label}" loading="lazy" decoding="async"></a>`;
                } else if (local && isHtmlArtifact) {
                    preview = `<iframe class="artifact-frame asset-artifact-preview" src="${this.escapeHtml(reference)}" title="${label}" sandbox="allow-scripts allow-forms allow-modals allow-popups" loading="lazy"></iframe>`;
                }
                const main = reference
                    ? `<a class="asset-link" href="${this.escapeHtml(reference)}" target="_blank" rel="noopener noreferrer"${local ? ' download' : ''}>${label}</a>`
                    : `<span class="asset-link asset-unavailable">${label}</span>`;
                return `<li class="asset-card ${isImage ? 'asset-image' : ''} ${isHtmlArtifact ? 'asset-artifact' : ''}">
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
  .message-content img.content-image,.message-content img:not(.inline-site-icon),.asset-preview img{display:block;max-width:100%;height:auto;margin:1em auto;border-radius:10px;object-fit:contain}
  .message-content img.inline-site-icon,.message-content a img.inline-site-icon{display:inline-block!important;flex:0 0 auto;width:1.08em!important;height:1.08em!important;min-width:1.08em!important;min-height:1.08em!important;max-width:1.08em!important;max-height:1.08em!important;margin:0 .34em 0 0!important;padding:0!important;border:0;border-radius:3px;vertical-align:-.16em;object-fit:contain;box-shadow:none;background:transparent}
  .message-content img.inline-site-icon.emoji-image{width:1.18em!important;height:1.18em!important;max-width:1.18em!important;max-height:1.18em!important;margin-inline-end:.15em!important;border-radius:0}
  .message-content .inline-icon-holder{display:inline-flex!important;flex:0 0 auto;align-items:center;line-height:1;vertical-align:middle;width:auto!important;min-width:0!important}.message-content .icon-text-row{display:flex!important;align-items:flex-start;gap:.42em;min-width:0}.message-content .icon-text-row>*{min-width:0}.message-content p.icon-text-row,.message-content li.icon-text-row{margin-block:.55em}
  .message-content video,.message-content audio{max-width:100%}
  .artifact-frame,.message-content iframe{display:block;width:100%;min-height:min(68vh,720px);margin:1em 0;border:1px solid var(--border);border-radius:11px;background:#fff}
  .message-content details{margin:.8em 0;padding:.65em .8em;border:1px solid var(--border);border-radius:9px;background:var(--surface-soft)}.message-content summary{cursor:pointer;font-weight:650}
  .math-display{display:block;max-width:100%;overflow:auto;padding:.55em 0;text-align:center}.math-inline{display:inline}.math math{font-size:1.05em}
  .inline-attachment{display:inline-flex;align-items:center;gap:6px;padding:.45em .65em;border:1px solid var(--border);border-radius:8px;background:var(--surface-soft);text-decoration:none}
  .assets{margin:16px 0 0;padding:16px 18px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}.assets h4{margin:0 0 12px;font-size:14px}
  .asset-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:10px;list-style:none;margin:0;padding:0}.asset-card{display:flex;min-width:0;gap:11px;padding:11px;border:1px solid var(--border);border-radius:10px;background:var(--surface-soft)}
  .asset-card.asset-image,.asset-card.asset-artifact{display:block}.asset-preview{display:block;margin-bottom:9px}.asset-preview img{width:100%;max-height:280px;margin:0;background:var(--surface);object-fit:contain}.asset-artifact-preview{min-height:360px;max-height:72vh;margin:0 0 10px}.asset-card-body{min-width:0}.asset-badge{display:inline-block;margin:0 7px 4px 0;padding:2px 6px;border-radius:5px;background:var(--accent-soft);color:var(--accent);font-size:10px;font-weight:750;letter-spacing:.04em}
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

        getAssetRouteKey(rawUrl) {
            let parsed;
            try { parsed = new URL(this.normalizeAssetCandidateUrl(rawUrl), location.href); } catch { return ''; }
            if (parsed.origin !== location.origin || !/\/backend-api\//i.test(parsed.pathname)) return '';
            let path = parsed.pathname;
            const replacements = [
                [/\/backend-api\/files\/download\/[^/]+/i, '/backend-api/files/download/:fileId'],
                [/\/backend-api\/files\/[^/]+\/download/i, '/backend-api/files/:fileId/download'],
                [/\/backend-api\/files\/[^/]+\/content/i, '/backend-api/files/:fileId/content'],
                [/\/backend-api\/files\/[^/]+\/(?:signed-url|download-url|metadata)/i, (match) => match.replace(/\/files\/[^/]+\//i, '/files/:fileId/')],
                [/\/backend-api\/files\/[^/]+/i, '/backend-api/files/:fileId'],
                [/\/backend-api\/file\/[^/]+\/download/i, '/backend-api/file/:fileId/download'],
                [/\/backend-api\/conversation\/[^/]+\/(?:files|attachments)\/[^/]+(?:\/download)?/i,
                    (match) => match.replace(/\/conversation\/[^/]+\//i, '/conversation/:conversationId/').replace(/\/(files|attachments)\/[^/]+/i, '/$1/:fileId')],
                [/\/backend-api\/artifacts?\/[^/]+(?:\/download)?/i,
                    (match) => match.replace(/\/artifacts?\/[^/]+/i, (part) => part.startsWith('/artifacts/') ? '/artifacts/:artifactId' : '/artifact/:artifactId')],
                [/\/backend-api\/(?:canvas|canmore|textdocs|documents)\/[^/]+(?:\/content|\/download)?/i,
                    (match) => match.replace(/\/(canvas|canmore|textdocs|documents)\/[^/]+/i, '/$1/:artifactId')],
                [/\/backend-api\/conversation\/[^/]+\/(?:artifacts|canvas)\/[^/]+/i,
                    (match) => match.replace(/\/conversation\/[^/]+\//i, '/conversation/:conversationId/').replace(/\/(artifacts|canvas)\/[^/]+/i, '/$1/:artifactId')],
            ];
            for (const [pattern, replacement] of replacements) {
                if (pattern.test(path)) {
                    path = path.replace(pattern, replacement);
                    return `${parsed.origin}${path}`;
                }
            }
            return '';
        }

        getAssetRoutePriority(url) {
            const key = this.getAssetRouteKey(url);
            if (!key) return 100;
            const stats = this.assetRouteStats.get(key);
            if (!stats) return 20;
            if (stats.successes > 0) return Math.max(0, 4 - Math.min(4, stats.successes));
            if (stats.blockedUntil > Date.now()) return 1000;
            return 20 + Math.min(50, stats.consecutiveFailures * 8);
        }

        isAssetRouteSuppressed(url) {
            const key = this.getAssetRouteKey(url);
            if (!key) return false;
            const stats = this.assetRouteStats.get(key);
            return Boolean(stats?.blockedUntil && stats.blockedUntil > Date.now());
        }

        getAssetErrorStatus(error) {
            const direct = Number(error?.status) || 0;
            if (direct) return direct;
            const match = /HTTP\s+(\d{3})/i.exec(String(error?.message || error || ''));
            return Number(match?.[1]) || 0;
        }

        recordAssetRouteResult(url, success, error = null, elapsedMs = 0) {
            const key = this.getAssetRouteKey(url);
            if (!key) return;
            const now = Date.now();
            const stats = this.assetRouteStats.get(key) || {
                successes: 0,
                failures: 0,
                consecutiveFailures: 0,
                blockedUntil: 0,
                averageMs: 0,
            };
            const elapsed = Math.max(0, Number(elapsedMs) || 0);
            if (success) {
                stats.successes += 1;
                stats.consecutiveFailures = 0;
                stats.blockedUntil = 0;
                stats.averageMs = stats.averageMs ? stats.averageMs * 0.7 + elapsed * 0.3 : elapsed;
            } else {
                stats.failures += 1;
                stats.consecutiveFailures += 1;
                const status = this.getAssetErrorStatus(error);
                const message = String(error?.message || error || '');
                const routeUnsupported = [405, 501].includes(status);
                const authStatus = status === 401;
                const fileSpecificStatus = [400, 403, 404, 410, 422].includes(status);
                const timeoutLike = /timeout|超时|network|failed to fetch|连接/i.test(message);
                const threshold = Math.max(1, Number(this.config.conversationExportRouteTimeoutFailureThreshold) || 2);
                const mayBlockAfterThreshold = stats.successes === 0 && (fileSpecificStatus || timeoutLike);
                if (routeUnsupported || authStatus || (mayBlockAfterThreshold && stats.consecutiveFailures >= threshold)) {
                    const cooldown = Math.max(5000, Number(this.config.conversationExportRouteFailureCooldownMs) || 600000);
                    stats.blockedUntil = now + (authStatus ? Math.min(cooldown, 60000) : cooldown);
                }
            }
            this.assetRouteStats.set(key, stats);
        }

        async enterAssetRouteProbe(url, signal) {
            const key = this.getAssetRouteKey(url);
            if (!key) return { key: '', owner: false, allowed: true, slot: null };
            while (true) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                if (this.isAssetRouteSuppressed(url)) return { key, owner: false, allowed: false, slot: null };
                const stats = this.assetRouteStats.get(key);
                if (stats?.successes > 0) return { key, owner: false, allowed: true, slot: null };
                const existing = this.assetRouteProbePromises.get(key);
                if (!existing) {
                    let resolve;
                    const promise = new Promise((done) => { resolve = done; });
                    const slot = { promise, resolve };
                    this.assetRouteProbePromises.set(key, slot);
                    return { key, owner: true, allowed: true, slot };
                }
                await new Promise((resolve, reject) => {
                    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
                    signal?.addEventListener('abort', onAbort, { once: true });
                    existing.promise.then(resolve, resolve).finally(() => signal?.removeEventListener('abort', onAbort));
                    if (signal?.aborted) onAbort();
                });
            }
        }

        finishAssetRouteProbe(probe, outcome = null) {
            if (!probe?.owner || !probe.key || !probe.slot) return;
            if (this.assetRouteProbePromises.get(probe.key) === probe.slot) {
                this.assetRouteProbePromises.delete(probe.key);
            }
            try { probe.slot.resolve(outcome); } catch { }
        }

        getStableAssetUrlKey(rawUrl) {
            const normalized = this.normalizeAssetCandidateUrl(rawUrl);
            if (!normalized || this.config.conversationExportStableUrlDedupe === false) return normalized;
            if (!/^https?:/i.test(normalized)) return normalized;
            try {
                const parsed = new URL(normalized, location.href);
                const volatileNames = /^(?:token|sig|signature|expires?|expiry|policy|key-pair-id|x-amz-.+|x-goog-.+|response-content-disposition|download|auth|jwt)$/i;
                const hadVolatile = [...parsed.searchParams.keys()].some((key) => volatileNames.test(key));
                if (!hadVolatile) return parsed.href;
                for (const key of [...parsed.searchParams.keys()]) {
                    if (volatileNames.test(key)) parsed.searchParams.delete(key);
                }
                parsed.hash = '';
                return parsed.href;
            } catch {
                return normalized;
            }
        }

        isUsableDirectAssetUrl(rawUrl) {
            const url = this.normalizeAssetCandidateUrl(rawUrl);
            if (!url || /^(?:sandbox|artifact|canvas|canmore|textdoc|document|file-service|sediment):/i.test(url)) return false;
            if (/^(?:data|blob):/i.test(url)) return true;
            if (!/^https?:/i.test(url)) return false;
            try {
                const parsed = new URL(url, location.href);
                if (parsed.origin !== location.origin) return true;
                return /(?:\/download(?:[/?#]|$)|\/files?\/|\/attachments?\/|\/artifacts?\/|\.[a-z0-9]{2,10}(?:[?#]|$))/i.test(parsed.href);
            } catch {
                return false;
            }
        }

        shouldTryAlternateAssetMethod(error, method, sameOrigin) {
            if (sameOrigin) return false;
            const status = this.getAssetErrorStatus(error);
            if (status) return false;
            const message = String(error?.message || error || '');
            if (method === 'gm') {
                if (this.config.conversationExportCrossOriginFallbackAfterGmFailure === true) return true;
                return /GM_xmlhttpRequest 不可用|无法识别的二进制类型/i.test(message);
            }
            return /Failed to fetch|NetworkError|CORS|Load failed|TypeError/i.test(message);
        }

        async fetchAssetWithPageFetch(url, signal, options = null) {
            const normalized = this.normalizeAssetCandidateUrl(url);
            const controller = new AbortController();
            const connectTimeoutMs = Math.max(1200, Number(this.config.conversationExportAssetHeaderTimeoutMs) || 3800);
            const idleTimeoutMs = Math.max(connectTimeoutMs, Number(this.config.conversationExportAssetIdleTimeoutMs) || 30000);
            const hardTimeoutMs = Math.max(idleTimeoutMs, Number(this.config.conversationExportAssetHardTimeoutMs) || 600000);
            const abort = () => controller.abort();
            signal?.addEventListener('abort', abort, { once: true });
            let connectTimer = 0;
            let idleTimer = 0;
            let hardTimer = 0;
            const clearTimers = () => {
                window.clearTimeout(connectTimer);
                window.clearTimeout(idleTimer);
                window.clearTimeout(hardTimer);
            };
            const resetIdleTimer = () => {
                window.clearTimeout(idleTimer);
                idleTimer = window.setTimeout(() => controller.abort('idle-timeout'), idleTimeoutMs);
            };
            try {
                const headers = { Accept: '*/*' };
                let sameOrigin = false;
                let backendApi = false;
                try {
                    const parsed = new URL(normalized, location.href);
                    sameOrigin = parsed.origin === location.origin;
                    backendApi = sameOrigin && /\/backend-api\//.test(parsed.pathname);
                    if (backendApi) {
                        const token = await this.getSessionAccessToken(signal);
                        headers['Oai-Device-Id'] = this.getApiDeviceId();
                        headers['Oai-Language'] = navigator.language || 'zh-CN';
                        if (token) headers.Authorization = `Bearer ${token}`;
                        if (this.apiAccountId) headers['ChatGPT-Account-Id'] = this.apiAccountId;
                    }
                } catch { }

                connectTimer = window.setTimeout(() => controller.abort('connect-timeout'), connectTimeoutMs);
                hardTimer = window.setTimeout(() => controller.abort('hard-timeout'), hardTimeoutMs);
                let response;
                try {
                    response = await fetch(normalized, {
                        method: 'GET',
                        credentials: sameOrigin ? 'include' : 'omit',
                        redirect: 'follow',
                        cache: backendApi ? 'no-store' : 'default',
                        signal: controller.signal,
                        headers,
                    });
                } catch (error) {
                    if (controller.signal.aborted && !signal?.aborted) {
                        const reason = String(controller.signal.reason || '');
                        throw new Error(reason.includes('connect') ? '附件连接超时' : reason.includes('hard') ? '附件下载超过绝对时间上限' : '附件请求被中断');
                    }
                    throw error;
                }
                window.clearTimeout(connectTimer);
                if (!response.ok) {
                    const error = new Error(`HTTP ${response.status}`);
                    error.status = response.status;
                    throw error;
                }
                try { options?.onHeaders?.(response); } catch { }

                const declaredSize = Number(response.headers.get('content-length')) || 0;
                const maxAsset = Math.max(1, Number(this.config.conversationExportMaxAssetBytes) || 0);
                if (declaredSize && declaredSize > maxAsset) {
                    throw new Error(`附件超过大小限制（${Math.round(declaredSize / 1024 / 1024)} MiB）`);
                }

                const contentType = response.headers.get('content-type') || '';
                let blob;
                if (response.body && typeof response.body.getReader === 'function') {
                    const reader = response.body.getReader();
                    const chunks = [];
                    let loaded = 0;
                    resetIdleTimer();
                    try {
                        while (true) {
                            let packet;
                            try { packet = await reader.read(); }
                            catch (error) {
                                if (controller.signal.aborted && !signal?.aborted) throw new Error('附件传输长时间没有进展');
                                throw error;
                            }
                            if (packet.done) break;
                            if (packet.value?.byteLength) {
                                loaded += packet.value.byteLength;
                                if (loaded > maxAsset) throw new Error(`附件超过大小限制（>${Math.round(maxAsset / 1024 / 1024)} MiB）`);
                                chunks.push(packet.value);
                                resetIdleTimer();
                            }
                        }
                    } finally {
                        window.clearTimeout(idleTimer);
                        try { reader.releaseLock?.(); } catch { }
                    }
                    blob = new Blob(chunks, { type: contentType || 'application/octet-stream' });
                } else {
                    resetIdleTimer();
                    try { blob = await response.blob(); }
                    finally { window.clearTimeout(idleTimer); }
                }
                return {
                    blob,
                    finalUrl: response.url || normalized,
                    contentType,
                    contentDisposition: response.headers.get('content-disposition') || '',
                };
            } finally {
                clearTimers();
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
                let request = null;
                let connected = false;
                let connectTimer = 0;
                let idleTimer = 0;
                let hardTimer = 0;
                const connectTimeoutMs = Math.max(1200, Number(this.config.conversationExportAssetHeaderTimeoutMs) || 3800);
                const idleTimeoutMs = Math.max(connectTimeoutMs, Number(this.config.conversationExportAssetIdleTimeoutMs) || 30000);
                const hardTimeoutMs = Math.max(idleTimeoutMs, Number(this.config.conversationExportAssetHardTimeoutMs) || 600000);
                const clearTimers = () => {
                    window.clearTimeout(connectTimer);
                    window.clearTimeout(idleTimer);
                    window.clearTimeout(hardTimer);
                };
                const finish = (callback, value) => {
                    if (settled) return;
                    settled = true;
                    clearTimers();
                    signal?.removeEventListener('abort', onAbort);
                    callback(value);
                };
                const abortWith = (message) => {
                    if (settled) return;
                    const currentRequest = request;
                    finish(reject, new Error(message));
                    try { currentRequest?.abort?.(); } catch { }
                };
                const markConnected = () => {
                    if (!connected) {
                        connected = true;
                        window.clearTimeout(connectTimer);
                    }
                    window.clearTimeout(idleTimer);
                    idleTimer = window.setTimeout(() => abortWith('附件传输长时间没有进展'), idleTimeoutMs);
                };
                const onAbort = () => {
                    if (settled) return;
                    const currentRequest = request;
                    finish(reject, new DOMException('Aborted', 'AbortError'));
                    try { currentRequest?.abort?.(); } catch { }
                };

                connectTimer = window.setTimeout(() => abortWith('附件连接超时'), connectTimeoutMs);
                hardTimer = window.setTimeout(() => abortWith('附件下载超过绝对时间上限'), hardTimeoutMs);
                request = GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: this.config.conversationExportGmPreferBlobResponse === false ? 'arraybuffer' : 'blob',
                    timeout: hardTimeoutMs,
                    anonymous: false,
                    headers: { Accept: '*/*' },
                    onreadystatechange: (response) => {
                        if (Number(response?.readyState) >= 2) markConnected();
                    },
                    onprogress: () => markConnected(),
                    onload: (response) => {
                        markConnected();
                        const status = Number(response.status) || 0;
                        if (status && (status < 200 || status >= 300)) {
                            const error = new Error(`HTTP ${status}`);
                            error.status = status;
                            finish(reject, error);
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
                    onerror: (response) => {
                        const status = Number(response?.status) || 0;
                        const error = new Error(`跨域附件请求失败${status ? `：HTTP ${status}` : ''}`);
                        if (status) error.status = status;
                        finish(reject, error);
                    },
                    ontimeout: () => finish(reject, new Error('附件下载超过绝对时间上限')),
                    onabort: () => {
                        if (!settled) finish(reject, new DOMException('Aborted', 'AbortError'));
                    },
                });
                signal?.addEventListener('abort', onAbort, { once: true });
                if (signal?.aborted) onAbort();
            });
        }

        async unwrapAssetDownloadResponse(result, asset, signal, visitedUrls, sourceUrl = '', options = null) {
            const contentType = String(result?.contentType || result?.blob?.type || '').toLowerCase();
            const finalUrl = this.normalizeAssetCandidateUrl(result?.finalUrl || sourceUrl || '');
            const profile = this.getExpectedAssetProfile(asset);
            const expectedJson = profile.extension === 'json' || /application\/json/.test(profile.mimeType);
            const mayBeJson = contentType.includes('json') || (!contentType && result?.blob?.size <= 1024 * 1024);
            if (mayBeJson && result?.blob?.size <= 2 * 1024 * 1024) {
                let text = '';
                try { text = await result.blob.text(); } catch { }
                const trimmed = text.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                        const data = JSON.parse(trimmed);
                        const metadata = this.extractDownloadMetadataFromJson(data);
                        if (metadata?.downloadUrl && !metadata.preview) {
                            const normalized = this.normalizeAssetCandidateUrl(metadata.downloadUrl);
                            if (normalized && !visitedUrls.has(normalized)) {
                                const nested = await this.fetchBinaryAssetCandidates([normalized], {
                                    ...asset,
                                    originalFilename: metadata.filename || asset?.originalFilename || '',
                                    originalMimeType: metadata.mimeType || asset?.originalMimeType || '',
                                    expectedSize: metadata.size || asset?.expectedSize || 0,
                                    originalUrls: [...new Set([...(asset?.originalUrls || []), normalized])],
                                }, signal, visitedUrls, options);
                                if (!nested.resolvedFilename) nested.resolvedFilename = metadata.filename || '';
                                return nested;
                            }
                        }
                        const apiError = data?.detail || data?.error?.message || data?.message;
                        if (apiError && !expectedJson) throw new Error(String(apiError));
                        if (!expectedJson) throw new Error('文件端点返回 JSON 元数据，但没有可用的原文件下载地址');
                    } catch (error) {
                        if (error instanceof SyntaxError) {
                            // JSON 探测失败时继续进行文件头校验。
                        } else {
                            throw error;
                        }
                    }
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
                if (/\.[a-z0-9]{1,12}$/i.test(part)) urlName = part;
            } catch { }
            const validated = await this.validateDownloadedAsset({ ...result, resolvedFilename: dispositionName || urlName || '' }, asset, sourceUrl || finalUrl, options);
            return { ...validated, resolvedFilename: dispositionName || urlName || asset?.originalFilename || '' };
        }

        getAssetFilenameExtension(value) {
            const match = /\.([a-z0-9]{1,12})$/i.exec(String(value || '').split(/[?#]/)[0].trim());
            return match ? match[1].toLowerCase() : '';
        }

        normalizeAssetExtension(extension) {
            const ext = String(extension || '').toLowerCase().replace(/^\./, '');
            const aliases = { jpeg: 'jpg', jpe: 'jpg', tif: 'tiff', htm: 'html', markdown: 'md', tgz: 'gz' };
            return aliases[ext] || ext;
        }

        isPreviewAssetUrl(rawUrl) {
            const url = this.normalizeAssetCandidateUrl(rawUrl);
            if (!url) return false;
            if (/^(?:blob|data):/i.test(url)) return false;
            try {
                const parsed = new URL(url, location.href);
                if (/(?:^|\/)(?:thumbnail|thumb|preview|rendition|render|resize|cropped?|image-proxy|proxy-image)(?:\/|$)/i.test(parsed.pathname)) return true;
                if (/\/_next\/image(?:\/|$)/i.test(parsed.pathname) || /\/cdn-cgi\/image(?:\/|$)/i.test(parsed.pathname)) return true;
                const previewKeys = /^(?:w|width|h|height|q|quality|fit|crop|resize|dpr|thumb|thumbnail|preview|fm|format|auto)$/i;
                if ([...parsed.searchParams.keys()].some((key) => previewKeys.test(key))) return true;
                const disposition = parsed.searchParams.get('response-content-disposition') || parsed.searchParams.get('content-disposition') || '';
                if (/\binline\b/i.test(disposition)) return true;
            } catch { }
            return false;
        }

        isExplicitOriginalAssetUrl(rawUrl, asset = null) {
            const url = this.normalizeAssetCandidateUrl(rawUrl);
            if (!url) return false;
            if ((asset?.originalUrls || []).map((item) => this.normalizeAssetCandidateUrl(item)).includes(url)) return true;
            if (this.isPreviewAssetUrl(url)) return false;
            if (/^(?:data|blob):/i.test(url)) return !asset?.fileId;
            try {
                const parsed = new URL(url, location.href);
                if (/\/backend-api\/(?:files\/download\/[^/]+|files\/[^/]+\/(?:download|content)|file\/[^/]+\/download)(?:[/?#]|$)/i.test(parsed.href)) return true;
                if (/(?:^|\/)(?:download|original)(?:[/?#]|$)/i.test(parsed.pathname)) return true;
                const disposition = parsed.searchParams.get('response-content-disposition') || parsed.searchParams.get('content-disposition') || '';
                if (/\battachment\b/i.test(disposition)) return true;
                if (/^(?:1|true|yes)$/i.test(parsed.searchParams.get('download') || parsed.searchParams.get('dl') || '')) return true;
                const expectedExt = this.normalizeAssetExtension(this.getAssetFilenameExtension(asset?.originalFilename || asset?.filenameHint || ''));
                const urlExt = this.normalizeAssetExtension(this.getAssetFilenameExtension(parsed.pathname));
                // 存在 file_id 时，单凭 URL 后缀不足以证明它是原文件；页面预览地址也常带原扩展名。
                if (!asset?.fileId && urlExt && (!expectedExt || urlExt === expectedExt)) return true;
            } catch { }
            return false;
        }

        getExpectedAssetProfile(asset = null) {
            const filename = this.sanitizeAssetFilename(asset?.originalFilename || asset?.filenameHint || asset?.label || '', 'asset');
            const extension = this.normalizeAssetExtension(this.getAssetFilenameExtension(filename));
            const mimeType = String(asset?.originalMimeType || asset?.mimeType || '').split(';')[0].trim().toLowerCase();
            const expectedSize = Number(asset?.expectedSize || 0) || 0;
            const kind = String(asset?.kind || '').toLowerCase();
            return { filename, extension, mimeType, expectedSize, kind };
        }

        async sniffDownloadedBlob(blob) {
            const maxProbe = Math.max(64 * 1024, Number(this.config.conversationExportSignatureProbeBytes) || 2 * 1024 * 1024);
            const firstSize = Math.min(blob.size, maxProbe);
            const first = new Uint8Array(await blob.slice(0, firstSize).arrayBuffer());
            let tail = first;
            if (blob.size > firstSize) {
                const tailSize = Math.min(blob.size, maxProbe);
                tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - tailSize)).arrayBuffer());
            }
            const starts = (...values) => values.every((value, index) => first[index] === value);
            const latin1Decoder = new TextDecoder('latin1');
            const ascii = (bytes, start = 0, length = bytes.length - start) => {
                const end = Math.min(bytes.length, start + length);
                return latin1Decoder.decode(bytes.subarray(start, end));
            };
            const prefix = ascii(first, 0, Math.min(first.length, 8192));
            const trimmed = prefix.replace(/^\uFEFF/, '').trimStart();
            const result = { type: 'binary', extension: '', mimeType: '', container: '', textKind: '', signature: '' };
            if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return { ...result, type: 'pdf', extension: 'pdf', mimeType: 'application/pdf', signature: 'PDF' };
            if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ...result, type: 'image', extension: 'png', mimeType: 'image/png', signature: 'PNG' };
            if (starts(0xff, 0xd8, 0xff)) return { ...result, type: 'image', extension: 'jpg', mimeType: 'image/jpeg', signature: 'JPEG' };
            if (/^GIF8[79]a/.test(prefix)) return { ...result, type: 'image', extension: 'gif', mimeType: 'image/gif', signature: 'GIF' };
            if (/^RIFF/.test(prefix) && ascii(first, 8, 4) === 'WEBP') return { ...result, type: 'image', extension: 'webp', mimeType: 'image/webp', signature: 'WEBP' };
            if (/^RIFF/.test(prefix) && ascii(first, 8, 4) === 'WAVE') return { ...result, type: 'audio', extension: 'wav', mimeType: 'audio/wav', signature: 'WAV' };
            if (starts(0x42, 0x4d)) return { ...result, type: 'image', extension: 'bmp', mimeType: 'image/bmp', signature: 'BMP' };
            if (starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a)) return { ...result, type: 'image', extension: 'tiff', mimeType: 'image/tiff', signature: 'TIFF' };
            if (starts(0x00, 0x00, 0x01, 0x00)) return { ...result, type: 'image', extension: 'ico', mimeType: 'image/x-icon', signature: 'ICO' };
            if (starts(0x1f, 0x8b)) return { ...result, type: 'archive', extension: 'gz', mimeType: 'application/gzip', signature: 'GZIP' };
            if (starts(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c)) return { ...result, type: 'archive', extension: '7z', mimeType: 'application/x-7z-compressed', signature: '7Z' };
            if (/^Rar!\x1a\x07/.test(prefix)) return { ...result, type: 'archive', extension: 'rar', mimeType: 'application/vnd.rar', signature: 'RAR' };
            if (starts(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return { ...result, type: 'ole', extension: 'ole', mimeType: 'application/x-ole-storage', signature: 'OLE' };
            if (/^OggS/.test(prefix)) return { ...result, type: 'audio', extension: 'ogg', mimeType: 'audio/ogg', signature: 'OGG' };
            if (/^fLaC/.test(prefix)) return { ...result, type: 'audio', extension: 'flac', mimeType: 'audio/flac', signature: 'FLAC' };
            if (/^ID3/.test(prefix) || (first[0] === 0xff && (first[1] & 0xe0) === 0xe0)) return { ...result, type: 'audio', extension: 'mp3', mimeType: 'audio/mpeg', signature: 'MP3' };
            if (first.length >= 12 && ascii(first, 4, 4) === 'ftyp') return { ...result, type: 'video', extension: 'mp4', mimeType: 'video/mp4', signature: 'ISO-BMFF' };
            if (starts(0x1a, 0x45, 0xdf, 0xa3)) return { ...result, type: 'video', extension: 'webm', mimeType: 'video/webm', signature: 'EBML' };
            if (/^SQLite format 3\x00/.test(prefix)) return { ...result, type: 'database', extension: 'sqlite', mimeType: 'application/vnd.sqlite3', signature: 'SQLite' };
            if (starts(0x50, 0x4b, 0x03, 0x04) || starts(0x50, 0x4b, 0x05, 0x06) || starts(0x50, 0x4b, 0x07, 0x08)) {
                const zipText = `${ascii(first)}\n${tail === first ? '' : ascii(tail)}`;
                if (/(?:^|\W)word\//.test(zipText) || /word\/document\.xml/.test(zipText)) return { ...result, type: 'office', extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', container: 'zip', signature: 'OOXML-DOCX' };
                if (/(?:^|\W)xl\//.test(zipText) || /xl\/workbook\.xml/.test(zipText)) return { ...result, type: 'office', extension: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', container: 'zip', signature: 'OOXML-XLSX' };
                if (/(?:^|\W)ppt\//.test(zipText) || /ppt\/presentation\.xml/.test(zipText)) return { ...result, type: 'office', extension: 'pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', container: 'zip', signature: 'OOXML-PPTX' };
                if (/mimetypeapplication\/vnd\.oasis\.opendocument\.text/.test(zipText)) return { ...result, type: 'office', extension: 'odt', mimeType: 'application/vnd.oasis.opendocument.text', container: 'zip', signature: 'ODT' };
                if (/mimetypeapplication\/vnd\.oasis\.opendocument\.spreadsheet/.test(zipText)) return { ...result, type: 'office', extension: 'ods', mimeType: 'application/vnd.oasis.opendocument.spreadsheet', container: 'zip', signature: 'ODS' };
                if (/mimetypeapplication\/vnd\.oasis\.opendocument\.presentation/.test(zipText)) return { ...result, type: 'office', extension: 'odp', mimeType: 'application/vnd.oasis.opendocument.presentation', container: 'zip', signature: 'ODP' };
                return { ...result, type: 'archive', extension: 'zip', mimeType: 'application/zip', container: 'zip', signature: 'ZIP' };
            }
            const nulCount = first.slice(0, Math.min(first.length, 4096)).reduce((count, byte) => count + (byte === 0 ? 1 : 0), 0);
            const likelyText = first.length === 0 || nulCount < Math.max(2, Math.min(first.length, 4096) * 0.01);
            if (likelyText) {
                if (/^<!doctype\s+html|^<html\b|<body\b|<title\b/i.test(trimmed)) return { ...result, type: 'text', extension: 'html', mimeType: 'text/html', textKind: 'html', signature: 'HTML' };
                if (/^[{[]/.test(trimmed)) {
                    try { JSON.parse(new TextDecoder().decode(first)); return { ...result, type: 'text', extension: 'json', mimeType: 'application/json', textKind: 'json', signature: 'JSON' }; } catch { }
                }
                if (/^<\?xml\b|^<svg\b/i.test(trimmed)) {
                    const svg = /^<svg\b/i.test(trimmed);
                    return { ...result, type: svg ? 'image' : 'text', extension: svg ? 'svg' : 'xml', mimeType: svg ? 'image/svg+xml' : 'application/xml', textKind: svg ? 'svg' : 'xml', signature: svg ? 'SVG' : 'XML' };
                }
                return { ...result, type: 'text', extension: 'txt', mimeType: 'text/plain', textKind: 'plain', signature: 'TEXT' };
            }
            return result;
        }

        assetExtensionsCompatible(expected, actual, sniff) {
            const exp = this.normalizeAssetExtension(expected);
            const act = this.normalizeAssetExtension(actual);
            if (!exp || !act || act === 'bin') return true;
            if (exp === act) return true;
            const groups = [
                new Set(['jpg', 'jpeg']), new Set(['tif', 'tiff']),
                new Set(['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp']),
                new Set(['txt', 'md', 'csv', 'tsv', 'yaml', 'yml', 'xml', 'json', 'html', 'css', 'js', 'ts', 'py', 'sql']),
                new Set(['mp4', 'm4v', 'mov']),
            ];
            if (groups.some((group) => group.has(exp) && group.has(act))) {
                if (['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'].includes(exp) && sniff?.extension && sniff.extension !== 'zip') return sniff.extension === exp;
                return true;
            }
            if (['doc', 'xls', 'ppt'].includes(exp) && sniff?.extension === 'ole') return true;
            return false;
        }

        async validateDownloadedAsset(result, asset, sourceUrl = '', options = null) {
            if (this.config.conversationExportValidateOriginalAssets === false) return { ...result, validation: { verified: false, reason: 'disabled' } };
            const strictOriginal = options?.strictOriginal !== false && this.config.conversationExportRequireOriginalAssets !== false;
            const profile = this.getExpectedAssetProfile(asset);
            const sniff = await this.sniffDownloadedBlob(result.blob);
            const resultName = this.parseContentDispositionFilename(result.contentDisposition) || result.resolvedFilename || '';
            const resultExt = this.normalizeAssetExtension(this.getAssetFilenameExtension(resultName));
            const expectedExt = profile.extension || this.normalizeAssetExtension(this.getMimeExtension(profile.mimeType));
            const actualExt = sniff.extension || resultExt || this.normalizeAssetExtension(this.getMimeExtension(result.contentType || result.blob.type));
            const artifactHtml = /artifact|canvas|html/.test(profile.kind) || expectedExt === 'html' || /text\/html/.test(profile.mimeType);
            if (!artifactHtml && sniff.textKind === 'html') throw new Error('附件地址返回的是 HTML 预览页，而不是原文件');
            if (sniff.textKind === 'json' && expectedExt !== 'json' && !/application\/json/.test(profile.mimeType)) {
                throw new Error('附件端点返回的是 JSON 元数据，而不是原文件');
            }
            const expectedIsImage = /^image\//.test(profile.mimeType) || /^(?:png|jpg|gif|webp|avif|svg|bmp|tiff|ico)$/.test(expectedExt) || /image/.test(profile.kind);
            if (!expectedIsImage && sniff.type === 'image' && expectedExt) throw new Error(`下载结果是 ${sniff.signature || '图片'} 预览，不是 ${expectedExt.toUpperCase()} 原文件`);
            if (expectedExt && actualExt && !this.assetExtensionsCompatible(expectedExt, actualExt, sniff)) {
                throw new Error(`文件格式校验失败：期望 ${expectedExt.toUpperCase()}，实际为 ${(actualExt || sniff.signature || '未知').toUpperCase()}`);
            }
            let sizeMatched = null;
            if (profile.expectedSize > 0) {
                const tolerance = Math.max(
                    Number(this.config.conversationExportOriginalSizeToleranceBytes) || 16384,
                    profile.expectedSize * (Number(this.config.conversationExportOriginalSizeToleranceRatio) || 0.015),
                );
                sizeMatched = Math.abs(result.blob.size - profile.expectedSize) <= tolerance;
                if (strictOriginal && !sizeMatched) {
                    throw new Error(`原文件大小校验失败：期望 ${profile.expectedSize} 字节，实际 ${result.blob.size} 字节`);
                }
            }
            if (strictOriginal && asset?.fileId && this.isPreviewAssetUrl(sourceUrl)) {
                throw new Error('候选地址是缩略图或预览地址，已拒绝作为原文件');
            }
            return {
                ...result,
                contentType: sniff.mimeType || result.contentType || result.blob.type || profile.mimeType || '',
                validation: {
                    verified: true,
                    strictOriginal,
                    signature: sniff.signature || '',
                    detectedExtension: actualExt || '',
                    expectedExtension: expectedExt || '',
                    expectedSize: profile.expectedSize || 0,
                    actualSize: result.blob.size,
                    sizeMatched,
                    sourceWasPreview: this.isPreviewAssetUrl(sourceUrl),
                },
            };
        }

        sortAssetCandidateUrls(candidates, asset = null, options = null) {
            const unique = [...new Set((candidates || [])
                .map((value) => this.normalizeAssetCandidateUrl(value))
                .filter(Boolean))];
            const originalKeys = new Set((asset?.originalUrls || []).map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean));
            const strictOriginal = options?.strictOriginal !== false && this.config.conversationExportRequireOriginalAssets !== false;
            const score = (url) => {
                if (strictOriginal && asset?.fileId && this.isPreviewAssetUrl(url)) return 1000;
                if (originalKeys.has(url)) return 0;
                if (/\/backend-api\/files\/download\/[^/]+(?:[/?#]|$)/i.test(url)) return 1;
                if (/\/backend-api\/(?:files\/[^/]+\/download|file\/[^/]+\/download)(?:[/?#]|$)/i.test(url)) return 2;
                if (/\/backend-api\/files\/[^/]+\/content(?:[/?#]|$)/i.test(url)) return 3;
                if (this.isExplicitOriginalAssetUrl(url, asset)) return 4;
                if (/\/backend-api\/files\/[^/]+\/(?:signed-url|download-url)(?:[/?#]|$)/i.test(url)) return 5;
                if (/\/backend-api\/files\/[^/]+(?:[/?#]|$)/i.test(url)) return 6;
                if (/^data:/i.test(url)) return asset?.fileId ? 90 : 7;
                if (/^blob:/i.test(url)) return asset?.fileId ? 91 : 8;
                if (this.isPreviewAssetUrl(url)) return 100;
                if (/^https?:/i.test(url)) return 20;
                return 200;
            };
            return unique.sort((a, b) => score(a) - score(b));
        }

        async fetchBinaryAssetCandidates(candidates, asset, signal, visitedUrls = new Set(), options = null) {
            const errors = [];
            const startedAt = performance.now();
            let attemptCount = 0;
            const sorted = this.sortAssetCandidateUrls(candidates, asset, options);
            const unsuppressed = sorted.filter((url) => !this.isAssetRouteSuppressed(url));
            const unique = unsuppressed.length ? unsuppressed : sorted.slice(0, 1);
            for (const url of unique) {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                if (visitedUrls.has(url)) continue;
                visitedUrls.add(url);
                if (/^sandbox:/i.test(url)) {
                    errors.push(`${url}: sandbox 链接需要 file_id 才能解析`);
                    continue;
                }

                const routeProbe = await this.enterAssetRouteProbe(url, signal);
                if (!routeProbe.allowed) {
                    errors.push(`${url}: 该附件端点已在本次页面会话中熔断`);
                    continue;
                }
                let routeProbeFinished = false;
                let sameOrigin = false;
                let crossOriginHttp = false;
                let originKey = '';
                try {
                    const parsed = new URL(url, location.href);
                    sameOrigin = parsed.origin === location.origin;
                    crossOriginHttp = /^https?:$/.test(parsed.protocol) && !sameOrigin;
                    originKey = parsed.origin;
                } catch { }

                const preferGm = crossOriginHttp && this.config.conversationExportCrossOriginPreferGm !== false &&
                    typeof GM_xmlhttpRequest === 'function';
                const remembered = originKey ? this.assetFetchMethodPreference.get(originKey) : '';
                let methods = remembered === 'gm'
                    ? ['gm']
                    : remembered === 'page'
                        ? ['page', ...(sameOrigin ? [] : ['gm'])]
                        : preferGm
                            ? ['gm']
                            : ['page', ...(sameOrigin ? [] : ['gm'])];
                methods = [...new Set(methods)];

                for (let methodIndex = 0; methodIndex < methods.length; methodIndex += 1) {
                    const method = methods[methodIndex];
                    if (method === 'gm' && typeof GM_xmlhttpRequest !== 'function') continue;
                    const attemptStartedAt = performance.now();
                    attemptCount += 1;
                    this.assetFetchAttemptSequence += 1;
                    try {
                        const result = method === 'gm'
                            ? await this.fetchAssetWithGmRequest(url, signal)
                            : await this.fetchAssetWithPageFetch(url, signal, {
                                onHeaders: () => {
                                    if (routeProbe.owner && !routeProbeFinished) {
                                        this.recordAssetRouteResult(url, true, null, performance.now() - attemptStartedAt);
                                        this.finishAssetRouteProbe(routeProbe, { success: true, headersOnly: true });
                                        routeProbeFinished = true;
                                    }
                                },
                            });
                        const unwrapped = await this.unwrapAssetDownloadResponse(result, asset, signal, visitedUrls, url, options);
                        if (originKey) this.assetFetchMethodPreference.set(originKey, method);
                        this.recordAssetRouteResult(url, true, null, performance.now() - attemptStartedAt);
                        this.finishAssetRouteProbe(routeProbe, { success: true });
                        routeProbeFinished = true;
                        return {
                            ...unwrapped,
                            attemptCount: attemptCount + (Number(unwrapped.attemptCount) || 0),
                            fetchDurationMs: Math.round(performance.now() - startedAt),
                            resolvedVia: unwrapped.resolvedVia || method,
                        };
                    } catch (error) {
                        if (error?.name === 'AbortError') {
                            this.finishAssetRouteProbe(routeProbe, { success: false, aborted: true });
                            routeProbeFinished = true;
                            throw error;
                        }
                        this.recordAssetRouteResult(url, false, error, performance.now() - attemptStartedAt);
                        errors.push(`${url}: ${method === 'gm' ? '跨域请求' : '页面请求'} ${error?.message || error}`);
                        if (!this.shouldTryAlternateAssetMethod(error, method, sameOrigin)) break;
                    }
                }
                if (!routeProbeFinished) {
                    this.finishAssetRouteProbe(routeProbe, { success: false });
                    routeProbeFinished = true;
                }
            }
            const error = new Error(errors.join('；') || '没有可读取的附件地址');
            error.attemptCount = attemptCount;
            error.fetchDurationMs = Math.round(performance.now() - startedAt);
            throw error;
        }

        getArtifactEndpointCandidates(artifactId, asset = null) {
            const id = String(artifactId || '').trim();
            if (!id) return [];
            const encoded = encodeURIComponent(id);
            const conversationId = this.getCurrentConversationId();
            const signal = `${asset?.kind || ''} ${asset?.captureMethod || ''} ${asset?.mimeType || ''}`.toLowerCase();
            const artifactPaths = [
                `/backend-api/artifacts/${encoded}/download`,
                `/backend-api/artifacts/${encoded}`,
                `/backend-api/artifact/${encoded}/download`,
                `/backend-api/artifact/${encoded}`,
            ];
            const canvasPaths = [
                `/backend-api/canvas/${encoded}/download`,
                `/backend-api/canvas/${encoded}`,
                `/backend-api/canmore/${encoded}`,
            ];
            const documentPaths = [
                `/backend-api/textdocs/${encoded}/content`,
                `/backend-api/textdocs/${encoded}`,
                `/backend-api/documents/${encoded}/content`,
                `/backend-api/documents/${encoded}`,
            ];
            let paths = /canvas|canmore/.test(signal)
                ? [...canvasPaths, ...artifactPaths, ...documentPaths]
                : /textdoc|document|markdown|code/.test(signal)
                    ? [...documentPaths, ...artifactPaths, ...canvasPaths]
                    : [...artifactPaths, ...canvasPaths, ...documentPaths];
            if (conversationId) {
                const conversation = encodeURIComponent(conversationId);
                paths.push(`/backend-api/conversation/${conversation}/artifacts/${encoded}`);
                paths.push(`/backend-api/conversation/${conversation}/canvas/${encoded}`);
            }
            const urls = [...new Set(paths.map((value) => this.normalizeAssetCandidateUrl(value)))];
            const limit = Math.max(1, Math.min(12, Number(this.config.conversationExportArtifactEndpointCandidateLimit) || 6));
            const preferredSet = urls.slice(0, limit);
            const active = preferredSet.filter((url) => !this.isAssetRouteSuppressed(url));
            active.sort((a, b) => this.getAssetRoutePriority(a) - this.getAssetRoutePriority(b));
            return active;
        }

        async fetchArtifactEndpoint(endpoint, asset, signal) {
            const startedAt = performance.now();
            const routeProbe = await this.enterAssetRouteProbe(endpoint, signal);
            if (!routeProbe.allowed) throw new Error('该 Artifact 端点已在本次页面会话中熔断');
            let routeProbeFinished = false;
            try {
                const result = await this.fetchAssetWithPageFetch(endpoint, signal, {
                    onHeaders: () => {
                        if (routeProbe.owner && !routeProbeFinished) {
                            this.recordAssetRouteResult(endpoint, true, null, performance.now() - startedAt);
                            this.finishAssetRouteProbe(routeProbe, { success: true, headersOnly: true });
                            routeProbeFinished = true;
                        }
                    },
                });
                const contentType = String(result.contentType || result.blob?.type || '').toLowerCase();
                if (/json/i.test(contentType) && result.blob?.size <= 16 * 1024 * 1024) {
                    const text = await result.blob.text();
                    let data;
                    try { data = JSON.parse(text); } catch { throw new Error('Artifact 端点返回了无效 JSON'); }
                    const download = this.extractDownloadMetadataFromJson(data);
                    if (download?.downloadUrl) {
                        this.recordAssetRouteResult(endpoint, true, null, performance.now() - startedAt);
                        this.finishAssetRouteProbe(routeProbe, { success: true });
                        routeProbeFinished = true;
                        return { ...download, candidates: [download.downloadUrl] };
                    }
                    const payload = this.inferArtifactPayload(data, 'artifact endpoint', asset.filenameHint || 'artifact');
                    if (payload) {
                        this.recordAssetRouteResult(endpoint, true, null, performance.now() - startedAt);
                        this.finishAssetRouteProbe(routeProbe, { success: true });
                        routeProbeFinished = true;
                        return { blob: payload.blob, filename: payload.filename, mimeType: payload.mimeType, candidates: [] };
                    }
                    throw new Error('Artifact JSON 中没有可导出的内容');
                }
                if (result.blob?.size) {
                    this.recordAssetRouteResult(endpoint, true, null, performance.now() - startedAt);
                    this.finishAssetRouteProbe(routeProbe, { success: true });
                    routeProbeFinished = true;
                    return {
                        blob: result.blob,
                        filename: this.parseContentDispositionFilename(result.contentDisposition) || asset.filenameHint || '',
                        mimeType: result.contentType || result.blob.type || '',
                        candidates: [],
                    };
                }
                throw new Error('Artifact 端点返回空内容');
            } catch (error) {
                this.recordAssetRouteResult(endpoint, false, error, performance.now() - startedAt);
                if (!routeProbeFinished) {
                    this.finishAssetRouteProbe(routeProbe, { success: false });
                    routeProbeFinished = true;
                }
                throw error;
            }
        }

        async resolveArtifactAsset(asset, signal) {
            const artifactId = String(asset?.artifactId || '').trim();
            if (!artifactId) return null;
            if (this.artifactResolutionCache.has(artifactId)) return this.artifactResolutionCache.get(artifactId);
            const task = (async () => {
                const endpoints = this.getArtifactEndpointCandidates(artifactId, asset);
                const batchSize = Math.max(1, Math.min(6, Number(this.config.conversationExportArtifactResolveConcurrency) || 4));
                const budgetMs = Math.max(2500, Number(this.config.conversationExportArtifactResolveBudgetMs) || 9000);
                const deadline = performance.now() + budgetMs;
                const errors = [];
                for (let offset = 0; offset < endpoints.length && performance.now() < deadline; offset += batchSize) {
                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                    const batch = endpoints.slice(offset, offset + batchSize);
                    const controllers = batch.map(() => new AbortController());
                    const remaining = Math.max(500, deadline - performance.now());
                    const budgetTimer = window.setTimeout(() => controllers.forEach((controller) => controller.abort()), remaining);
                    const abortAll = () => controllers.forEach((controller) => controller.abort());
                    const parentAbort = () => abortAll();
                    signal?.addEventListener('abort', parentAbort, { once: true });
                    try {
                        const promises = batch.map((endpoint, index) => {
                            const controller = controllers[index];
                            return this.fetchArtifactEndpoint(endpoint, asset, controller.signal)
                                .catch((error) => {
                                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                                    const path = (() => { try { return new URL(endpoint, location.href).pathname; } catch { return endpoint; } })();
                                    throw new Error(`${path}: ${error?.message || error}`);
                                });
                        });
                        try {
                            const value = await Promise.any(promises);
                            abortAll();
                            return value;
                        } catch (aggregate) {
                            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                            for (const error of aggregate?.errors || []) errors.push(error?.message || String(error));
                        }
                    } finally {
                        window.clearTimeout(budgetTimer);
                        signal?.removeEventListener('abort', parentAbort);
                        abortAll();
                    }
                }
                if (performance.now() >= deadline) errors.push(`Artifact 路由探测超过 ${Math.round(budgetMs / 1000)} 秒预算`);
                throw new Error(errors.join('；') || `无法解析 Artifact ${artifactId}`);
            })();
            this.artifactResolutionCache.set(artifactId, task);
            try {
                const value = await task;
                this.artifactResolutionCache.set(artifactId, value);
                return value;
            } catch (error) {
                this.artifactResolutionCache.delete(artifactId);
                throw error;
            }
        }

        async fetchArchiveAssetUncached(asset, signal) {
            const fileIds = [...new Set([
                asset?.originalFileId || '',
                ...(asset?.fileIdCandidates || []),
                asset?.fileId || '',
                this.extractFileIdFromValue(asset?.sourceUrl),
            ].filter(Boolean))];
            const fileId = fileIds[0] || '';
            const artifactId = asset?.artifactId || this.extractArtifactIdFromValue(asset?.sourceUrl);
            const strictOriginal = this.config.conversationExportRequireOriginalAssets !== false;
            const allowPreviewFallback = this.config.conversationExportAllowPreviewFallback === true;
            const errors = [];

            // 没有 file_id 的内联 Blob（data/blob/canvas/inline artifact）本身就是唯一可用内容。
            // 存在 file_id 时，DOM 中捕获的 Blob 通常只是预览图或渲染结果，不能优先返回。
            if (asset?.blob instanceof Blob && !fileId) {
                const memoryResult = await this.validateDownloadedAsset({
                    blob: asset.blob,
                    finalUrl: asset.sourceUrl || '',
                    contentType: asset.blob.type || asset.mimeType || '',
                    contentDisposition: '',
                    resolvedFilename: asset.originalFilename || asset.filenameHint || '',
                }, asset, asset.sourceUrl || '', { strictOriginal: false });
                return {
                    ...memoryResult,
                    attemptCount: 0,
                    fetchDurationMs: 0,
                    resolvedVia: 'memory',
                };
            }

            let metadata = null;
            const explicitOriginals = [...new Set([
                ...(asset?.originalUrls || []),
                ...[asset?.sourceUrl, ...(asset?.alternateUrls || [])].filter((url) => this.isExplicitOriginalAssetUrl(url, asset)),
            ].map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean))];
            const previewCandidates = [...new Set([
                ...(asset?.previewUrls || []),
                asset?.sourceUrl || '',
                ...(asset?.alternateUrls || []),
            ].map((value) => this.normalizeAssetCandidateUrl(value)).filter(Boolean))]
                .filter((url) => !explicitOriginals.includes(url));

            if (fileIds.length) {
                let originalErrorCount = 0;
                for (const candidateFileId of fileIds) {
                    let metadata = null;
                    const perIdAsset = { ...asset, fileId: candidateFileId };
                    const cachedMetadata = this.fileDownloadMetadataCache.get(String(candidateFileId));
                    const perIdOriginals = [...explicitOriginals];
                    if (cachedMetadata && !(cachedMetadata instanceof Promise)) {
                        metadata = cachedMetadata;
                        if (metadata?.blob instanceof Blob) {
                            try {
                                const validated = await this.validateDownloadedAsset({
                                    blob: metadata.blob,
                                    finalUrl: metadata.downloadUrl || '',
                                    contentType: metadata.mimeType || metadata.blob.type || asset.mimeType || '',
                                    contentDisposition: metadata.contentDisposition || '',
                                    resolvedFilename: metadata.filename || asset.originalFilename || asset.filenameHint || '',
                                }, { ...perIdAsset, expectedSize: metadata.size || asset.expectedSize || 0 }, metadata.downloadUrl || '', { strictOriginal: true });
                                return { ...validated, attemptCount: 0, fetchDurationMs: 0, resolvedVia: 'metadata-cache', resolvedFileId: candidateFileId };
                            } catch {
                                this.fileDownloadMetadataCache.delete(String(candidateFileId));
                            }
                        }
                        if (metadata?.downloadUrl) perIdOriginals.unshift(metadata.downloadUrl);
                    }

                    const originalCandidates = [...new Set([
                        ...perIdOriginals,
                        ...this.getFileEndpointCandidates(candidateFileId, asset?.sourceUrl),
                    ].filter(Boolean))];
                    try {
                        const result = await this.fetchBinaryAssetCandidates(originalCandidates, perIdAsset, signal, new Set(), { strictOriginal: true });
                        this.fileDownloadMetadataCache.set(String(candidateFileId), {
                            downloadUrl: result.finalUrl || '',
                            filename: result.resolvedFilename || asset?.originalFilename || asset?.filenameHint || '',
                            mimeType: result.contentType || result.blob.type || asset?.originalMimeType || asset?.mimeType || '',
                            size: result.blob.size,
                            contentDisposition: result.contentDisposition || '',
                        });
                        return { ...result, resolvedFileId: candidateFileId };
                    } catch (error) {
                        if (error?.name === 'AbortError') throw error;
                        originalErrorCount += 1;
                        errors.push(`原文件 ${candidateFileId}: ${error?.message || error}`);
                    }
                }

                if (allowPreviewFallback && previewCandidates.length) {
                    try {
                        const fallback = await this.fetchBinaryAssetCandidates(previewCandidates, asset, signal, new Set(), { strictOriginal: false });
                        return { ...fallback, resolvedVia: `${fallback.resolvedVia || 'network'}-preview-fallback`, previewFallback: true };
                    } catch (error) {
                        if (error?.name === 'AbortError') throw error;
                        errors.push(`预览后备: ${error?.message || error}`);
                    }
                }
            } else {
                const directCandidates = [...explicitOriginals, ...previewCandidates]
                    .filter((value) => this.isUsableDirectAssetUrl(value));
                if (directCandidates.length) {
                    try {
                        return await this.fetchBinaryAssetCandidates(directCandidates, asset, signal, new Set(), { strictOriginal });
                    } catch (error) {
                        if (error?.name === 'AbortError') throw error;
                        errors.push(error?.message || String(error));
                    }
                }
            }

            if (artifactId) {
                try {
                    const resolvedArtifact = await this.resolveArtifactAsset(asset, signal);
                    if (resolvedArtifact?.blob instanceof Blob) {
                        const validated = await this.validateDownloadedAsset({
                            blob: resolvedArtifact.blob,
                            finalUrl: asset.sourceUrl || '',
                            contentType: resolvedArtifact.mimeType || resolvedArtifact.blob.type || asset.mimeType || '',
                            contentDisposition: '',
                            resolvedFilename: resolvedArtifact.filename || asset.filenameHint || '',
                        }, asset, asset.sourceUrl || '', { strictOriginal: false });
                        return { ...validated, attemptCount: 1, fetchDurationMs: 0, resolvedVia: 'artifact-endpoint' };
                    }
                    if (resolvedArtifact?.candidates?.length) {
                        const result = await this.fetchBinaryAssetCandidates(resolvedArtifact.candidates, asset, signal, new Set(), { strictOriginal: false });
                        return {
                            ...result,
                            contentType: result.contentType || resolvedArtifact.mimeType || asset.mimeType || result.blob.type || '',
                            resolvedFilename: result.resolvedFilename || resolvedArtifact.filename || asset.filenameHint || '',
                        };
                    }
                } catch (error) {
                    if (error?.name === 'AbortError') throw error;
                    errors.push(`artifact_id ${artifactId}: ${error?.message || error}`);
                }
            }

            if (asset?.blob instanceof Blob && allowPreviewFallback) {
                const fallback = await this.validateDownloadedAsset({
                    blob: asset.blob,
                    finalUrl: asset.sourceUrl || '',
                    contentType: asset.blob.type || asset.mimeType || '',
                    contentDisposition: '',
                    resolvedFilename: asset.filenameHint || '',
                }, asset, asset.sourceUrl || '', { strictOriginal: false });
                return { ...fallback, attemptCount: 0, fetchDurationMs: 0, resolvedVia: 'memory-preview-fallback', previewFallback: true };
            }

            throw new Error(errors.filter(Boolean).join('；') || (fileIds.length
                ? '无法取得并验证原文件；为避免误导，未使用页面预览内容代替'
                : '没有可读取的附件地址'));
        }

        async fetchArchiveAsset(asset, signal) {
            const key = this.getAssetFetchCacheKey(asset);
            if (!key) return this.fetchArchiveAssetUncached(asset, signal);

            const cached = this.assetBinaryCache.get(key);
            if (cached) {
                const value = await cached;
                return { ...value, cacheHit: true };
            }

            const failure = this.assetFailureCache.get(key);
            const failureTtl = Math.max(0, Number(this.config.conversationExportAssetFailureCacheTtlMs) || 0);
            if (failure && Date.now() - failure.at < failureTtl) {
                throw new Error(`${failure.message}（近期失败缓存）`);
            }
            if (failure) this.assetFailureCache.delete(key);

            const task = this.fetchArchiveAssetUncached(asset, signal);
            this.assetBinaryCache.set(key, task);
            try {
                const value = await task;
                const itemLimit = Math.max(0, Number(this.config.conversationExportBinaryCacheMaxItemBytes) || 0);
                const totalLimit = Math.max(0, Number(this.config.conversationExportBinaryCacheMaxBytes) || 0);
                const size = Number(value?.blob?.size) || 0;
                if (size && size <= itemLimit && this.assetBinaryCacheBytes + size <= totalLimit) {
                    this.assetBinaryCache.set(key, value);
                    this.assetBinaryCacheBytes += size;
                } else {
                    this.assetBinaryCache.delete(key);
                }
                this.assetFailureCache.delete(key);
                return value;
            } catch (error) {
                this.assetBinaryCache.delete(key);
                if (error?.name !== 'AbortError') {
                    this.assetFailureCache.set(key, { at: Date.now(), message: error?.message || String(error) });
                }
                throw error;
            }
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

        getAssetFetchCacheKey(asset) {
            if (!asset) return '';
            const fileIds = [...new Set([asset.originalFileId || '', ...(asset.fileIdCandidates || []), asset.fileId || '', this.extractFileIdFromValue(asset.sourceUrl)].filter(Boolean))];
            if (fileIds.length) return `original-v3|file-ids|${fileIds.join(',')}`;
            const artifactId = String(asset.artifactId || this.extractArtifactIdFromValue(asset.sourceUrl) || '').trim();
            if (artifactId) return `original-v2|artifact-id|${artifactId}`;
            const source = this.getStableAssetUrlKey(asset.sourceUrl || '');
            if (source) return `original-v2|${asset.kind || 'asset'}|${source}`;
            if (asset.blob instanceof Blob) return `blob|${asset.id || asset.filenameHint || asset.label || asset.blob.size}`;
            return String(asset.id || asset.filenameHint || asset.label || 'asset');
        }

        getAdaptiveAssetConcurrency() {
            let value = Math.max(1, Math.min(16, Number(this.config.conversationExportAssetConcurrency) || 10));
            const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (connection?.saveData) value = Math.min(value, 2);
            if (/^(?:slow-2g|2g)$/i.test(String(connection?.effectiveType || ''))) value = Math.min(value, 2);
            else if (/^3g$/i.test(String(connection?.effectiveType || ''))) value = Math.min(value, 5);
            const memory = Number(navigator.deviceMemory) || 0;
            if (memory && memory <= 2) value = Math.min(value, 3);
            else if (memory && memory <= 4) value = Math.min(value, 6);
            const cores = Number(navigator.hardwareConcurrency) || 0;
            if (cores && cores <= 4) value = Math.min(value, 6);
            else if (cores >= 12 && !connection?.saveData && !/^(?:slow-2g|2g|3g)$/i.test(String(connection?.effectiveType || ''))) {
                value = Math.min(16, Math.max(value, 12));
            }
            return Math.max(1, value);
        }

        async runBoundedAssetWorkers(items, concurrency, worker, signal) {
            const queue = Array.from(items || []);
            if (!queue.length) return;
            let cursor = 0;
            const workerCount = Math.max(1, Math.min(queue.length, Number(concurrency) || 1));
            const runners = Array.from({ length: workerCount }, async () => {
                while (true) {
                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                    const index = cursor;
                    cursor += 1;
                    if (index >= queue.length) return;
                    await worker(queue[index], index);
                }
            });
            await Promise.all(runners);
        }

        updateAssetFetchProgress(label = '', force = false) {
            const now = performance.now();
            const interval = Math.max(30, Number(this.config.conversationExportProgressUpdateIntervalMs) || 90);
            if (!force && now - this.assetProgressLastUiAt < interval) return;
            this.assetProgressLastUiAt = now;
            const progress = this.conversationAssetProgress;
            const elapsedSeconds = this.assetProgressStartedAt
                ? Math.max(0, (performance.now() - this.assetProgressStartedAt) / 1000)
                : 0;
            const sizeMiB = this.assetProgressBytes / 1024 / 1024;
            const parts = [
                `正在获取附件 ${progress.completed}/${progress.total}`,
                this.assetProgressActive ? `并发 ${this.assetProgressActive}` : '',
                sizeMiB >= 0.05 ? `${sizeMiB.toFixed(sizeMiB >= 10 ? 1 : 2)} MiB` : '',
                elapsedSeconds >= 1 ? `${elapsedSeconds.toFixed(1)} 秒` : '',
                progress.failed ? `失败 ${progress.failed}` : '',
            ].filter(Boolean);
            if (label) parts.push(label);
            this.updateConversationArchiveUi(parts.join(' · '));
        }

        scoreAssetJob(job) {
            const asset = job?.asset || {};
            if (asset.blob instanceof Blob) return 0;
            const source = String(asset.sourceUrl || '');
            if (/^data:/i.test(source)) return 1;
            if (/^blob:/i.test(source)) return 2;
            if (asset.fileId) return 3;
            if (/^https?:/i.test(source)) return 4;
            if (asset.artifactId) return 5;
            return 6;
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
                        artifactId: asset.artifactId || '',
                        captureMethod: asset.captureMethod || '',
                        included: false,
                        skipped: true,
                        reason: '用户未勾选“图片和附件”',
                    });
                }
                return { tokenPathMap, urlPathMap, files, manifest };
            }

            const entries = this.getArchiveAssetsForIndices(indices);
            const fetchEntries = [];
            for (const entry of entries) {
                const decorative = entry.asset?.presentation === 'inline-icon' || entry.asset?.kind === 'inline-icon';
                if (decorative && this.config.conversationExportIncludeDecorativeIcons !== true) {
                    manifest.push({
                        logicalIndex: entry.logicalIndex,
                        id: entry.asset.id,
                        label: entry.asset.label,
                        kind: entry.asset.kind,
                        presentation: entry.asset.presentation || '',
                        sourceUrl: entry.asset.sourceUrl || '',
                        fileId: entry.asset.fileId || '',
                        artifactId: entry.asset.artifactId || '',
                        captureMethod: entry.asset.captureMethod || '',
                        included: false,
                        skipped: true,
                        reason: '已跳过装饰性网页图标（可在脚本配置中开启）',
                    });
                    continue;
                }
                fetchEntries.push(entry);
            }
            const uniqueJobs = new Map();
            for (const entry of fetchEntries) {
                const key = this.getAssetFetchCacheKey(entry.asset) || entry.asset.id;
                if (!uniqueJobs.has(key)) uniqueJobs.set(key, { ...entry, key, refs: [] });
                uniqueJobs.get(key).refs.push(entry);
            }

            const jobs = [...uniqueJobs.values()].sort((a, b) => this.scoreAssetJob(a) - this.scoreAssetJob(b));
            this.conversationAssetProgress = { completed: 0, total: jobs.length, failed: 0 };
            this.assetProgressActive = 0;
            this.assetProgressBytes = 0;
            this.assetProgressStartedAt = performance.now();
            this.assetProgressLastUiAt = 0;
            const usedPaths = new Set();
            let plannedZipBytes = 0;
            const maxZip = Math.max(1, Number(this.config.conversationExportMaxZipBytes) || 0);
            const concurrency = this.getAdaptiveAssetConcurrency();
            this.updateAssetFetchProgress(`并发上限 ${concurrency}`, true);

            const processJob = async (job) => {
                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                const { asset, logicalIndex } = job;
                const label = asset.label || asset.filenameHint || '附件';
                this.assetProgressActive += 1;
                this.updateAssetFetchProgress(label);
                try {
                    const result = await this.fetchArchiveAsset(asset, signal);
                    if (plannedZipBytes + result.blob.size > maxZip) {
                        throw new Error(`加入此文件后 ZIP 将超过 ${Math.round(maxZip / 1024 / 1024)} MiB 限制`);
                    }
                    const dispositionName = this.parseContentDispositionFilename(result.contentDisposition);
                    const filename = this.ensureAssetFilenameExtension(
                        dispositionName || result.resolvedFilename || asset.originalFilename || asset.filenameHint || asset.label || 'asset',
                        result.contentType || asset.mimeType || result.blob.type,
                    );
                    const path = this.createUniqueAssetPath(logicalIndex, filename, usedPaths);
                    plannedZipBytes += result.blob.size;
                    this.assetProgressBytes += result.blob.size;
                    files.push({ path, blob: result.blob, asset, logicalIndex });
                    for (const ref of job.refs) {
                        ref.asset.byteLength = result.blob.size;
                        ref.asset.mimeType = result.contentType || ref.asset.mimeType || result.blob.type || '';
                        if (result.resolvedFilename) ref.asset.resolvedFilename = result.resolvedFilename;
                        tokenPathMap.set(ref.asset.id, path);
                        for (const url of [
                            ref.asset.sourceUrl,
                            ...(ref.asset.alternateUrls || []),
                            ...(ref.asset.originalUrls || []),
                            ...(ref.asset.previewUrls || []),
                        ]) {
                            if (!url) continue;
                            urlPathMap.set(url, path);
                            urlPathMap.set(this.normalizeAssetCandidateUrl(url), path);
                        }
                        manifest.push({
                            logicalIndex: ref.logicalIndex,
                            id: ref.asset.id,
                            label: ref.asset.label,
                            kind: ref.asset.kind,
                            presentation: ref.asset.presentation || '',
                            sourceUrl: ref.asset.sourceUrl || '',
                            fileId: ref.asset.fileId || '',
                            artifactId: ref.asset.artifactId || '',
                            captureMethod: ref.asset.captureMethod || '',
                            included: true,
                            path,
                            size: result.blob.size,
                            mimeType: result.contentType || ref.asset.mimeType || result.blob.type || '',
                            cacheHit: Boolean(result.cacheHit),
                            fetchDurationMs: Number(result.fetchDurationMs) || 0,
                            attemptCount: Number(result.attemptCount) || 0,
                            resolvedVia: result.resolvedVia || '',
                            resolvedFileId: result.resolvedFileId || ref.asset.fileId || '',
                            previewFallback: Boolean(result.previewFallback),
                            validation: result.validation || null,
                            expectedSize: Number(ref.asset.expectedSize) || 0,
                            originalFilename: ref.asset.originalFilename || '',
                            originalMimeType: ref.asset.originalMimeType || '',
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
                            presentation: ref.asset.presentation || '',
                            sourceUrl: ref.asset.sourceUrl || '',
                            fileId: ref.asset.fileId || '',
                            artifactId: ref.asset.artifactId || '',
                            captureMethod: ref.asset.captureMethod || '',
                            included: false,
                            reason: error?.message || String(error),
                            fetchDurationMs: Number(error?.fetchDurationMs) || 0,
                            attemptCount: Number(error?.attemptCount) || 0,
                        });
                    }
                } finally {
                    this.assetProgressActive = Math.max(0, this.assetProgressActive - 1);
                    this.conversationAssetProgress.completed += 1;
                    this.updateAssetFetchProgress('', this.conversationAssetProgress.completed === this.conversationAssetProgress.total);
                }
            };

            await this.runBoundedAssetWorkers(jobs, concurrency, processJob, signal);
            files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
            manifest.sort((a, b) => (a.logicalIndex - b.logicalIndex) || String(a.id).localeCompare(String(b.id)));
            return { tokenPathMap, urlPathMap, files, manifest };
        }

        buildZipReadme(assetManifest) {
            const failures = assetManifest.filter((item) => !item.included && !item.skipped);
            const skipped = assetManifest.filter((item) => !item.included && item.skipped);
            const lines = [
                'ChatGPT 对话归档',
                '',
                'conversation.md：适合 Markdown 阅读器。',
                'conversation.html：可直接在浏览器中离线打开。',
                'assets/：成功获取的图片、文件和 HTML Artifacts。',
                'manifest.json：每个资源的来源、导出路径、缓存命中状态和失败原因。',
                '',
                '资源解析默认只使用结构化对话数据、React 控件属性、DOM、多个文件端点以及已经打开的 Artifact 面板快照。',
                '全量加载和导出准备不会自动点击文件卡、下载按钮或导出菜单；这是为了避免页面原生下载处理器连续触发浏览器下载。',
                'manifest.json 会记录 file_id / artifact_id、最终采用的原文件 ID、文件头校验、大小校验、来源 URL、归档路径和失败原因。',
                '原文件模式不会用缩略图、预览页或渲染产物冒充附件；无法验证原文件时会记录失败并跳过。',
                '如果签名链接已过期、账号无权限、文件超过限制，或页面未提供 file_id，附件仍可能无法打包。',
            ];
            if (skipped.length) {
                lines.push('', `按配置跳过的资源：${skipped.length} 个（主要为网页图标或用户未选择附件）`);
            }
            if (failures.length) {
                lines.push('', `未能打包资源：${failures.length} 个`, '');
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
                    version: 8,
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
                const failedAssets = assetPlan.manifest.filter((item) => !item.included && !item.skipped).length;
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
