// ==UserScript==
// @name         B站字幕获取、AI分析及广告跳过工具
// @namespace    http://tampermonkey.net/
// @version      1.7.0
// @description  自动提取B站视频字幕，支持AI生成的CC字幕，通过AI总结+广告识别，自动跳过广告。支持热门评论舆论分析、LaTeX渲染、多语言字幕、面板拖拽、关键词搜索。
// @author       LiuMashiro
// @license      MIT
// @match        *://www.bilibili.com/video/*
// @match        *://www.bilibili.com/list/watchlater*
// @match        *://www.bilibili.com/bangumi/play/ep*
// @match        *://www.bilibili.com/bangumi/play/ss*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @grant        unsafeWindow
// @connect      api.deepseek.com
// @connect      open.bigmodel.cn
// @connect      ark.cn-beijing.volces.com
// @connect      api.openai.com
// @connect      api.anthropic.com
// @connect      generativelanguage.googleapis.com
// @connect      raw.githubusercontent.com
// @connect      scriptcat.org
// @connect      cdn.jsdelivr.net
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js
// @resource     KATEX_CSS https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
// @run-at       document-idle
// @downloadURL  https://update.greasyfork.org/scripts/579482/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E3%80%81AI%E5%88%86%E6%9E%90%E5%8F%8A%E5%B9%BF%E5%91%8A%E8%B7%B3%E8%BF%87%E5%B7%A5%E5%85%B7.user.js
// @updateURL    https://update.greasyfork.org/scripts/579482/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E3%80%81AI%E5%88%86%E6%9E%90%E5%8F%8A%E5%B9%BF%E5%91%8A%E8%B7%B3%E8%BF%87%E5%B7%A5%E5%85%B7.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ===================== 1. 常量配置 =====================
    const SCRIPT_VERSION = '1.7.0';
    const GITHUB_REPO_URL = 'https://github.com/LiuMashiro/Bilibili-Subtitle-Extraction-AI-Summary-Ad-Skipping/tree/main';
    const GREASYFORK_URL = 'https://greasyfork.org/zh-CN/scripts/579482';
    const SCRIPTCAT_URL = 'https://scriptcat.org/zh-CN/script-show-page/6728';
    const CHANGELOG_RAW_URL = 'https://raw.githubusercontent.com/LiuMashiro/Bilibili-Subtitle-Extraction-AI-Summary-Ad-Skipping/main/CHANGELOG.md';
    const AD_BRAND_LIST = ['转转', '追觅', '神奇小鹿', '妙界', '拼多多', '加速器', '得物', '萌牙家'];
    const AD_MARK_COLOR = 'rgba(255, 193, 7, 0.6)';
    const AD_CHECK_INTERVAL_MS = 2000;
    const AUTO_FETCH_DELAY_MS = 1500;

    const API_PLATFORMS = {
        deepseek: { name: 'DeepSeek (性价比高)', url: 'https://api.deepseek.com/v1/chat/completions', models: ['deepseek-v4-flash', 'deepseek-v4-pro', '自定义'], link: 'https://platform.deepseek.com/' },
        zlm: { name: '智谱 (提供免费模型)', url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', models: ['GLM-4.7-Flash (免费)', 'GLM-5.2', 'GLM-5.1', 'GLM-5', 'GLM-5-Turbo', 'GLM-4.7', 'GLM-4.7-FlashX', 'GLM-4.6', 'GLM-4.5-Air', 'GLM-4.5-AirX', 'GLM-4-Long', 'GLM-4-FlashX-250414', 'GLM-4-Flash-250414', '自定义'], link: 'https://bigmodel.cn/' },
        doubao: { name: '火山方舟 (豆包)', url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions', models: ['doubao-seed-2-0-lite-260428', 'doubao-seed-2-0-mini-260428', 'doubao-seed-2-0-pro-260215', '自定义'], link: 'https://www.volcengine.com/product/ark' },
        chatgpt: { name: 'ChatGPT', url: 'https://api.openai.com/v1/chat/completions', models: ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4-pro', '自定义'], link: 'https://platform.openai.com/' },
        claude: { name: 'Claude', url: 'https://api.anthropic.com/v1/messages', models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-fable-5', 'claude-mythos-5', 'claude-haiku-4-5-20251001', '自定义'], link: 'https://console.anthropic.com/' },
        gemini: { name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent', models: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', '自定义'], link: 'https://aistudio.google.com/' },
        custom: { name: '自定义', url: '', models: ['自定义'], link: '' }
    };
    const TAB_OPTIONS = { preview: '浏览', ai: 'AI分析', text: '文本' };
    const DETAIL_LEVELS = { very_detailed: '非常详细', detailed: '详细', concise: '简洁', minimal: '极简' };

    // ===================== 2. 设置迁移与读取 =====================
    function migrateOldSettings() {
        const keyMap = {
            bse_platform: 'bseas_platform', bse_api_url: 'bseas_api_url', bse_model: 'bseas_model',
            bse_auto_summary: 'bseas_auto_summary', bse_auto_open_panel: 'bseas_auto_open_panel',
            bse_auto_open_tab: 'bseas_auto_open_tab', bse_opinion_analysis: 'bseas_opinion_analysis',
            bse_opinion_comments_count: 'bseas_opinion_comments_count', bse_detail_level: 'bseas_detail_level',
            bse_auto_skip_ad: 'bseas_auto_skip_ad'
        };
        for (const [oldK, newK] of Object.entries(keyMap)) {
            if (GM_getValue(oldK, undefined) !== undefined && GM_getValue(newK, undefined) === undefined) {
                GM_setValue(newK, GM_getValue(oldK));
            }
        }
        const oldGlobalKey = GM_getValue('bse_api_key', '');
        if (oldGlobalKey) {
            const plat = GM_getValue('bseas_platform', 'deepseek');
            if (!GM_getValue('bseas_api_key_' + plat, '')) GM_setValue('bseas_api_key_' + plat, oldGlobalKey);
        }
        for (const k of GM_listValues()) {
            if (k.startsWith('bse_api_key_')) {
                const newK = 'bseas_' + k.slice(4);
                if (GM_getValue(newK, undefined) === undefined) GM_setValue(newK, GM_getValue(k));
            }
        }
    }
    migrateOldSettings();

    let bseas_platform = GM_getValue('bseas_platform', 'deepseek');
    let bseas_api_key = GM_getValue('bseas_api_key_' + bseas_platform, '');
    let bseas_api_url = GM_getValue('bseas_api_url', API_PLATFORMS.deepseek.url);
    let bseas_model = GM_getValue('bseas_model', 'deepseek-v4-flash');
    let bseas_auto_summary = GM_getValue('bseas_auto_summary', false);
    let bseas_auto_open_panel = GM_getValue('bseas_auto_open_panel', true);
    let bseas_auto_open_tab = GM_getValue('bseas_auto_open_tab', 'preview');
    let bseas_opinion_analysis = GM_getValue('bseas_opinion_analysis', true);
    let bseas_opinion_comments_count = GM_getValue('bseas_opinion_comments_count', 30);
    let bseas_detail_level = GM_getValue('bseas_detail_level', 'concise');
    let bseas_auto_skip_ad = GM_getValue('bseas_auto_skip_ad', true);
    let bseas_latex = GM_getValue('bseas_latex', true);
    let bseas_disable_api = GM_getValue('bseas_disable_api', false);
    let bseas_panel_pos_preset = GM_getValue('bseas_panel_pos_preset', 'top-right');
    let bseas_max_preview_subtitles = GM_getValue('bseas_max_preview_subtitles', 1000);
    let bseas_confirm_chars = GM_getValue('bseas_confirm_chars', 20000);
    let bseas_confirm_enabled = GM_getValue('bseas_confirm_enabled', true);

    // ===================== 3. AI 提示词 =====================
    function getFormatRules() {
        const latexLine = bseas_latex ? '- LaTeX 行内公式：$公式$\n- LaTeX 块级公式：$$公式$$' : '';
        const latexBan = bseas_latex ? '' : '- 任何 LaTeX 公式（禁止使用 $ 符号包裹公式，数学概念请用文字或代码描述）';
        return `允许使用的 Markdown 格式（仅限以下几种）：
- 标题：#、##、###（最多三级，禁止四级及以上）
- 粗体：**文字**
- 斜体：*文字*
- 无序列表：- 或 *
- 有序列表：1. 2. 3.
- 引用：>
- 分割线：---
- 行内代码：\`代码\`
 ${latexLine}

禁止使用的格式：
- 任何 HTML 标签（如 <div>、<script>、<span> 等）
- 表格（| ... |）
- 图片（![]()）
- 超链接（[]()）
- 四级及以上标题
 ${latexBan}`;
    }

    function getAISummaryPrompt(hasSubtitle, includeFormatRules = true) {
        const formatRules = includeFormatRules ? getFormatRules() + '\n\n' : '';
        if (!hasSubtitle) {
            return `${formatRules}注意：当前视频未提供字幕数据。请不要进行视频内容总结，而是根据提供的视频标题、简介以及热门评论区数据（如果有），直接进行舆论分析。
如果没有提供评论数据，则说明无法进行深度的舆论分析，可以仅分析标题与简介的倾向。

请直接输出舆论分析：
## 舆论分析
- 提炼评论区或标题简介的1-N个主要观点方向，简明概括每个方向的核心立场，标注情感倾向（正面/负面/中性/混合）和大约占比。
- 如有高赞代表性观点，可简要引用（无需标注用户名）
- 一句话概括整体氛围

标注音符♪符号的是背景音乐/主人物唱歌。

最后，由于没有视频内容，请严格在末尾回复：
广告时间[无]`;
        }

        let summaryWord, overviewWord, listWord;
        switch (bseas_detail_level) {
            case 'very_detailed': summaryWord = '非常详细'; overviewWord = '全面'; listWord = '详细地分点列出核心结论、关键信息和具体细节（包含论述过程和支撑论据）'; break;
            case 'detailed': summaryWord = '详细'; overviewWord = '详细'; listWord = '详细地分点列出核心结论和关键信息'; break;
            case 'minimal': summaryWord = '极简'; overviewWord = '极简'; listWord = '极简地分点列出核心要点（剔除一切修饰性废话）'; break;
            default: summaryWord = '简洁'; overviewWord = '简明'; listWord = '精简地分点列出核心结论和关键信息（剔除修饰性废话）'; break;
        }
        return `${formatRules}注意：请不要在总结中提及视频中的任何广告植入、商业推广等内容，只聚焦核心内容。
已知以下品牌均属于广告范畴（包含但不限于）：${AD_BRAND_LIST.join('、')}。
字幕包含时间戳（[MM:SS.ms]），但在总结内容中请严格剔除时间戳，只保留通顺的文字。字幕为智能识别，可能包含错误。

请根据字幕内容，生成一份【${summaryWord}】的视频总结：
1. ${overviewWord}概括视频核心主题和整体概述。
2. ${listWord}。
最多使用"###"三个井号。

正确的例子：
## 视频总结

### 核心主题
示例内容。

### 核心结论与关键信息

- **示例内容**：
  - 示例内容。

如果提供了热门评论数据，在"核心结论与关键信息"之后，使用分割线"---"隔开，输出舆论分析：
## 舆论分析
- 提炼评论区的1-N个主要观点方向（不一定非要是多个，根据情况决定），简明概括每个方向的核心立场，标注每个观点方向的情感倾向（正面/负面/中性/混合）和大约占比。
- 如有高赞代表性观点，可简要引用（无需标注用户名）
- 一句话概括评论区整体氛围
如果没有提供评论数据，则跳过此部分，不输出"---"和"## 舆论分析"。

标注音符符号的是背景音乐/主人物唱歌。

识别中间插入的广告。在全文的最后末尾列出"广告时间"部分，支持以下两种格式：
格式A（同一行）：广告时间[MM:SS - MM:SS]
格式B（分行，标题后换行）：
### 广告时间
[MM:SS - MM:SS]

规则：
- 如果视频中没有广告，请严格回复：广告时间[无]
- 如果有多段中间插入的广告，取最长的一段。
- <5s的广告时间忽略不计。
- 只包含分钟和秒，禁止任何其他多余文字、符号或标点。
- "-"左右包含空格
- 超长视频允许分钟数值大于60，如[70:00 - 75:00]。禁止小时位。禁止分秒毫秒位。`;
    }

    // ===================== 4. 安全策略 =====================
    let trustedPolicy = null;
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try { trustedPolicy = window.trustedTypes.createPolicy('bseasPolicy', { createHTML: s => s }); } catch (e) {}
    }
    function safeSetInnerHTML(el, html) {
        if (!el) return;
        el.innerHTML = trustedPolicy ? trustedPolicy.createHTML(html) : html;
    }
    function escapeHtml(t) {
        if (t == null) return '';
        return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    let katexCSSInjected = false;
    function injectKatexCSS() {
        if (katexCSSInjected) return;
        try { const css = GM_getResourceText('KATEX_CSS'); if (css) { GM_addStyle(css); katexCSSInjected = true; } } catch (e) {}
    }
    function renderLatex(el) {
        if (!bseas_latex || !el) return;
        if (typeof window.renderMathInElement !== 'function') return;
        injectKatexCSS();
        try {
            window.renderMathInElement(el, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '$', right: '$', display: false }
                ],
                throwOnError: false,
                ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
            });
        } catch (e) {}
    }

    // ===================== 5. 样式 =====================
    GM_addStyle(`
        :root {
            --bseas-primary: #00AEEC; --bseas-primary-hover: #0098ce;
            --bseas-bg-glass: rgba(255,255,255,0.98); --bseas-bg-card: #f8fafc;
            --bseas-border: #e2e8f0; --bseas-text: #0f172a; --bseas-text-dim: #64748b; --bseas-text-muted: #94a3b8;
            --bseas-shadow: 0 12px 40px -10px rgba(0,0,0,0.12), 0 4px 16px -4px rgba(0,0,0,0.06);
            --bseas-radius-lg: 20px; --bseas-radius-md: 14px; --bseas-radius-sm: 10px;
            --bseas-warning: #ffc107; --bseas-warning-bg: #fff3cd; --bseas-warning-border: #ffeeba; --bseas-warning-text: #856404;
            --bseas-ad-bg: #fffbeb; --bseas-ad-border: #fbbf24; --bseas-ad-text: #92400e;
            --bseas-ad-button: #f59e0b; --bseas-ad-button-hover: #FF8C00;
        }
        * { font-family: -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif !important; }
        .bseas-container { position:fixed; z-index:100000; }
        .bseas-trigger-btn { width:52px; height:52px; border-radius:16px; background:var(--bseas-primary); border:none; cursor:grab; box-shadow:0 8px 24px rgba(0,174,236,0.3); display:flex; align-items:center; justify-content:center; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); position:relative; }
        .bseas-trigger-btn:active { cursor:grabbing; }
        .bseas-trigger-btn:hover { transform:translateY(-2px) scale(1.04); box-shadow:0 12px 32px rgba(0,174,236,0.4); }
        .bseas-trigger-btn svg { width:24px; height:24px; fill:white; transition:transform 0.3s ease; pointer-events:none; }
        .bseas-trigger-btn:hover svg { transform:scale(1.1); }
        .bseas-status-dot { position:absolute; top:-2px; right:-2px; width:12px; height:12px; border-radius:50%; border:2px solid white; transition:background 0.3s,transform 0.3s; display:none; pointer-events:none; }
        .bseas-status-dot.state-yellow { display:block; background:#f59e0b; transform:scale(1.1); }
        .bseas-status-dot.state-green { display:block; background:#10b981; transform:scale(1.1); }
        @keyframes bseas-spin { to{transform:rotate(360deg)} }
        @keyframes bseas-fadein { from{opacity:0;transform:translateY(-10px) scale(0.98)}to{opacity:1;transform:none} }
        @keyframes bseas-fadeout { from{opacity:1;transform:none}to{opacity:0;transform:translateY(-10px) scale(0.98)} }
        @keyframes bseas-slideup { from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none} }
        @keyframes bseas-shake { 0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-2px)}20%,40%,60%,80%{transform:translateX(2px)} }
        .bseas-panel { position:absolute; width:430px; max-height:min(calc(100vh - 120px),66vh); background:var(--bseas-bg-glass); backdrop-filter:blur(24px); border-radius:var(--bseas-radius-lg); box-shadow:var(--bseas-shadow); border:1px solid rgba(255,255,255,0.4); display:none; flex-direction:column; overflow:hidden; animation:bseas-fadein 0.25s cubic-bezier(0.16,1,0.3,1); }
        .bseas-panel.show { display:flex; }
        .bseas-panel.hiding { animation:bseas-fadeout 0.2s ease forwards; }
        .bseas-header { padding:18px 22px 14px; border-bottom:1px solid var(--bseas-border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
        .bseas-header-text { cursor:move; flex:1; min-width:0; }
        .bseas-title { font-size:16px; font-weight:700; color:var(--bseas-text); margin:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .bseas-platform-tag { display:inline-block; padding:3px 8px; background:rgba(0,174,236,0.1); color:var(--bseas-primary); font-size:11px; font-weight:700; border-radius:6px; }
        .bseas-subtitle-info { font-size:13px; color:var(--bseas-text-dim); margin-top:4px; font-weight:500; transition:color 0.3s; }
        .bseas-ad-hint { font-size:12px; color:var(--bseas-warning-text); margin-top:2px; font-weight:500; display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
        .bseas-header-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
        .bseas-icon-btn { width:34px; height:34px; border-radius:var(--bseas-radius-sm); background:var(--bseas-bg-card); border:1px solid var(--bseas-border); cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--bseas-text-dim); transition:all 0.2s; text-decoration:none; }
        .bseas-icon-btn:hover { background:#e2e8f0; color:var(--bseas-text); transform:scale(1.05); }
        .bseas-icon-btn:active { transform:scale(0.95); }
        .bseas-icon-btn svg { width:18px; height:18px; fill:currentColor; transition:transform 0.4s ease; }
        .bseas-icon-btn.spinning svg { animation:bseas-spin 0.8s linear infinite; }
        .bseas-icon-btn.settings-btn:hover svg { transform:rotate(90deg); }
        .bseas-update-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; background:linear-gradient(135deg,#ef4444,#dc2626); color:white; font-size:11px; font-weight:700; border-radius:8px; cursor:pointer; text-decoration:none; transition:all 0.2s; margin-left:4px; vertical-align:middle; white-space:nowrap; }
        .bseas-update-badge:hover { transform:scale(1.05); box-shadow:0 2px 8px rgba(220,38,38,0.4); color:white; text-decoration:none; }
        .bseas-ext-links { display:flex; gap:8px; justify-content:center; align-items:center; flex-wrap:wrap; margin-bottom:14px; }
        .bseas-ext-link { display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:8px; text-decoration:none; font-size:12px; font-weight:500; transition:all 0.2s; color:var(--bseas-text-dim); background:var(--bseas-bg-card); border:1px solid var(--bseas-border); }
        .bseas-ext-link:hover { color:var(--bseas-text); border-color:#cbd5e1; transform:translateY(-1px); box-shadow:0 2px 6px rgba(0,0,0,0.06); text-decoration:none; }
        .bseas-ext-link svg { width:14px; height:14px; fill:currentColor; flex-shrink:0; }
        .bseas-api-warning { background:var(--bseas-warning-bg); border:1px solid var(--bseas-warning-border); border-radius:var(--bseas-radius-md); padding:12px 16px; margin:16px 22px 0; display:flex; align-items:center; gap:10px; animation:bseas-shake 0.5s ease; }
        .bseas-api-warning-icon { font-size:18px; }
        .bseas-api-warning-text { flex:1; font-size:13px; color:var(--bseas-warning-text); font-weight:600; }
        .bseas-api-warning-btn { background:var(--bseas-warning); color:white; border:none; border-radius:var(--bseas-radius-sm); padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .bseas-api-warning-btn:hover { background:#e0a800; transform:translateY(-1px); }
        .bseas-api-warning-btn:active { transform:translateY(0); }
        .bseas-source-section { border-bottom:1px solid var(--bseas-border); flex-shrink:0; }
        .bseas-source-header { display:flex; align-items:center; justify-content:space-between; padding:12px 22px; cursor:pointer; user-select:none; transition:background 0.2s; }
        .bseas-source-header:hover { background:rgba(0,0,0,0.02); }
        .bseas-source-label { font-size:13px; font-weight:600; color:var(--bseas-text-dim); }
        .bseas-source-arrow { width:20px; height:20px; display:flex; align-items:center; justify-content:center; transition:transform 0.3s cubic-bezier(0.4,0,0.2,1); color:var(--bseas-text-dim); }
        .bseas-source-arrow svg { width:16px; height:16px; fill:currentColor; }
        .bseas-source-arrow.collapsed { transform:rotate(-90deg); }
        .bseas-source-body { padding:0 22px 14px; display:flex; flex-wrap:wrap; gap:8px; animation:bseas-slideup 0.3s ease; }
        .bseas-source-body.hidden { display:none; }
        .bseas-subtitle-option { padding:6px 14px; background:white; border:1px solid var(--bseas-border); border-radius:20px; color:var(--bseas-text); font-size:13px; font-weight:500; cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); display:flex; align-items:center; gap:6px; position:relative; overflow:hidden; }
        .bseas-subtitle-option::before { content:''; position:absolute; top:0; left:0; width:0; height:100%; background:var(--bseas-primary); opacity:0.1; transition:width 0.3s ease; }
        .bseas-subtitle-option:hover { border-color:#cbd5e1; transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.06); }
        .bseas-subtitle-option:hover::before { width:100%; }
        .bseas-subtitle-option:active { transform:translateY(0); }
        .bseas-subtitle-option.active { background:var(--bseas-primary); border-color:var(--bseas-primary); color:white; transform:scale(1.02); box-shadow:0 4px 12px rgba(0,174,236,0.25); }
        .bseas-subtitle-option.active::before { display:none; }
        .bseas-tag { font-size:10px; font-weight:700; padding:2px 6px; border-radius:6px; transition:all 0.2s; }
        .bseas-subtitle-option:not(.active) .bseas-tag.ai { background:rgba(0,174,236,0.1); color:var(--bseas-primary); }
        .bseas-subtitle-option:not(.active) .bseas-tag.cc { background:rgba(16,185,129,0.1); color:#10b981; }
        .bseas-subtitle-option.active .bseas-tag { background:rgba(255,255,255,0.2); color:white; }
        .bseas-tabs { display:flex; padding:5px; background:var(--bseas-bg-card); border-radius:var(--bseas-radius-md); margin:16px 22px 4px; gap:4px; flex-shrink:0; }
        .bseas-tabs.hidden { display:none; }
        .bseas-tab { flex:1; padding:8px 0; border:none; background:transparent; color:var(--bseas-text-dim); font-size:13.5px; font-weight:600; cursor:pointer; border-radius:var(--bseas-radius-sm); transition:all 0.25s cubic-bezier(0.4,0,0.2,1); text-align:center; position:relative; overflow:hidden; }
        .bseas-tab::before { content:''; position:absolute; bottom:0; left:50%; width:0; height:2px; background:var(--bseas-primary); transition:all 0.3s ease; transform:translateX(-50%); }
        .bseas-tab:hover:not(.active) { color:var(--bseas-text); background:rgba(255,255,255,0.5); }
        .bseas-tab:hover:not(.active)::before { width:60%; }
        .bseas-tab.active { background:white; color:var(--bseas-primary); box-shadow:0 2px 8px rgba(0,0,0,0.06); transform:translateY(-1px); }
        .bseas-tab.active::before { width:80%; }
        .bseas-content { flex:1; min-height:0; overflow-y:auto; padding:14px 22px 20px; }
        .bseas-content::-webkit-scrollbar { width:6px; }
        .bseas-content::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; transition:background 0.2s; }
        .bseas-content::-webkit-scrollbar-thumb:hover { background:#94a3b8; }
        .bseas-checkbox-label { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; color:var(--bseas-text); cursor:pointer; user-select:none; transition:color 0.2s; }
        .bseas-checkbox-label:hover { color:var(--bseas-primary); }
        .bseas-checkbox-label input[type="checkbox"] { width:16px; height:16px; accent-color:#7dd3fc; cursor:pointer; margin:0; flex-shrink:0; transition:transform 0.2s; }
        .bseas-checkbox-label input[type="checkbox"]:hover { transform:scale(1.1); }
        .bseas-text-controls { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; padding:10px 14px; background:white; border-radius:var(--bseas-radius-sm); border:1px solid var(--bseas-border); transition:box-shadow 0.2s; }
        .bseas-text-controls:hover { box-shadow:0 2px 8px rgba(0,0,0,0.04); }
        .bseas-text-area { width:100%; min-height:280px; background:white; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-md); padding:16px; color:var(--bseas-text); font-size:14px; line-height:1.7; resize:vertical; box-sizing:border-box; transition:all 0.2s; }
        .bseas-text-area:focus { outline:none; border-color:var(--bseas-primary); box-shadow:0 0 0 3px rgba(0,174,236,0.1); transform:translateY(-1px); }
        .bseas-loading, .bseas-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--bseas-text-dim); font-size:15px; font-weight:500; gap:16px; animation:bseas-slideup 0.3s ease; }
        .bseas-spinner { width:32px; height:32px; border:3px solid rgba(0,174,236,0.15); border-top-color:var(--bseas-primary); border-radius:50%; animation:bseas-spin 0.8s linear infinite; }
        .bseas-search-box { position:relative; margin-bottom:14px; }
        .bseas-search-input { width:100%; padding:10px 14px; background:white; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-sm); font-size:14px; color:var(--bseas-text); box-sizing:border-box; transition:all 0.2s; }
        .bseas-search-input:focus { outline:none; border-color:var(--bseas-primary); box-shadow:0 0 0 3px rgba(0,174,236,0.1); }
        .bseas-search-count { position:absolute; right:12px; top:50%; transform:translateY(-50%); font-size:12px; color:var(--bseas-text-muted); pointer-events:none; }
        .bseas-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px; }
        .bseas-stat-item { background:white; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-md); padding:14px; text-align:center; transition:all 0.2s; }
        .bseas-stat-item:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,0.06); }
        .bseas-stat-label { font-size:12px; font-weight:600; color:var(--bseas-text-dim); margin-bottom:6px; }
        .bseas-stat-value { font-size:20px; font-weight:800; color:var(--bseas-text); transition:color 0.2s; }
        .bseas-stat-item:hover .bseas-stat-value { color:var(--bseas-primary); }
        .bseas-subtitle-item { padding:14px 16px; margin-bottom:10px; background:white; border-radius:var(--bseas-radius-md); border:1px solid var(--bseas-border); cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); display:flex; flex-direction:column; gap:6px; position:relative; overflow:hidden; }
        .bseas-subtitle-item::before { content:''; position:absolute; left:0; top:0; width:3px; height:0; background:var(--bseas-primary); transition:height 0.3s ease; }
        .bseas-subtitle-item:hover { border-color:#cbd5e1; box-shadow:0 4px 12px rgba(0,0,0,0.04); transform:translateY(-1px); }
        .bseas-subtitle-item:hover::before { height:100%; }
        .bseas-subtitle-item:active { transform:translateY(0); }
        .bseas-ts { font-size:12px; color:var(--bseas-primary); font-family:monospace; font-weight:700; background:rgba(0,174,236,0.06); align-self:flex-start; padding:2px 6px; border-radius:4px; transition:all 0.2s; }
        .bseas-subtitle-item:hover .bseas-ts { background:var(--bseas-primary); color:white; }
        .bseas-st { font-size:14.5px; color:var(--bseas-text); line-height:1.6; }
        .bseas-st mark { background:rgba(255,235,59,0.4); color:inherit; border-radius:3px; padding:0 2px; }
        .bseas-ai-big-btn { width:100%; padding:14px; background:var(--bseas-primary); color:white; border:none; border-radius:var(--bseas-radius-md); font-size:15px; font-weight:600; cursor:pointer; margin-bottom:16px; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); box-shadow:0 4px 16px rgba(0,174,236,0.25); position:relative; overflow:hidden; }
        .bseas-ai-big-btn::before { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent); transition:left 0.5s ease; }
        .bseas-ai-big-btn:hover:not(:disabled) { background:var(--bseas-primary-hover); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,174,236,0.35); }
        .bseas-ai-big-btn:hover:not(:disabled)::before { left:100%; }
        .bseas-ai-big-btn:active:not(:disabled) { transform:translateY(0); }
        .bseas-ai-big-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .bseas-retry-btn { position:absolute; top:16px; right:16px; width:32px; height:32px; background:#f1f5f9; border:none; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--bseas-text-dim); z-index:10; transition:background 0.2s,color 0.2s; animation:bseas-slideup 0.3s ease; }
        .bseas-retry-btn:hover { background:var(--bseas-primary); color:white; }
        .bseas-retry-btn svg { width:16px; height:16px; fill:currentColor; transition:transform 0.4s ease; }
        .bseas-retry-btn:hover svg { transform:rotate(180deg) scale(1.1); }
        .bseas-ai-result { background:white; border-radius:var(--bseas-radius-md); padding:24px; margin-bottom:16px; border:1px solid var(--bseas-border); color:var(--bseas-text); line-height:1.8; font-size:15px; transition:box-shadow 0.2s; animation:bseas-slideup 0.3s ease; }
        .bseas-ai-result:hover { box-shadow:0 4px 12px rgba(0,0,0,0.04); }
        .bseas-markdown h1 { font-size:20px; font-weight:800; margin:24px 0 12px; padding-bottom:10px; border-bottom:1px solid var(--bseas-border); }
        .bseas-markdown h2 { font-size:18px; font-weight:700; margin:20px 0 10px; }
        .bseas-markdown h3 { font-size:16px; font-weight:700; color:var(--bseas-primary); margin:18px 0 8px; }
        .bseas-markdown h4, .bseas-markdown h5, .bseas-markdown h6 { font-size:15px; font-weight:700; color:var(--bseas-text); margin:16px 0 8px; }
        .bseas-markdown p { margin-bottom:14px; font-size:15px; color:#334155; }
        .bseas-markdown ul,.bseas-markdown ol { margin:10px 0 16px; padding-left:24px; }
        .bseas-markdown ul { list-style-type:disc; }
        .bseas-markdown li { margin-bottom:8px; font-size:15px; color:#334155; line-height:1.7; }
        .bseas-markdown strong { color:var(--bseas-text); font-weight:700; }
        .bseas-markdown code { background:#f1f5f9; color:var(--bseas-primary); padding:2px 6px; border-radius:4px; font-size:13.5px; }
        .bseas-markdown blockquote { border-left:4px solid var(--bseas-primary); margin:14px 0; padding:10px 16px; background:#f0f9ff; border-radius:0 var(--bseas-radius-sm) var(--bseas-radius-sm) 0; color:var(--bseas-text-dim); }
        .bseas-markdown hr { border:none; height:1px; background:var(--bseas-border); margin:20px 0; }
        .bseas-sp-box { border-radius:24px; padding:16px 20px; margin-bottom:16px; display:flex; flex-direction:column; gap:10px; animation:bseas-slideup 0.3s ease; }
        .bseas-sp-box.status-found { background:var(--bseas-ad-bg); border:2px solid var(--bseas-ad-border); box-shadow:0 4px 16px rgba(251,191,36,0.15); }
        .bseas-sp-box.status-none { background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%); border:1px solid #22c55e; box-shadow:0 4px 12px rgba(34,197,94,0.1); }
        .bseas-sp-box.status-err { background:linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%); border:1px solid #ef4444; box-shadow:0 4px 12px rgba(239,68,68,0.1); }
        .bseas-sp-header { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .bseas-sp-icon { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:bold; flex-shrink:0; }
        .status-found .bseas-sp-icon { background:#FF8C00; color:white; box-shadow:0 2px 8px rgba(217,119,6,0.4); }
        .status-none .bseas-sp-icon { background:#22c55e; color:white; box-shadow:0 2px 8px rgba(34,197,94,0.3); }
        .status-err .bseas-sp-icon { background:#ef4444; color:white; box-shadow:0 2px 8px rgba(239,68,68,0.3); }
        .bseas-sp-title { font-size:14px; font-weight:700; flex:1; }
        .status-found .bseas-sp-title { color:var(--bseas-ad-text); }
        .status-none .bseas-sp-title { color:#166534; }
        .status-err .bseas-sp-title { color:#991b1b; }
        .bseas-sp-badge { background:white; border:1px solid var(--bseas-ad-border); border-radius:10px; padding:6px 12px; font-family:monospace; font-size:13px; font-weight:700; color:var(--bseas-ad-text); box-shadow:0 2px 4px rgba(0,0,0,0.05); }
        .bseas-sp-action-row { display:flex; align-items:center; gap:10px; margin-left:34px; }
        .bseas-sp-action-row .bseas-sp-badge { flex:1; }
        .bseas-sp-skip { background:var(--bseas-ad-button); color:white; border:none; border-radius:10px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); box-shadow:0 2px 8px rgba(245,158,11,0.3); flex-shrink:0; }
        .bseas-sp-skip:hover { background:var(--bseas-ad-button-hover); transform:translateY(-2px) scale(1.02); box-shadow:0 4px 12px rgba(245,158,11,0.4); }
        .bseas-sp-skip:active { transform:translateY(0) scale(0.98); }
        .bseas-sp-hint { font-size:12px; color:#b45309; margin-left:34px; }
        .bseas-followup-section { margin-top:4px; background:white; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-md); padding:16px; transition:box-shadow 0.2s; animation:bseas-slideup 0.3s ease; }
        .bseas-followup-section:hover { box-shadow:0 4px 12px rgba(0,0,0,0.04); }
        .bseas-followup-label { font-size:13px; font-weight:700; color:var(--bseas-primary); margin-bottom:10px; display:flex; align-items:center; gap:6px; }
        .bseas-followup-input { width:100%; background:#f8fafc; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-sm); padding:12px 14px; color:var(--bseas-text); font-size:14px; margin-bottom:12px; resize:none; height:72px; box-sizing:border-box; transition:all 0.2s; }
        .bseas-followup-input:focus { outline:none; border-color:var(--bseas-primary); background:white; transform:translateY(-1px); box-shadow:0 0 0 3px rgba(0,174,236,0.1); }
        .bseas-followup-btn { width:100%; padding:12px; background:var(--bseas-primary); color:white; border:none; border-radius:var(--bseas-radius-sm); font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .bseas-followup-btn:hover:not(:disabled) { background:var(--bseas-primary-hover); transform:translateY(-1px); }
        .bseas-followup-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .bseas-qa-item { margin-top:16px; padding-top:16px; border-top:1px solid var(--bseas-border); animation:bseas-slideup 0.3s ease; }
        .bseas-qa-q { font-size:14px; font-weight:700; color:var(--bseas-text); margin-bottom:10px; background:#f1f5f9; padding:10px 14px; border-radius:var(--bseas-radius-sm); transition:background 0.2s; }
        .bseas-qa-q:hover { background:#e2e8f0; }
        .bseas-qa-a { font-size:14.5px; color:var(--bseas-text); line-height:1.7; padding:0 4px; }
        .bseas-noapi-box { background:var(--bseas-warning-bg); border:1px solid var(--bseas-warning-border); border-radius:var(--bseas-radius-md); padding:16px; margin-bottom:16px; }
        .bseas-noapi-title { font-size:14px; font-weight:700; color:var(--bseas-warning-text); margin-bottom:8px; display:flex; align-items:center; gap:6px; }
        .bseas-noapi-desc { font-size:13px; color:var(--bseas-warning-text); line-height:1.6; margin-bottom:12px; }
        .bseas-settings-group { margin-bottom:8px; }
        .bseas-settings-group + .bseas-settings-group { margin-top:48px; padding-top:34px; border-top:1px solid var(--bseas-border); }
        .bseas-settings-group-title { font-size:15px; font-weight:800; color:var(--bseas-text); margin-bottom:16px; display:flex; align-items:center; gap:8px; }
        .bseas-settings-group-title-dot {
            width: 4px;
            height: 16px;
            border-radius: 2px;
            background: var(--bseas-primary);
            flex-shrink: 0;
        }
        .bseas-settings-subgroup { margin-bottom:22px; }
        .bseas-settings-subgroup:last-child { margin-bottom:0; }
        .bseas-settings-subgroup-title { font-size:13.5px; font-weight:700; color:var(--bseas-text); margin-bottom:14px; letter-spacing:0.2px; }
        .bseas-settings-subgroup + .bseas-settings-subgroup { padding-top:18px; border-top:1px solid var(--bseas-border); }
        .bseas-settings-block { margin-bottom:16px; }
        .bseas-settings-block:last-child { margin-bottom:0; }
        .bseas-settings-block-label { display:block; font-size:13px; font-weight:600; color:var(--bseas-text-dim); margin-bottom:8px; }
        .bseas-settings-input { width:100%; padding:12px 14px; background:#f8fafc; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-sm); font-size:14px; color:var(--bseas-text); box-sizing:border-box; transition:all 0.2s; }
        .bseas-settings-input:focus { outline:none; border-color:var(--bseas-primary); background:white; box-shadow:0 0 0 3px rgba(0,174,236,0.1); transform:translateY(-1px); }
        .bseas-settings-check-row { display:flex; align-items:flex-start; gap:10px; cursor:pointer; user-select:none; transition:opacity 0.2s; }
        .bseas-settings-check-row:hover { opacity:0.9; }
        .bseas-settings-check-row input[type="checkbox"] { width:16px; height:16px; margin-top:3px; accent-color:#7dd3fc; cursor:pointer; flex-shrink:0; transition:transform 0.2s; }
        .bseas-settings-check-row input[type="checkbox"]:hover { transform:scale(1.1); }
        .bseas-settings-check-text { display:flex; flex-direction:column; gap:4px; }
        .bseas-settings-check-title { font-size:14px; font-weight:500; color:var(--bseas-text); line-height:1.4; }
        .bseas-settings-check-desc { font-size:12px; color:var(--bseas-text-muted); line-height:1.5; }
        .bseas-password-mask { -webkit-text-security:disc; }
        .bseas-danger-link { display:inline-block; color:#dc2626; font-size:13px; text-decoration:none; cursor:pointer; transition:color 0.2s; margin-top:16px; }#bseas-clear-cache {
    color: #00AEEC;
}
#bseas-clear-cache:hover {
    color: #d97706;
}
        .bseas-danger-link:hover { color:#991b1b; text-decoration:underline; }
        .bseas-author-info { margin-top:28px; padding-top:24px; border-top:1px solid var(--bseas-border); text-align:center; }
        .bseas-author-text { font-size:13px; color:var(--bseas-text-muted); }
        .bseas-author-link { color:var(--bseas-primary); text-decoration:none; font-weight:400; transition:color 0.2s; }
        .bseas-author-link:hover { color:var(--bseas-primary-hover); text-decoration:underline; }
        .bseas-footer { padding:16px 22px; border-top:1px solid var(--bseas-border); display:flex; gap:12px; flex-shrink:0; flex-direction:column; }
        .bseas-btn { flex:1; min-width:0; padding:12px 8px; border:none; border-radius:var(--bseas-radius-md); font-size:13.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; white-space:nowrap; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; }
        .bseas-btn::before { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent); transition:left 0.5s ease; }
        .bseas-btn:hover:not(:disabled)::before { left:100%; }
        .bseas-btn-primary { background:var(--bseas-primary); color:white; }
        .bseas-btn-primary:hover:not(:disabled) { background:var(--bseas-primary-hover); transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,174,236,0.2); }
        .bseas-btn-primary:active:not(:disabled) { transform:translateY(0); }
        .bseas-btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
        .bseas-btn-secondary { background:white; color:var(--bseas-text); border:1px solid var(--bseas-border); }
        .bseas-btn-secondary:hover:not(:disabled) { background:#f8fafc; border-color:#cbd5e1; transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.04); }
        .bseas-btn-secondary:active:not(:disabled) { transform:translateY(0); }
        .bseas-btn-secondary:disabled { opacity:0.5; cursor:not-allowed; }
        .bseas-toast { position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(16px) scale(0.95); background:rgba(15,23,42,0.95); color:white; padding:12px 24px; border-radius:12px; font-size:14px; font-weight:500; opacity:0; transition:opacity 0.25s ease,transform 0.25s cubic-bezier(0.16,1,0.3,1); z-index:100001; pointer-events:none; white-space:nowrap; max-width:80vw; }
        .bseas-toast.show { opacity:1; transform:translateX(-50%) translateY(0) scale(1); }
        .bseas-toast.success { background:rgba(16,185,129,0.95); }
        .bseas-toast.error { background:rgba(239,68,68,0.95); }
        .bseas-toast.warning { background:rgba(255,193,7,0.95); }
        .bseas-settings-input:disabled,
        .bseas-settings-check-row.disabled-setting {
            opacity: 0.45;
            pointer-events: none;
            filter: grayscale(60%);
            background-color: #f1f5f9;
        }
        .bseas-settings-check-row.disabled-setting {
            cursor: default;
        }
    `);

    // ===================== 6. 全局状态 =====================
    let allSubtitles = [];
    let currentSubtitleData = null;
    let selectedSubtitleId = null;
    let panelVisible = false;
    let currentTab = 'preview';
    let isLoading = false;
    let showTimestamps = true;
    let showRawAIText = false;
    let sourceCollapsed = true;
    let currentVideoKey = null;
    let currentAid = null;
    let hotComments = [];
    let aiSummaryCache = {};
    let aiConversationHistory = [];
    let adSegments = [];
    let hasJumpedAds = {};
    let adSkipInterval = null;
    let progressMarkObserver = null;
    let isGeneratingAI = false;
    let autoGenerateTimer = null;
    let currentGenerationId = 0;
    let progressMarkInitialized = false;
    let lastAdCheckResult = null;
    let latestVersion = null;
    let hasUpdate = false;
    let updateLinkUrl = null;
    let currentAbortController = null;
    let currentGMXHR = null;
    let subtitleSearchKeyword = '';
    let _documentClickHandler = null;

    // ===================== 7. 日志工具 =====================
    function log(...args) { console.log('[BSEAS]', ...args); }

    // ===================== 8. 储存管理 =====================
    function loadCache() {
        const raw = GM_getValue('aiSummaryCache', {});
        const result = {};
        for (const key of Object.keys(raw)) {
            const val = raw[key];
            if (typeof val === 'string') result[key] = { prompt: '', summary: val, qa: [] };
            else if (val && typeof val === 'object' && typeof val.summary === 'string') {
                result[key] = { prompt: typeof val.prompt === 'string' ? val.prompt : '', summary: val.summary, qa: Array.isArray(val.qa) ? val.qa : [] };
            }
        }
        return result;
    }
    function getCachedPrompt(videoKey) { const e = aiSummaryCache[videoKey]; return (!e || typeof e === 'string') ? null : (e.prompt || ''); }
    function getCachedSummary(videoKey) { const e = aiSummaryCache[videoKey]; if (!e) return null; return typeof e === 'string' ? e : (e.summary || null); }
    function getCachedQA(videoKey) { const e = aiSummaryCache[videoKey]; return (!e || typeof e === 'string') ? [] : (Array.isArray(e.qa) ? e.qa : []); }
    function setCachedSummary(videoKey, prompt, summary) {
        const existing = aiSummaryCache[videoKey];
        const qa = (existing && Array.isArray(existing.qa)) ? existing.qa : [];
        aiSummaryCache[videoKey] = { prompt, summary, qa };
        GM_setValue('aiSummaryCache', aiSummaryCache);
    }
    function appendCachedQA(videoKey, q, a) {
        const entry = aiSummaryCache[videoKey];
        if (!entry) return;
        if (!Array.isArray(entry.qa)) entry.qa = [];
        entry.qa.push({ q, a });
        GM_setValue('aiSummaryCache', aiSummaryCache);
    }

    // ===================== 9. 通用工具 =====================
    function formatTime(s) { const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2,'0')}`; }
    function formatTimeWithMs(s) { const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 100); return `${m}:${sec.toString().padStart(2,'0')}.${ms.toString().padStart(2,'0')}`; }
    function formatTimeForSRT(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 1000); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`; }
    function parseAdTime(str) { str = str.trim(); const m = str.match(/^(\d+):(\d{2})$/); return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null; }
    function formatCommentsForAI() { return hotComments.length ? hotComments.map(c => `${c.content.length > 200 ? c.content.slice(0,200) + '...' : c.content} ${c.like}`).join('\n') : ''; }
    function showToast(msg, type = '') {
        let el = document.querySelector('.bseas-toast');
        if (!el) { el = document.createElement('div'); el.className = 'bseas-toast'; document.body.appendChild(el); }
        el.textContent = msg;
        el.className = 'bseas-toast' + (type ? ' ' + type : '');
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 2500);
    }
    function seekToTime(sec) { const v = document.querySelector('video'); if (v) { v.currentTime = sec; showToast(`跳转到 ${formatTime(sec)}`, 'success'); } }
    function setLoadingState(loading) { isLoading = loading; document.querySelector('#bseas-refresh-btn')?.classList.toggle('spinning', loading); }
    function getVideoTitle() { const h1 = document.querySelector('h1.video-title'); if (!h1) return ''; return h1.dataset.title || h1.getAttribute('title') || h1.textContent.trim(); }
    function getVideoDescription() { const el = document.querySelector('.desc-info-text'); return el ? el.textContent.trim() : ''; }
    function getVideoTags() { const els = document.querySelectorAll('.tag-link .tag-name'); return els.length ? Array.from(els).map(t => t.textContent.trim()) : []; }
    function sanitizeFilename(name) { return (name || 'subtitle').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100); }
    function compareVersions(v1, v2) {
        const p1 = v1.split('.').map(Number), p2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const a = p1[i] || 0, b = p2[i] || 0;
            if (a > b) return 1; if (a < b) return -1;
        }
        return 0;
    }

    // ===================== 10. 更新检测 =====================
    let scriptcatCheckResult = null, githubCheckResult = null, scriptcatCheckDone = false, githubCheckDone = false;
    function resolveUpdateAfterChecks() {
        if (!scriptcatCheckDone || !githubCheckDone) return;
        let chosen = null;
        if (githubCheckResult) chosen = { source: 'Github', version: githubCheckResult.version, url: GITHUB_REPO_URL };
        else if (scriptcatCheckResult) chosen = { source: 'ScriptCat', version: scriptcatCheckResult.version, url: SCRIPTCAT_URL };
        if (!chosen) { log('更新检测: 两个来源均未检测成功'); return; }
        if (compareVersions(chosen.version, SCRIPT_VERSION) > 0) {
            latestVersion = chosen.version; updateLinkUrl = chosen.url; hasUpdate = true;
            log(`发现新版本(${chosen.source}):`, latestVersion);
            showUpdateBadgeInPanel();
        } else { log(`当前已是最新版本(${chosen.source}):`, SCRIPT_VERSION); }
    }
    function checkForUpdates() {
        GM_xmlhttpRequest({
            method: 'GET', url: 'https://scriptcat.org/zh-CN/script-show-page/6728/version', timeout: 8000,
            onload: function (response) {
                if (response.status === 200) {
                    try {
                        const doc = new DOMParser().parseFromString(response.responseText, 'text/html');
                        const labelNode = doc.evaluate("//*[normalize-space(text())='最新版本']", doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (labelNode) {
                            const container = labelNode.closest('div, li, section');
                            if (container) { const m = container.textContent.match(/\d+\.\d+\.\d+/); if (m) scriptcatCheckResult = { version: m[0] }; }
                        }
                    } catch (e) { log('ScriptCat更新检测解析异常:', e); }
                }
                scriptcatCheckDone = true; resolveUpdateAfterChecks();
            },
            onerror: () => { scriptcatCheckDone = true; resolveUpdateAfterChecks(); },
            ontimeout: () => { scriptcatCheckDone = true; resolveUpdateAfterChecks(); }
        });
        GM_xmlhttpRequest({
            method: 'GET', url: CHANGELOG_RAW_URL, timeout: 8000,
            onload: function (response) {
                if (response.status === 200) { const m = response.responseText.match(/##\s*\[([^\]]+)\]/); if (m && m[1]) githubCheckResult = { version: m[1].trim() }; }
                githubCheckDone = true; resolveUpdateAfterChecks();
            },
            onerror: () => { log('更新检测: 网络请求失败'); githubCheckDone = true; resolveUpdateAfterChecks(); },
            ontimeout: () => { log('更新检测: 请求超时'); githubCheckDone = true; resolveUpdateAfterChecks(); }
        });
    }
    function showUpdateBadgeInPanel() {
        const hint = document.getElementById('bseas-ad-hint');
        if (hint && !hint.querySelector('.bseas-update-badge')) {
            const badge = document.createElement('a');
            badge.href = updateLinkUrl || SCRIPTCAT_URL; badge.target = '_blank';
            badge.className = 'bseas-update-badge'; badge.textContent = '新版本 v' + latestVersion;
            hint.appendChild(badge);
        }
    }

    // ===================== 11. 进度条广告标记 =====================
    function waitForElement(selector, callback) {
        const el = document.querySelector(selector);
        if (el) callback(el); else setTimeout(() => waitForElement(selector, callback), 100);
    }
    function createProgressMark(video, progressArea) {
        const existing = document.getElementById('bseas-ad-progress-mark');
        if (existing) existing.remove();
        if (!adSegments || adSegments.length === 0) return;
        const mark = document.createElement('div');
        mark.id = 'bseas-ad-progress-mark';
        mark.style.cssText = `position:absolute;height:100%;background:${AD_MARK_COLOR};z-index:1;pointer-events:none;border-radius:2px;`;
        progressArea.appendChild(mark);
        function updateMarkPosition() {
            const duration = video.duration;
            if (!duration || duration < adSegments[0].end) return;
            const startPct = (adSegments[0].start / duration) * 100;
            const endPct = (adSegments[0].end / duration) * 100;
            mark.style.left = `${startPct}%`;
            mark.style.width = `${endPct - startPct}%`;
        }
        updateMarkPosition();
        video.addEventListener('durationchange', updateMarkPosition);
        video.addEventListener('loadedmetadata', updateMarkPosition);
    }
    function initProgressMark() {
        if (progressMarkInitialized) return;
        progressMarkInitialized = true;
        waitForElement('.bpx-player-video-wrap video', (video) => {
            waitForElement('.bpx-player-progress-area', (progressArea) => {
                createProgressMark(video, progressArea);
                if (progressMarkObserver) progressMarkObserver.disconnect();
                progressMarkObserver = new MutationObserver(() => {
                    const newVideo = document.querySelector('.bpx-player-video-wrap video');
                    if (newVideo && newVideo !== video) {
                        progressMarkInitialized = false;
                        if (progressMarkObserver) { progressMarkObserver.disconnect(); progressMarkObserver = null; }
                        initProgressMark();
                    }
                });
                progressMarkObserver.observe(document.body, { childList: true, subtree: true });
            });
        });
    }

    // ===================== 12. Markdown 渲染 =====================
    function processInline(text) {
        text = escapeHtml(text);
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    function markdownToHtml(md) {
        if (!md) return '';
        md = md.replace(/\r\n/g, '\n');
        const lines = md.split('\n');
        let out = [], stack = [], inCode = false, code = [];
        for (const line of lines) {
            if (line.trim().startsWith('```')) {
                if (inCode) { out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>'); code = []; inCode = false; }
                else inCode = true;
                continue;
            }
            if (inCode) { code.push(line); continue; }
            const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
            const t = line.trim();
            if (!t) continue;
            const ul = t.match(/^[-*][ \t]+(.*)$/), ol = t.match(/^\d+\.[ \t]+(.*)$/);
            if (ul || ol) {
                const type = ul ? 'ul' : 'ol', cnt = processInline(ul ? ul[1] : ol[1]);
                if (!stack.length) { stack.push({ type, indent }); out.push(`<${type}>`); }
                else {
                    const top = stack[stack.length - 1];
                    if (indent > top.indent) { stack.push({ type, indent }); out.push(`<${type}>`); }
                    else if (indent < top.indent) {
                        while (stack.length && stack[stack.length - 1].indent > indent) out.push(`</${stack.pop().type}>`);
                        if (!stack.length || stack[stack.length - 1].indent < indent) { stack.push({ type, indent }); out.push(`<${type}>`); }
                    }
                    else if (top.type !== type) { out.push(`</${stack.pop().type}>`); stack.push({ type, indent }); out.push(`<${type}>`); }
                }
                out.push(`<li>${cnt}</li>`);
                continue;
            }
            while (stack.length) out.push(`</${stack.pop().type}>`);
            if (/^---+$/.test(t)) { out.push('<hr>'); continue; }
            const h = t.match(/^(#{1,6})[ \t]+(.*)$/);
            if (h) { out.push(`<h${h[1].length}>${processInline(h[2])}</h${h[1].length}>`); continue; }
            const bq = t.match(/^>[ \t]*(.*)$/);
            if (bq) { out.push(`<blockquote>${processInline(bq[1])}</blockquote>`); continue; }
            out.push(`<p>${processInline(t)}</p>`);
        }
        while (stack.length) out.push(`</${stack.pop().type}>`);
        return out.join('\n');
    }
    function renderMarkdownInto(el, md) {
        safeSetInnerHTML(el, markdownToHtml(md));
        renderLatex(el);
    }

    // ===================== 13. 广告解析与跳过 =====================
    function extractAdSegments(rawSummary) {
        const text = rawSummary.replace(/\*/g, '').replace(/`/g, '').replace(/#/g, ' ');
        const timeRe = /广告时间[\s\S]{0,80}?\[(\d+:\d{2})\s*[-–—~至]\s*(\d+:\d{2})\]/g;
        const timeMatches = [...text.matchAll(timeRe)];
        if (timeMatches.length > 0) {
            const last = timeMatches[timeMatches.length - 1];
            const start = parseAdTime(last[1]), end = parseAdTime(last[2]);
            if (start !== null && end !== null && end > start) return { type: 'has_ad', segments: [{ start, end, startStr: last[1], endStr: last[2] }] };
        }
        const noRe = /广告时间[\s\S]{0,80}?\[\s*无[^\]]*\]/g;
        if ([...text.matchAll(noRe)].length > 0) return { type: 'none', segments: [] };
        return { type: 'error', segments: [] };
    }
    function stripAdLine(summary) {
        const lines = summary.split('\n');
        let cutIndex = lines.length;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].replace(/[#\s*`]/g, '').includes('广告时间')) {
                cutIndex = i;
                while (cutIndex > 0 && /^[#\s]/.test(lines[cutIndex - 1]) && lines[cutIndex - 1].trim() === '') cutIndex--;
                break;
            }
        }
        return lines.slice(0, cutIndex).join('\n').trim();
    }
    function initAdSkipMonitor() {
        if (adSkipInterval) clearInterval(adSkipInterval);
        adSkipInterval = setInterval(() => {
            if (!bseas_auto_skip_ad || !adSegments?.length) return;
            const video = document.querySelector('video');
            if (!video || video.readyState === 0) return;
            const ct = video.currentTime;
            adSegments.forEach((ad, i) => {
                if (ct >= ad.start && ct < ad.end - 0.3) {
                    video.currentTime = ad.end;
                    const key = `${currentVideoKey}-${i}`;
                    if (Date.now() - (hasJumpedAds[key] || 0) > 3000) {
                        showToast('✓ 已自动跳过广告', 'success');
                        hasJumpedAds[key] = Date.now();
                    }
                }
            });
        }, AD_CHECK_INTERVAL_MS);
    }

    // ===================== 14. B站 API =====================
    async function fetchBilibiliSubtitles() {
        const url = window.location.href;
        const bvid = (url.match(/(BV[\w]+)/) || [])[1];
        const page = parseInt((url.match(/[?&]p=(\d+)/) || [, 1])[1]);
        if (!bvid) return [];
        try {
            const vr = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { credentials: 'include' });
            const vd = await vr.json();
            if (vd.code !== 0 || !vd.data) return [];
            const aid = vd.data.aid, pages = vd.data.pages || [];
            let cid = vd.data.cid;
            if (pages.length >= page) cid = pages[page - 1].cid;
            currentAid = aid;
            const pr = await fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, { credentials: 'include' });
            const pd = await pr.json();
            if (pd.code !== 0 || !pd.data?.subtitle?.subtitles) return [];
            return pd.data.subtitle.subtitles.map((s, i) => ({
                id: s.id || i, lan: s.lan, lan_doc: s.lan_doc, subtitle_url: s.subtitle_url,
                isAI: s.lan.startsWith('ai-'), body: null
            }));
        } catch (e) { return []; }
    }
    async function fetchSubtitleContent(url) {
        try {
            if (url.startsWith('//')) url = 'https:' + url;
            const r = await fetch(url);
            const d = await r.json();
            return d.body || [];
        } catch (e) { return []; }
    }
    async function fetchHotComments() {
        let aid = currentAid;
        if (!aid) { try { aid = unsafeWindow.__INITIAL_STATE__?.aid; } catch (e) {} }
        if (!aid) return [];
        try {
            const r = await fetch(`https://api.bilibili.com/x/v2/reply/main?type=1&oid=${aid}&mode=3&next=0&ps=${bseas_opinion_comments_count}`, { credentials: 'include' });
            const d = await r.json();
            if (d.code !== 0 || !d.data?.replies) return [];
            return d.data.replies.map(r => ({ content: r.content.message, like: r.like }));
        } catch (e) { return []; }
    }

    // ===================== 15. AI API 调用 =====================
    function abortCurrentRequest() {
        if (currentAbortController) { try { currentAbortController.abort(); } catch (e) {} currentAbortController = null; }
        if (currentGMXHR && typeof currentGMXHR.abort === 'function') { try { currentGMXHR.abort(); } catch (e) {} currentGMXHR = null; }
    }
    async function callAPIStream(messages, onChunk) {
        const isClaude = bseas_api_url.includes('anthropic.com');
        const isGemini = bseas_api_url.includes('generativelanguage.googleapis.com');
        const actualModel = bseas_model.replace(' (免费)', '');
        let fetchUrl = bseas_api_url;
        const safeApiKey = bseas_api_key.replace(/[^\x20-\x7E]/g, '');
        const headers = { 'Content-Type': 'application/json' };
        let bodyData = {};
        if (isClaude) {
            headers['x-api-key'] = safeApiKey;
            headers['anthropic-version'] = '2023-06-01';
            headers['Accept'] = 'text/event-stream';
            bodyData = { model: actualModel, max_tokens: 8192, stream: true, messages: messages };
        } else if (isGemini) {
            fetchUrl = fetchUrl.replace('{model_name}', actualModel);
            if (fetchUrl.includes(':generateContent')) fetchUrl = fetchUrl.replace(':generateContent', ':streamGenerateContent');
            fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `key=${safeApiKey}&alt=sse`;
            bodyData = { contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) };
        } else {
            headers['Authorization'] = `Bearer ${safeApiKey}`;
            headers['Accept'] = 'text/event-stream';
            bodyData = { model: actualModel, messages: messages, stream: true };
        }
        currentAbortController = new AbortController();
        const resp = await fetch(fetchUrl, { method: 'POST', headers, body: JSON.stringify(bodyData), signal: currentAbortController.signal });
        if (!resp.ok) {
            const errMap = { 401:'HTTP 401 (未授权，请检查API Key)', 403:'HTTP 403 (禁止访问)', 404:'HTTP 404 (请核对URL与模型名)', 408:'HTTP 408 (请求超时)', 413:'HTTP 413 (请求体过大)', 429:'HTTP 429 (请求频率过高)', 500:'HTTP 500 (AI服务内部异常)', 502:'HTTP 502 (网关错误)', 503:'HTTP 503 (服务不可用)' };
            throw new Error(errMap[resp.status] || `HTTP ${resp.status}`);
        }
        if (!resp.body) throw new Error('不支持流式响应');
        const reader = resp.body.getReader();
        const dec = new TextDecoder('utf-8');
        let buf = '', full = '';
        let lastChunkTime = Date.now();
        const idleTimer = setInterval(() => {
            if (Date.now() - lastChunkTime > 90000) { try { reader.cancel('idle timeout'); } catch (e) {} }
        }, 10000);
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                lastChunkTime = Date.now();
                buf += dec.decode(value, { stream: true });
                const lines = buf.split(/\r?\n/);
                buf = lines.pop() || '';
                for (const line of lines) {
                    const t = line.trim();
                    if (!t || t.startsWith(':')) continue;
                    if (isClaude && t.startsWith('event:')) continue;
                    if (t.startsWith('data:')) {
                        const ds = t.slice(5).trim();
                        if (!isClaude && ds === '[DONE]') return full;
                        try {
                            const d = JSON.parse(ds);
                            let chunk = '';
                            if (isGemini) chunk = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
                            else if (isClaude) { if (d.type === 'content_block_delta') chunk = d.delta?.text || ''; else if (d.type === 'message_stop') return full; }
                            else chunk = d.choices?.[0]?.delta?.content || '';
                            if (chunk) { full += chunk; onChunk(full); }
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') throw new Error('请求已取消');
            throw e;
        } finally {
            clearInterval(idleTimer);
            currentAbortController = null;
        }
        return full;
    }
    function callAPINoStream(messages) {
        return new Promise((resolve, reject) => {
            const isClaude = bseas_api_url.includes('anthropic.com');
            const isGemini = bseas_api_url.includes('generativelanguage.googleapis.com');
            const actualModel = bseas_model.replace(' (免费)', '');
            let fetchUrl = bseas_api_url;
            const safeApiKey = bseas_api_key.replace(/[^\x20-\x7E]/g, '');
            const headers = { 'Content-Type': 'application/json' };
            let bodyData = {};
            if (isClaude) {
                headers['x-api-key'] = safeApiKey; headers['anthropic-version'] = '2023-06-01';
                bodyData = { model: actualModel, max_tokens: 8192, messages: messages };
            } else if (isGemini) {
                fetchUrl = fetchUrl.replace('{model_name}', actualModel);
                fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `key=${safeApiKey}`;
                bodyData = { contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) };
            } else {
                headers['Authorization'] = `Bearer ${safeApiKey}`;
                bodyData = { model: actualModel, messages: messages };
            }
            currentGMXHR = GM_xmlhttpRequest({
                method: 'POST', url: fetchUrl, headers, data: JSON.stringify(bodyData), timeout: 60000,
                onload(r) {
                    currentGMXHR = null;
                    if (r.status === 401) return reject(new Error('HTTP 401 (未授权)'));
                    if (r.status === 429) return reject(new Error('HTTP 429 (请求频率过高)'));
                    try {
                        const d = JSON.parse(r.responseText);
                        if (d.error) return reject(new Error(d.error.message || JSON.stringify(d.error)));
                        let result;
                        if (isClaude) result = d.content?.[0]?.text;
                        else if (isGemini) result = d.candidates?.[0]?.content?.parts?.[0]?.text;
                        else result = d.choices?.[0]?.message?.content;
                        if (!result) return reject(new Error('API返回异常'));
                        resolve(result);
                    } catch (e) { reject(new Error('解析失败')); }
                },
                onerror() { currentGMXHR = null; reject(new Error('网络错误')); },
                ontimeout() { currentGMXHR = null; reject(new Error('请求超时')); }
            });
        });
    }
    function buildFullPrompt(subtitleText, includeFormatRules = true) {
        const hasSubtitle = !!subtitleText.trim();
        let contextInfo = '';
        const videoTitle = getVideoTitle();
        const videoDesc = getVideoDescription();
        const videoTags = getVideoTags();
        if (videoTitle) contextInfo += `视频标题：${videoTitle}\n`;
        if (videoDesc) contextInfo += `视频简介：${videoDesc}\n`;
        if (videoTags.length > 0) contextInfo += `视频标签：${videoTags.join(', ')}\n`;
        if (contextInfo) contextInfo += '\n';
        const commentsText = (bseas_opinion_analysis && hotComments.length > 0) ? formatCommentsForAI() : '';
        if (commentsText) contextInfo += `===== 热门评论（按热度排序）=====\n${commentsText}\n\n`;
        return `${getAISummaryPrompt(hasSubtitle, includeFormatRules)}\n\n${contextInfo}${hasSubtitle ? '===== 视频字幕 =====\n' + subtitleText : ''}`;
    }
    async function generateAISummaryStream(subtitleText, streamEl) {
        const fullPrompt = buildFullPrompt(subtitleText);
        const messages = [{ role: 'user', content: fullPrompt }];
        let summary = await callAPIStream(messages, text => {
            safeSetInnerHTML(streamEl, markdownToHtml(text));
            renderLatex(streamEl);
            streamEl.scrollTop = streamEl.scrollHeight;
        });
        let adCheck = extractAdSegments(summary);
        lastAdCheckResult = adCheck;

        setCachedSummary(currentVideoKey, fullPrompt, summary);
        aiConversationHistory = [{ role: 'user', content: fullPrompt, fullContent: fullPrompt }, { role: 'assistant', content: summary }];
        adSegments = adCheck.segments;
        if (adSegments.length > 0) { initProgressMark(); initAdSkipMonitor(); }

        if (adCheck.type === 'error') {
            safeSetInnerHTML(streamEl, markdownToHtml(summary) + '<div style="margin-top:14px;color:#f59e0b;font-size:13px;display:flex;align-items:center;gap:6px;"><div class="bseas-spinner" style="width:14px;height:14px;border-width:2px;"></div>格式校验修正中...</div>');
            messages.push({ role: 'assistant', content: summary });
            messages.push({ role: 'user', content: '你没有正确输出广告时间。请输出一行：有广告输出"广告时间[MM:SS - MM:SS]"，没广告输出"广告时间[无]"。只输出这一行，不含其他任何内容。必须在同一行。' });
            try {
                const fix = await callAPINoStream(messages);
                summary = summary + '\n' + fix.trim();
                adCheck = extractAdSegments(summary);
                lastAdCheckResult = adCheck;
                safeSetInnerHTML(streamEl, markdownToHtml(summary));
                renderLatex(streamEl);
                setCachedSummary(currentVideoKey, fullPrompt, summary);
                aiConversationHistory[1].content = summary;
                adSegments = adCheck.segments;
                if (adSegments.length > 0) { initProgressMark(); initAdSkipMonitor(); }
            } catch (e) {}
        }
        return summary;
    }

    // ===================== 16. 核心工作流 =====================
    async function fetchAllSubtitles(force = false) {
        const vk = window.location.href;
        if (!force && vk === currentVideoKey && allSubtitles.length > 0) return;
        if (force) {
            abortCurrentRequest();
            currentGenerationId++;
            isGeneratingAI = false;
            if (autoGenerateTimer) { clearTimeout(autoGenerateTimer); autoGenerateTimer = null; }
        }
        currentVideoKey = vk;
        allSubtitles = []; currentSubtitleData = null; selectedSubtitleId = null;
        adSegments = []; hasJumpedAds = {}; lastAdCheckResult = null;
        progressMarkInitialized = false; hotComments = []; subtitleSearchKeyword = '';
        aiConversationHistory = [];
        const existingMark = document.getElementById('bseas-ad-progress-mark');
        if (existingMark) existingMark.remove();
        setLoadingState(true);
        try {
            allSubtitles = await fetchBilibiliSubtitles();
            const commentPromise = fetchHotComments();
            if (allSubtitles.length > 0) await loadSubtitle(allSubtitles[0]);
            hotComments = await commentPromise;
        } catch (e) {}
        setLoadingState(false);
        updateUI(); updateContent();
    }
    async function loadSubtitle(sub) {
        if (!sub) return;
        if (selectedSubtitleId === sub.id && currentSubtitleData?.body?.length > 0) return;
        selectedSubtitleId = sub.id;
        if (autoGenerateTimer) { clearTimeout(autoGenerateTimer); autoGenerateTimer = null; }
        const afterLoad = () => {
            if (bseas_auto_open_panel && !panelVisible) {
                panelVisible = true;
                document.querySelector('.bseas-panel')?.classList.add('show');
                switchTab(bseas_auto_open_tab);
            }
            if (bseas_auto_summary && !bseas_disable_api && currentSubtitleData?.body?.length && !getCachedSummary(currentVideoKey) && bseas_api_key && !isGeneratingAI) {
                autoGenerateTimer = setTimeout(() => {
                    autoGenerateTimer = null;
                    if (isGeneratingAI) return;
                    switchTab('ai');
                    setTimeout(() => { const btn = document.getElementById('bseas-generate-btn'); if (btn && !isGeneratingAI) btn.click(); }, 50);
                }, 400);
            }
        };
        if (sub.body?.length > 0) { currentSubtitleData = sub; updateUI(); updateContent(); afterLoad(); return; }
        setLoadingState(true);
        sub.body = await fetchSubtitleContent(sub.subtitle_url);
        currentSubtitleData = sub;
        setLoadingState(false);
        updateUI(); updateContent(); afterLoad();
    }
    function switchTab(tab) {
        currentTab = tab;
        const tabsEl = document.querySelector('.bseas-tabs');
        if (tabsEl) tabsEl.classList.toggle('hidden', tab === 'settings');
        document.querySelectorAll('.bseas-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        const fNormal = document.getElementById('bseas-footer-normal');
        const fSettings = document.getElementById('bseas-footer-settings');
        if (fNormal && fSettings) {
            fNormal.style.display = tab === 'settings' ? 'none' : 'flex';
            fSettings.style.display = tab === 'settings' ? 'flex' : 'none';
        }
        updateContent();
    }

    // ===================== 17. UI 创建与事件 =====================
    function createUI() {
        if (document.querySelector('.bseas-container')) return;
        const c = document.createElement('div');
        c.className = 'bseas-container';
        const showApiWarning = !bseas_api_key && !bseas_disable_api;
        safeSetInnerHTML(c, `
            <button class="bseas-trigger-btn" title="B站字幕获取、AI分析及广告跳过工具（可拖拽）"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/></svg><span class="bseas-status-dot"></span></button>
            <div class="bseas-panel">
                <div class="bseas-header">
                    <div class="bseas-header-text">
                        <div class="bseas-title">B站字幕获取、AI分析及广告跳过 <span class="bseas-platform-tag">BiliBili</span></div>
                        <div class="bseas-subtitle-info">点击刷新</div>
                        <div class="bseas-ad-hint" id="bseas-ad-hint">广告跳过功能仅在进行AI分析后可用</div>
                    </div>
                    <div class="bseas-header-actions">
                        <button class="bseas-icon-btn" id="bseas-refresh-btn" title="刷新"><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
                        <button class="bseas-icon-btn settings-btn" id="bseas-settings-btn" title="设置"><svg viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg></button>
                    </div>
                </div>
                <div class="bseas-api-warning-container">${showApiWarning ? `<div class="bseas-api-warning"><span class="bseas-api-warning-icon">⚠</span><span class="bseas-api-warning-text">未设置API Key，AI分析功能将无法使用</span><button class="bseas-api-warning-btn" id="bseas-go-settings">去设置</button></div>` : ''}</div>
                <div class="bseas-source-section"><div class="bseas-source-header" id="bseas-source-toggle"><span class="bseas-source-label">选择字幕</span><span class="bseas-source-arrow collapsed" id="bseas-source-arrow"><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></span></div><div class="bseas-source-body hidden" id="bseas-source-body"><div style="color:var(--bseas-text-dim);font-size:13px;">暂无数据</div></div></div>
                <div class="bseas-tabs"><button class="bseas-tab active" data-tab="preview">浏览</button><button class="bseas-tab" data-tab="ai">AI 分析</button><button class="bseas-tab" data-tab="text">文本</button></div>
                <div class="bseas-content"><div class="bseas-empty">正在初始化...</div></div>
                <div class="bseas-footer">
                    <div id="bseas-footer-normal" style="display:flex;gap:12px;width:100%;">
                        <button class="bseas-btn bseas-btn-secondary" id="bseas-download-txt-btn" disabled><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>TXT</button>
                        <button class="bseas-btn bseas-btn-secondary" id="bseas-download-srt-btn" disabled><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>SRT</button>
                        <button class="bseas-btn bseas-btn-primary" id="bseas-copy-btn" disabled><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>复制全部</button>
                    </div>
                    <div id="bseas-footer-settings" style="display:none;gap:12px;width:100%;">
                        <button class="bseas-btn bseas-btn-secondary" id="bseas-s-cancel">取消</button>
                        <button class="bseas-btn bseas-btn-primary" id="bseas-s-save">保存设置</button>
                    </div>
                </div>
            </div>
        `);
        document.body.appendChild(c);
        applySavedPanelPosition(c);
        makeDraggable(c);
        bindEvents(c);
        if (hasUpdate) showUpdateBadgeInPanel();
        window.addEventListener('resize', () => {
            const container = document.querySelector('.bseas-container');
            if (container) applySavedPanelPosition(container);
        });
    }
    function applySavedPanelPosition(container) {
        const panel = container.querySelector('.bseas-panel');
        if (!panel) return;

        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const manualPos = GM_getValue('bseas_panel_position', null);
        const preset = GM_getValue('bseas_panel_pos_preset', 'top-right');

        container.style.left = 'auto';
        container.style.right = 'auto';
        container.style.top = 'auto';
        container.style.bottom = 'auto';

        panel.style.left = 'auto';
        panel.style.right = 'auto';
        panel.style.top = 'auto';
        panel.style.bottom = 'auto';

        if (manualPos) {
            if (manualPos.side === 'left') {
                container.style.left = Math.max(8, Math.min(winW - 60, manualPos.dist)) + 'px';
                panel.style.left = '0'; // 向右展开
            } else {
                container.style.right = Math.max(8, Math.min(winW - 60, manualPos.dist)) + 'px';
                panel.style.right = '0'; // 向左展开
            }
            container.style.top = Math.max(8, Math.min(winH - 60, manualPos.top)) + 'px';
            panel.style.top = '66px';
        } else {
            if (preset.includes('left')) {
                container.style.left = '24px';
                panel.style.left = '0';
            } else {
                container.style.right = '24px';
                panel.style.right = '0';
            }
            if (preset.includes('top')) {
                container.style.top = '80px';
                panel.style.top = '66px';
            } else {
                container.style.bottom = '24px';
                panel.style.bottom = '66px';
            }
        }
    }
    function makeDraggable(container) {
        const handle = container.querySelector('.bseas-header-text');
        const triggerBtn = container.querySelector('.bseas-trigger-btn');
        function setupDrag(element, isTrigger) {
            let isDragging = false, isMouseDown = false, startX = 0, startY = 0, offsetX = 0, offsetY = 0, hasMoved = false;
            element.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                if (!isTrigger && e.target.closest('button, a')) return;
                isMouseDown = true;
                hasMoved = false;
                const rect = container.getBoundingClientRect();
                startX = e.clientX; startY = e.clientY;
                offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top;
                if (!isTrigger) e.preventDefault();
            });
            const onMouseMove = (e) => {
                if (!isMouseDown) return;
                const dx = e.clientX - startX, dy = e.clientY - startY;
                if (!hasMoved && Math.sqrt(dx * dx + dy * dy) > 5) {
                    hasMoved = true; isDragging = true;
                    container.style.right = 'auto';
                    container.style.bottom = 'auto';
                    const rect = container.getBoundingClientRect();
                    container.style.left = rect.left + 'px';
                    container.style.top = rect.top + 'px';
                    document.body.style.userSelect = 'none';
                }
                if (isDragging) {
                    let x = e.clientX - offsetX, y = e.clientY - offsetY;
                    x = Math.max(8, Math.min(window.innerWidth - container.offsetWidth - 8, x));
                    y = Math.max(8, Math.min(window.innerHeight - 60, y));
                    container.style.left = x + 'px';
                    container.style.top = y + 'px';
                }
            };
            const onMouseUp = () => {
                if (!isMouseDown) return;
                isMouseDown = false;
                if (isDragging) {
                    isDragging = false;
                    document.body.style.userSelect = '';
                    const rect = container.getBoundingClientRect();
                    const winW = window.innerWidth;
                    let side, dist;
                    if (rect.left + rect.width / 2 < winW / 2) {
                        side = 'left';
                        dist = rect.left;
                    } else {
                        side = 'right';
                        dist = winW - rect.right;
                    }
                    GM_setValue('bseas_panel_position', { side, dist, top: rect.top });
                    applySavedPanelPosition(container); // 拖拽结束后标准化面板锚点
                    if (isTrigger) element._wasDragged = true;
                }
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }
        if (handle) setupDrag(handle, false);
        if (triggerBtn) setupDrag(triggerBtn, true);
    }
    function bindEvents(c) {
        const panel = c.querySelector('.bseas-panel');
        const triggerBtn = c.querySelector('.bseas-trigger-btn');
        panel.addEventListener('click', e => e.stopPropagation());
        triggerBtn.addEventListener('click', (e) => {
            if (triggerBtn._wasDragged) { triggerBtn._wasDragged = false; e.preventDefault(); e.stopPropagation(); return; }
            e.stopPropagation();
            panelVisible = !panelVisible;
            panel.classList.toggle('show', panelVisible);
            if (panelVisible && allSubtitles.length === 0) fetchAllSubtitles();
        });
        if (_documentClickHandler) document.removeEventListener('click', _documentClickHandler);
        _documentClickHandler = e => {
            if (!panelVisible) return;
            if (!c.contains(e.target)) { panelVisible = false; panel.classList.remove('show'); }
        };
        document.addEventListener('click', _documentClickHandler);
        c.querySelector('#bseas-source-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            sourceCollapsed = !sourceCollapsed;
            c.querySelector('#bseas-source-body').classList.toggle('hidden', sourceCollapsed);
            c.querySelector('#bseas-source-arrow').classList.toggle('collapsed', sourceCollapsed);
        });
        c.querySelectorAll('.bseas-tab').forEach(tab => tab.addEventListener('click', (e) => { e.stopPropagation(); switchTab(tab.dataset.tab); }));
        c.querySelector('#bseas-refresh-btn').addEventListener('click', e => { e.stopPropagation(); if (!isLoading) fetchAllSubtitles(true); });
        c.querySelector('#bseas-settings-btn').addEventListener('click', e => { e.stopPropagation(); switchTab(currentTab === 'settings' ? 'preview' : 'settings'); });
        c.querySelector('#bseas-go-settings')?.addEventListener('click', e => { e.stopPropagation(); switchTab('settings'); });
        c.querySelector('#bseas-copy-btn').addEventListener('click', () => { const t = getFormattedText(); if (t) { GM_setClipboard(t); showToast('✓ 已复制', 'success'); } });
        c.querySelector('#bseas-download-txt-btn').addEventListener('click', () => downloadSubtitle('txt'));
        c.querySelector('#bseas-download-srt-btn').addEventListener('click', () => downloadSubtitle('srt'));
        c.querySelector('#bseas-s-cancel')?.addEventListener('click', (e) => { e.stopPropagation(); switchTab('preview'); });
        c.querySelector('#bseas-s-save')?.addEventListener('click', (e) => {
            e.stopPropagation();
            bseas_platform = document.getElementById('bseas-s-platform').value;
            bseas_api_url = document.getElementById('bseas-s-url').value.trim();
            bseas_api_key = document.getElementById('bseas-s-key').value.trim();
            const selectedModel = document.getElementById('bseas-s-model-select').value;
            bseas_model = selectedModel === '自定义' ? document.getElementById('bseas-s-model-custom').value.trim() : selectedModel;
            bseas_auto_summary = document.getElementById('bseas-s-auto').checked;
            bseas_opinion_analysis = document.getElementById('bseas-s-opinion').checked;
            bseas_auto_skip_ad = document.getElementById('bseas-s-auto-skip').checked;
            bseas_auto_open_panel = document.getElementById('bseas-s-auto-open').checked;
            bseas_auto_open_tab = document.getElementById('bseas-s-auto-tab').value;
            bseas_detail_level = document.getElementById('bseas-s-detail').value;
            bseas_latex = document.getElementById('bseas-s-latex').checked;
            bseas_disable_api = document.getElementById('bseas-s-disable-api').checked;
            bseas_panel_pos_preset = document.getElementById('bseas-s-pos-preset').value;
            bseas_opinion_comments_count = parseInt(document.getElementById('bseas-s-opinion-count').value) || 30;
            bseas_max_preview_subtitles = parseInt(document.getElementById('bseas-s-max-preview').value) || 1000;
            bseas_confirm_enabled = document.getElementById('bseas-s-confirm-enable').checked;
            bseas_confirm_chars = parseInt(document.getElementById('bseas-s-confirm-chars').value) || 20000;
            GM_setValue('bseas_platform', bseas_platform);
            GM_setValue('bseas_api_url', bseas_api_url);
            GM_setValue('bseas_api_key_' + bseas_platform, bseas_api_key);
            GM_setValue('bseas_model', bseas_model);
            GM_setValue('bseas_auto_summary', bseas_auto_summary);
            GM_setValue('bseas_opinion_analysis', bseas_opinion_analysis);
            GM_setValue('bseas_auto_skip_ad', bseas_auto_skip_ad);
            GM_setValue('bseas_auto_open_panel', bseas_auto_open_panel);
            GM_setValue('bseas_auto_open_tab', bseas_auto_open_tab);
            GM_setValue('bseas_detail_level', bseas_detail_level);
            GM_setValue('bseas_latex', bseas_latex);
            GM_setValue('bseas_disable_api', bseas_disable_api);
            GM_setValue('bseas_panel_pos_preset', bseas_panel_pos_preset);
            GM_setValue('bseas_opinion_comments_count', bseas_opinion_comments_count);
            GM_setValue('bseas_max_preview_subtitles', bseas_max_preview_subtitles);
            GM_setValue('bseas_confirm_enabled', bseas_confirm_enabled);
            GM_setValue('bseas_confirm_chars', bseas_confirm_chars);
            GM_deleteValue('bseas_panel_position');
            showToast('✓ 设置已保存', 'success');
            switchTab('preview');
            panelVisible = false;
            document.querySelector('.bseas-container')?.remove();
            createUI();
            setTimeout(() => fetchAllSubtitles(true), 200);
        });
    }
    function downloadSubtitle(format) {
        const text = format === 'srt' ? getSRTText() : getFormattedText();
        if (!text) return;
        const title = sanitizeFilename(getVideoTitle());
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        a.download = `${title}.${format}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        showToast(`✓ ${format.toUpperCase()}下载成功`, 'success');
    }

    // ===================== 18. 文本格式化 =====================
    function getFormattedText() {
        if (!currentSubtitleData?.body) return '';
        return currentSubtitleData.body.map(it => showTimestamps ? `[${formatTimeWithMs(it.from)} - ${formatTimeWithMs(it.to)}] ${it.content}` : it.content).join('\n');
    }
    function getSRTText() {
        if (!currentSubtitleData?.body) return '';
        return currentSubtitleData.body.map((it, index) => `${index + 1}\n${formatTimeForSRT(it.from)} --> ${formatTimeForSRT(it.to)}\n${it.content}\n`).join('\n');
    }
    function getTimestampedTextForAI() {
        if (!currentSubtitleData?.body) return '';
        return currentSubtitleData.body.map(it => `[${formatTime(it.from)} - ${formatTime(it.to)}] ${it.content}`).join('\n');
    }

    // ===================== 19. UI 状态更新 =====================
    function updateDotState() {
        const dot = document.querySelector('.bseas-status-dot');
        if (!dot) return;
        const hasSubtitle = !!(currentSubtitleData?.body?.length);
        const hasSummary = !!getCachedSummary(currentVideoKey);
        if (!hasSubtitle) dot.className = 'bseas-status-dot';
        else if (hasSummary) dot.className = 'bseas-status-dot state-green';
        else dot.className = 'bseas-status-dot state-yellow';
    }
    function updateUI() {
        const info = document.querySelector('.bseas-subtitle-info');
        const copyBtn = document.querySelector('#bseas-copy-btn');
        const dlTxtBtn = document.querySelector('#bseas-download-txt-btn');
        const dlSrtBtn = document.querySelector('#bseas-download-srt-btn');
        const sb = document.querySelector('#bseas-source-body');
        if (sb) {
            if (allSubtitles.length > 0) {
                safeSetInnerHTML(sb, allSubtitles.map(s => `<div class="bseas-subtitle-option ${s.id === selectedSubtitleId ? 'active' : ''}" data-id="${escapeHtml(s.id)}">${escapeHtml(s.lan_doc)}<span class="bseas-tag ${s.isAI ? 'ai' : 'cc'}">${s.isAI ? 'AI' : 'CC'}</span></div>`).join(''));
                sb.querySelectorAll('.bseas-subtitle-option').forEach(o => o.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const s = allSubtitles.find(x => String(x.id) === String(o.dataset.id));
                    if (s) loadSubtitle(s);
                }));
            } else {
                safeSetInnerHTML(sb, '<div style="color:var(--bseas-text-dim);font-size:13px;padding-bottom:4px;">未检测到可用字幕</div>');
            }
        }
        if (currentSubtitleData?.body) {
            if (info) info.textContent = `成功解析 ${currentSubtitleData.body.length} 条字幕 · ${hotComments.length} 条评论`;
            if (copyBtn) copyBtn.disabled = false;
            if (dlTxtBtn) dlTxtBtn.disabled = false;
            if (dlSrtBtn) dlSrtBtn.disabled = false;
        } else if (!isLoading) {
            if (info) info.textContent = allSubtitles.length === 0 ? '此视频暂无字幕' : '准备就绪';
        }
        updateDotState();
    }
    function updateContent() {
        const el = document.querySelector('.bseas-content');
        if (!el) return;
        if (isLoading) { safeSetInnerHTML(el, '<div class="bseas-loading"><div class="bseas-spinner"></div><div>数据加载中...</div></div>'); return; }
        switch (currentTab) {
            case 'preview': renderPreviewTab(el); break;
            case 'ai': renderAITab(el); break;
            case 'text': renderTextTab(el); break;
            case 'settings': renderSettingsTab(el); break;
        }
    }

    // ===================== 20. 浏览页渲染 =====================
    function highlightKeyword(text, keyword) {
        if (!keyword) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const kwEscaped = escapeHtml(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(kwEscaped, 'gi'), m => `<mark>${m}</mark>`);
    }
    function updatePreviewList() {
        const el = document.querySelector('.bseas-content');
        if (!el || currentTab !== 'preview') return;
        const body = currentSubtitleData?.body || [];
        let filtered = body;
        if (subtitleSearchKeyword) {
            const kw = subtitleSearchKeyword.toLowerCase();
            filtered = body.filter(it => it.content.toLowerCase().includes(kw));
        }
        const listContainer = el.querySelector('#bseas-subtitle-list-container');
        if (listContainer) {
            const listHtml = filtered.slice(0, bseas_max_preview_subtitles).map(it => `<div class="bseas-subtitle-item" data-time="${it.from}"><div class="bseas-ts">${formatTime(it.from)} → ${formatTime(it.to)}</div><div class="bseas-st">${highlightKeyword(it.content, subtitleSearchKeyword)}</div></div>`).join('');
            const footer = filtered.length > bseas_max_preview_subtitles ? `<div style="text-align:center;color:var(--bseas-text-muted);padding:14px;font-size:13px;">仅展示前${bseas_max_preview_subtitles}条</div>` : (subtitleSearchKeyword && filtered.length === 0 ? '<div class="bseas-empty">未匹配到字幕</div>' : '');
            safeSetInnerHTML(listContainer, listHtml + footer);
            listContainer.querySelectorAll('.bseas-subtitle-item').forEach(item => item.addEventListener('click', (e) => { e.stopPropagation(); seekToTime(parseFloat(item.dataset.time)); }));
        }
        const countEl = el.querySelector('.bseas-search-count');
        if (countEl) {
            countEl.textContent = subtitleSearchKeyword ? `${filtered.length} 条` : '';
        }
    }
    function renderPreviewTab(el) {
        if (!currentSubtitleData?.body?.length) { safeSetInnerHTML(el, '<div class="bseas-empty">未获取到字幕，点击刷新以重试</div>'); return; }
        const body = currentSubtitleData.body;
        let filtered = body;
        if (subtitleSearchKeyword) {
            const kw = subtitleSearchKeyword.toLowerCase();
            filtered = body.filter(it => it.content.toLowerCase().includes(kw));
        }
        const cnt = body.length;
        const dur = body[cnt - 1].to;
        const chars = body.reduce((s, i) => s + i.content.length, 0);
        const searchBox = `<div class="bseas-search-box"><input type="text" id="bseas-subtitle-search" class="bseas-search-input" placeholder="搜索字幕内容..." value="${escapeHtml(subtitleSearchKeyword)}">${subtitleSearchKeyword ? `<span class="bseas-search-count">${filtered.length} 条</span>` : ''}</div>`;
        const stats = `<div class="bseas-stats"><div class="bseas-stat-item"><div class="bseas-stat-label">总条数</div><div class="bseas-stat-value">${cnt}</div></div><div class="bseas-stat-item"><div class="bseas-stat-label">总时长</div><div class="bseas-stat-value">${formatTime(dur)}</div></div><div class="bseas-stat-item"><div class="bseas-stat-label">总字数</div><div class="bseas-stat-value">${chars}</div></div></div>`;
        const listHtml = filtered.slice(0, bseas_max_preview_subtitles).map(it => `<div class="bseas-subtitle-item" data-time="${it.from}"><div class="bseas-ts">${formatTime(it.from)} → ${formatTime(it.to)}</div><div class="bseas-st">${highlightKeyword(it.content, subtitleSearchKeyword)}</div></div>`).join('');
        const footer = filtered.length > bseas_max_preview_subtitles ? `<div style="text-align:center;color:var(--bseas-text-muted);padding:14px;font-size:13px;">仅展示前${bseas_max_preview_subtitles}条</div>` : (subtitleSearchKeyword && filtered.length === 0 ? '<div class="bseas-empty">未匹配到字幕</div>' : '');
        safeSetInnerHTML(el, searchBox + stats + `<div id="bseas-subtitle-list-container">${listHtml + footer}</div>`);
        const searchInput = el.querySelector('#bseas-subtitle-search');
        if (searchInput) {
            let debounceTimer;
            let isComposing = false;
            searchInput.addEventListener('compositionstart', () => { isComposing = true; });
            searchInput.addEventListener('compositionend', (e) => {
                isComposing = false;
                clearTimeout(debounceTimer);
                subtitleSearchKeyword = e.target.value.trim();
                updatePreviewList();
            });
            searchInput.addEventListener('input', (e) => {
                if (isComposing) return;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    subtitleSearchKeyword = e.target.value.trim();
                    updatePreviewList();
                }, 200);
            });
        }
        el.querySelectorAll('.bseas-subtitle-item').forEach(item => item.addEventListener('click', (e) => { e.stopPropagation(); seekToTime(parseFloat(item.dataset.time)); }));
    }

    // ===================== 21. AI 分析页渲染 =====================
    function renderAITab(el) {
        const hasSubtitle = !!(currentSubtitleData?.body?.length);
        const cachedPrompt = getCachedPrompt(currentVideoKey);
        const cachedSummary = getCachedSummary(currentVideoKey);
        const cachedQA = getCachedQA(currentVideoKey);
        if (cachedSummary && (aiConversationHistory.length < 2 || aiConversationHistory[1]?.content !== cachedSummary)) {
            aiConversationHistory = [
                { role: 'user', content: cachedPrompt || getAISummaryPrompt(hasSubtitle), fullContent: cachedPrompt || '(来自旧版本，未储存询问内容，因此仅展示基础提示词结构，未包含视频上下文内容)\n' + getAISummaryPrompt(hasSubtitle) },
                { role: 'assistant', content: cachedSummary },
                ...cachedQA.flatMap(qa => [{ role: 'user', content: qa.q }, { role: 'assistant', content: qa.a }])
            ];
        }
        let html = '';
        if (!cachedSummary) {
            if (bseas_disable_api) {
                html += `<button class="bseas-ai-big-btn" id="bseas-copy-prompt-btn"><svg width="17" height="17" viewBox="0 0 24 24"><path fill="#ffffff" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> 复制AI提示词</button>`;
                if (!hasSubtitle) html += '<div class="bseas-empty" style="padding:40px 20px;">未获取到字幕，点击复制提示词进行舆情分析</div>';
            } else {
                html += `<button class="bseas-ai-big-btn" id="bseas-generate-btn" ${!bseas_api_key || isGeneratingAI ? 'disabled' : ''}><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 8L12 16L20 8" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg> ${isGeneratingAI ? '生成中...' : 'AI分析'}</button>`;
                if (!hasSubtitle) html += '<div class="bseas-empty" style="padding:40px 20px;">未获取到字幕，点击进行舆情分析</div>';
                if (!bseas_api_key) {
                    html += `<div class="bseas-noapi-box"><div class="bseas-noapi-title">⚠ 未配置 API Key</div><div class="bseas-noapi-desc">您可以在设置中配置 API Key。您也可以在设置中选择禁用 API Key，改为复制提示词。</div></div>`;
                }
            }
        } else {
            const retryHtml = bseas_disable_api
                ? `<button class="bseas-retry-btn" id="bseas-copy-prompt-btn" title="复制AI提示词"><svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg></button>`
                : `<button class="bseas-retry-btn" id="bseas-retry-btn" title="重新生成" ${isGeneratingAI ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>`;
            if (showRawAIText) {
                const userText = cachedPrompt || (aiConversationHistory.length > 0 ? (aiConversationHistory[0].fullContent || aiConversationHistory[0].content) : '');
                const aiText = aiConversationHistory.length > 1 ? aiConversationHistory[1].content : cachedSummary;
                html += `<div style="position:relative;">${retryHtml}<div style="font-size:13px;font-weight:bold;color:var(--bseas-text);margin-bottom:8px;">发给AI的原始文本：</div><textarea class="bseas-text-area" readonly style="min-height:200px;font-family:monospace;font-size:13px;margin-bottom:16px;">${escapeHtml(userText)}</textarea><div style="font-size:13px;font-weight:bold;color:var(--bseas-text);margin-bottom:8px;">AI返回的原始文本：</div><textarea class="bseas-text-area" readonly style="min-height:200px;font-family:monospace;font-size:13px;">${escapeHtml(aiText)}</textarea></div>`;
            } else {
                const adData = lastAdCheckResult || extractAdSegments(cachedSummary);
                if (!lastAdCheckResult) lastAdCheckResult = adData;
                adSegments = adData.segments;
                if (adSegments.length > 0) initProgressMark();
                if (adData.type === 'has_ad' && adSegments.length > 0) html += `<div class="bseas-sp-box status-found"><div class="bseas-sp-header"><span class="bseas-sp-icon">!</span><span class="bseas-sp-title">检测到视频植入广告</span></div><div class="bseas-sp-hint">${bseas_auto_skip_ad ? '进度条已标黄提示，将自动跳过' : '进度条已标黄提示，自动跳过已关闭'}</div><div class="bseas-sp-action-row"><span class="bseas-sp-badge">${adSegments[0].startStr} - ${adSegments[0].endStr}</span><button class="bseas-sp-skip" data-end="${adSegments[0].end}">立即跳过</button></div></div>`;
                else if (adData.type === 'none') html += `<div class="bseas-sp-box status-none"><div class="bseas-sp-header"><span class="bseas-sp-icon">✓</span><span class="bseas-sp-title">未检测到视频植入广告</span></div></div>`;
                else html += `<div class="bseas-sp-box status-err"><div class="bseas-sp-header"><span class="bseas-sp-icon">⚠</span><span class="bseas-sp-title">广告时间段格式解析异常</span></div></div>`;
                const displaySummary = stripAdLine(cachedSummary);
                html += `<div style="position:relative;">${retryHtml}<div class="bseas-ai-result bseas-markdown" id="bseas-ai-result"></div></div>`;
                if (cachedQA.length) html += cachedQA.map(qa => `<div class="bseas-qa-item"><div class="bseas-qa-q">💭 ${escapeHtml(qa.q)}</div><div class="bseas-qa-a bseas-markdown bseas-qa-md"></div></div>`).join('');
                if (!bseas_disable_api) {
                    html += `<div class="bseas-followup-section"><div class="bseas-followup-label"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>追问</div><textarea class="bseas-followup-input" id="bseas-followup-input" placeholder="就视频内容提问" ${isGeneratingAI ? 'disabled' : ''}></textarea><button class="bseas-followup-btn" id="bseas-followup-btn" ${isGeneratingAI ? 'disabled' : ''}>${isGeneratingAI ? '生成中...' : '发送追问'}</button></div>`;
                }
            }
            html += `<div style="display:flex;justify-content:flex-end;margin-top:16px;"><label class="bseas-checkbox-label" style="font-size:13px;color:var(--bseas-text-muted);"><input type="checkbox" id="bseas-raw-toggle" ${showRawAIText ? 'checked' : ''}>查看原始文本</label></div>`;
        }
        safeSetInnerHTML(el, html);
        const aiResultEl = el.querySelector('#bseas-ai-result');
        if (aiResultEl) renderMarkdownInto(aiResultEl, stripAdLine(cachedSummary || ''));
        el.querySelectorAll('.bseas-qa-md').forEach((qaEl, i) => { if (cachedQA[i]) renderMarkdownInto(qaEl, cachedQA[i].a); });
        document.getElementById('bseas-copy-prompt-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const fullPrompt = buildFullPrompt(getTimestampedTextForAI(), false);
            GM_setClipboard(fullPrompt);
            showToast('✓ 提示词已复制，请粘贴给AI工具', 'success');
        });
        async function doGenerate(e) {
            if (e) e.stopPropagation();
            if (bseas_disable_api) return;
            if (isGeneratingAI) return;
            if (!bseas_api_key) return;

            const subtitleText = getTimestampedTextForAI();
            if (bseas_confirm_enabled && subtitleText.length > bseas_confirm_chars) {
                if (!confirm(`字幕文字量过多（包含时间戳为 ${subtitleText.length} 字），调用AI分析可能会消耗较多 Tokens，是否继续？`)) return;
            }

            abortCurrentRequest();
            if (aiSummaryCache[currentVideoKey]) { delete aiSummaryCache[currentVideoKey]; aiConversationHistory = []; GM_setValue('aiSummaryCache', aiSummaryCache); }
            lastAdCheckResult = null;
            isGeneratingAI = true;
            const myGenerationId = ++currentGenerationId;
            const genBtn = document.getElementById('bseas-generate-btn');
            const retryBtn = document.getElementById('bseas-retry-btn');
            if (genBtn) genBtn.disabled = true;
            if (retryBtn) retryBtn.disabled = true;
            safeSetInnerHTML(el, `<div class="bseas-ai-result bseas-markdown" id="bseas-stream-body" style="min-height:400px;overflow-y:auto;"><div class="bseas-loading"><div class="bseas-spinner"></div><div>生成中...</div></div></div>`);
            const streamEl = document.getElementById('bseas-stream-body');
            let success = false;
            try {
                await generateAISummaryStream(subtitleText, streamEl);
                success = true;
            } catch (err) {
                if (myGenerationId !== currentGenerationId) return;
                showToast(`✗ 失败: ${err.message}`, 'error');
                delete aiSummaryCache[currentVideoKey];
                GM_setValue('aiSummaryCache', aiSummaryCache);
            } finally {
                if (myGenerationId === currentGenerationId) {
                    isGeneratingAI = false;
                    if (currentTab === 'ai') {
                        renderAITab(el);
                        if (success) el.scrollTop = 0;
                    }
                    if (success) {
                        showToast('✓ 解析完成', 'success');
                        updateDotState();
                    }
                }
            }
        }
        document.getElementById('bseas-generate-btn')?.addEventListener('click', doGenerate);
        document.getElementById('bseas-retry-btn')?.addEventListener('click', doGenerate);
        document.getElementById('bseas-raw-toggle')?.addEventListener('change', e => { showRawAIText = e.target.checked; renderAITab(el); });
        el.querySelector('.bseas-sp-skip')?.addEventListener('click', e => { e.stopPropagation(); seekToTime(parseFloat(e.currentTarget.dataset.end)); });
        const fBtn = document.getElementById('bseas-followup-btn');
        const fInput = document.getElementById('bseas-followup-input');
        if (fBtn && fInput) {
            const send = async () => {
                const q = fInput.value.trim();
                if (!q) return;
                if (isGeneratingAI) { showToast('请等待当前生成完成', 'warning'); return; }
                isGeneratingAI = true;
                const myGenerationId = ++currentGenerationId;
                fBtn.disabled = true; fBtn.textContent = '思考中...'; fInput.disabled = true;
                const followupSection = el.querySelector('.bseas-followup-section');
                const answerId = 'bseas-ans-' + Date.now();
                const qaEl = document.createElement('div');
                qaEl.className = 'bseas-qa-item';
                safeSetInnerHTML(qaEl, `<div class="bseas-qa-q">💭 ${escapeHtml(q)}</div><div class="bseas-qa-a bseas-markdown" id="${answerId}"><div style="display:flex;align-items:center;gap:8px;color:var(--bseas-text-muted);"><span class="bseas-spinner" style="width:16px;height:16px;border-width:2px;"></span>正在解答...</div></div>`);
                followupSection.insertAdjacentElement('beforebegin', qaEl);
                const ansEl = document.getElementById(answerId);
                aiConversationHistory.push({ role: 'user', content: q });
                try {
                    const a = await callAPIStream(aiConversationHistory, text => {
                        if (myGenerationId !== currentGenerationId) return;
                        safeSetInnerHTML(ansEl, markdownToHtml(text));
                        renderLatex(ansEl);
                    });
                    if (myGenerationId !== currentGenerationId) return;
                    aiConversationHistory.push({ role: 'assistant', content: a });
                    appendCachedQA(currentVideoKey, q, a);
                    fInput.value = '';
                    showToast('✓ 回复完成', 'success');
                } catch (e) {
                    if (myGenerationId !== currentGenerationId) return;
                    safeSetInnerHTML(ansEl, `<span style="color:#ef4444;">❌ 追问失败: ${escapeHtml(e.message)}</span>`);
                    aiConversationHistory.pop();
                    showToast(`✗ 出错: ${e.message}`, 'error');
                } finally {
                    if (myGenerationId === currentGenerationId) { isGeneratingAI = false; fBtn.disabled = false; fBtn.textContent = '发送追问'; fInput.disabled = false; fInput.focus(); }
                }
            };
            fBtn.addEventListener('click', e => { e.stopPropagation(); send(); });
            fInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); send(); } });
        }
    }

    // ===================== 22. 文本页渲染 =====================
    function renderTextTab(el) {
        if (!currentSubtitleData?.body?.length) { safeSetInnerHTML(el, '<div class="bseas-empty">暂无数据</div>'); return; }
        safeSetInnerHTML(el, `<div class="bseas-text-controls"><label class="bseas-checkbox-label"><input type="checkbox" id="bseas-ts-toggle" ${showTimestamps ? 'checked' : ''}>显示时间戳</label><span style="font-size:12px;color:var(--bseas-text-muted);">${showTimestamps ? '格式:[MM:SS.ms]' : '纯文本'}</span></div><textarea class="bseas-text-area" id="bseas-text-out" readonly>${escapeHtml(getFormattedText())}</textarea>`);
        document.getElementById('bseas-ts-toggle')?.addEventListener('change', e => { showTimestamps = e.target.checked; document.getElementById('bseas-text-out').value = getFormattedText(); });
    }

    // ===================== 23. 设置页渲染 =====================
    function renderSettingsTab(el) {
        const pOptions = Object.keys(API_PLATFORMS).map(k => `<option value="${k}" ${bseas_platform === k ? 'selected' : ''}>${API_PLATFORMS[k].name}</option>`).join('');
        const tabOptions = Object.keys(TAB_OPTIONS).map(k => `<option value="${k}" ${bseas_auto_open_tab === k ? 'selected' : ''}>${TAB_OPTIONS[k]}</option>`).join('');
        const detailOptions = Object.keys(DETAIL_LEVELS).map(k => `<option value="${k}" ${bseas_detail_level === k ? 'selected' : ''}>${DETAIL_LEVELS[k]}</option>`).join('');
        const currentPlatformKey = GM_getValue('bseas_api_key_' + bseas_platform, '');
        const updateBadgeHtml = hasUpdate ? ` <a href="${updateLinkUrl || SCRIPTCAT_URL}" target="_blank" class="bseas-update-badge">新版本 v${latestVersion}</a>` : '';
        safeSetInnerHTML(el, `<div style="padding:10px 0;">
            <div class="bseas-settings-group">
                <div class="bseas-settings-group-title"><span class="bseas-settings-group-title-dot"></span>AI 设置</div>
                <div class="bseas-settings-subgroup">
                    <div class="bseas-settings-subgroup-title" style="display:flex;justify-content:space-between;align-items:center;"><span>API</span><span id="bseas-api-hint-btn" style="font-size:12px;font-weight:normal;color:var(--bseas-primary);cursor:pointer;">查看使用提示</span></div>
                    <div id="bseas-api-hint-box" style="display:none;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px 16px;font-size:13px;color:#0369a1;margin-bottom:16px;line-height:1.6;animation:bseas-slideup 0.3s ease;">
                        <div style="font-weight:bold;margin-bottom:4px;font-size:14px;color:#0c4a6e;">● 前置基础</div>
                        <ul style="margin:0 0 12px 0;padding-left:20px;"><li style="margin-bottom:4px;"><b>什么是AI API：</b>简单说就是第三方AI大模型开放的调用接口，发送一段文字请求，云端AI服务器就会返回回答。本程序的AI分析、视频总结、广告跳过、舆情分析功能均依赖通过API寻求AI回答。</li><li><b>什么是API Key（密钥）：</b>相当于你的AI接口「门禁密码」，每一次调用AI都需要携带这个密钥验证身份、扣除额度，密钥请勿泄露。本程序开源可查，不会上传您的API Key。</li></ul>
                        <div style="font-weight:bold;margin-bottom:4px;font-size:14px;color:#0c4a6e;">● 获取API Key</div>
                        <ul style="margin:0 0 12px 0;padding-left:20px;"><li style="margin-bottom:4px;">选择心仪的供应商（推荐DeepSeek），点击"获取API Key"跳转至供应商官网，注册账号。如果您选择付费模型，需要小额充值，此充值全部归属于供应商，且可做其他用途。如果您不愿意充值，也可以选择智谱的免费模型。</li><li>找到API密钥入口，创建一个API密钥。不要泄露此密钥！</li></ul>
                        <div style="font-weight:bold;margin-bottom:4px;font-size:14px;color:#0c4a6e;">● 使用API Key</div>
                        <ul style="margin:0;padding-left:20px;"><li>在本程序中，选择心仪的供应商和模型，输入API Key即可。<br>由于本程序场景不需要强大的模型能力，建议选择价格较低的模型。</li></ul>
                    </div>
                    <div class="bseas-settings-block"><label class="bseas-settings-check-row"><input type="checkbox" id="bseas-s-disable-api" ${bseas_disable_api ? 'checked' : ''}><div class="bseas-settings-check-text"><span class="bseas-settings-check-title">禁用 API（手动模式）</span><span class="bseas-settings-check-desc">开启后将不调用 AI 接口，改为提供提示词复制键。您可将提示词粘贴给外部 AI 工具进行分析。广告跳过功能将不可用。</span></div></label></div>
                    <div style="border-top:1px solid #e2e8f0; margin:8px 0; opacity:0.5;"></div>
                    <div class="bseas-settings-block"><label class="bseas-settings-block-label">平台 / 供应商</label><select class="bseas-settings-input" id="bseas-s-platform">${pOptions}</select><div style="margin-top:8px;"><a id="bseas-s-link" href="#" target="_blank" style="font-size:12px;color:var(--bseas-primary);text-decoration:none;">获取 API Key →</a></div></div>
                    <div class="bseas-settings-block" id="bseas-url-wrapper" style="display:${bseas_platform === 'custom' ? 'block' : 'none'};"><label class="bseas-settings-block-label">API URL Endpoint</label><input type="text" class="bseas-settings-input" id="bseas-s-url" value="${escapeHtml(bseas_api_url)}"></div>
                    <div class="bseas-settings-block"><label class="bseas-settings-block-label">模型</label><select class="bseas-settings-input" id="bseas-s-model-select"></select><input type="text" class="bseas-settings-input" id="bseas-s-model-custom" style="margin-top:8px;display:none;" placeholder="输入自定义模型名..." value="${escapeHtml(bseas_model)}"></div>
                    <div class="bseas-settings-block"><label class="bseas-settings-block-label">API Key</label><input type="text" class="bseas-settings-input bseas-password-mask" id="bseas-s-key" value="${escapeHtml(currentPlatformKey)}" placeholder="输入API Key..."><div style="font-size:12px;color:var(--bseas-text-muted);margin-top:6px;">本程序不会上传API Key。请勿泄露您的API Key！</div></div>
                </div>
                <div class="bseas-settings-subgroup">
                    <div class="bseas-settings-subgroup-title">AI 分析</div>
                    <div class="bseas-settings-block"><label class="bseas-settings-block-label">详细程度</label><select class="bseas-settings-input" id="bseas-s-detail">${detailOptions}</select></div>
                    <div class="bseas-settings-block"><label class="bseas-settings-check-row"><input type="checkbox" id="bseas-s-auto" ${bseas_auto_summary ? 'checked' : ''}><div class="bseas-settings-check-text"><span class="bseas-settings-check-title">自动分析</span><span class="bseas-settings-check-desc">开启后自动进行 AI 分析</span></div></label></div>
                    <div class="bseas-settings-block">
                    <div style="border-top:1px solid #e2e8f0; margin:8px 0; opacity:0.5;"></div>
                        <label class="bseas-settings-check-row ${!bseas_confirm_enabled ? 'disabled-setting' : ''}">
                            <input type="checkbox" id="bseas-s-confirm-enable" ${bseas_confirm_enabled ? 'checked' : ''}>
                            <div class="bseas-settings-check-text">
                                <span class="bseas-settings-check-title">启用二次确认</span>
                                <span class="bseas-settings-check-desc">关闭后，无论字幕多少都不会弹出确认框，直接调用 AI。</span>
                            </div>
                        </label>
                    </div>
                    <div class="bseas-settings-block">
                        <label class="bseas-settings-block-label">二次确认字数阈值</label>
                        <input type="number" class="bseas-settings-input" id="bseas-s-confirm-chars" value="${bseas_confirm_chars}" min="1000" ${!bseas_confirm_enabled ? 'disabled' : ''}>
                        <div style="font-size:12px;color:var(--bseas-text-muted);margin-top:6px;">当字幕文字量超过此阈值时，调用AI分析需要二次确认，以免浪费Tokens。此处字数包括时间戳。</div>
                    </div>
                    <div style="border-top:1px solid #e2e8f0; margin:8px 0; opacity:0.5;"></div>
                    <div class="bseas-settings-block"><label class="bseas-settings-check-row"><input type="checkbox" id="bseas-s-latex" ${bseas_latex ? 'checked' : ''}><div class="bseas-settings-check-text"><span class="bseas-settings-check-title">LaTeX 公式渲染 (Beta)</span><span class="bseas-settings-check-desc">开启后 AI 可以输出并渲染 LaTeX 公式。目前正在测试中，可能不稳定。</span></div></label></div>
                </div>
                <div class="bseas-settings-subgroup">
                    <div class="bseas-settings-subgroup-title">广告跳过</div>
                    <div class="bseas-settings-block"><label class="bseas-settings-check-row"><input type="checkbox" id="bseas-s-auto-skip" ${bseas_auto_skip_ad ? 'checked' : ''}><div class="bseas-settings-check-text"><span class="bseas-settings-check-title">广告自动跳过</span><span class="bseas-settings-check-desc">开启后检测到广告时段将自动跳过。关闭后仅在进度条标黄提示，不自动跳转。</span></div></label></div>
                </div>
                <div class="bseas-settings-subgroup">
                    <div class="bseas-settings-subgroup-title">舆情分析</div>
                    <div class="bseas-settings-block"><label class="bseas-settings-check-row"><input type="checkbox" id="bseas-s-opinion" ${bseas_opinion_analysis ? 'checked' : ''}><div class="bseas-settings-check-text"><span class="bseas-settings-check-title">舆论分析（热门评论）</span><span class="bseas-settings-check-desc">开启后AI分析将获取热门评论并包含对评论的舆论倾向分析。</span></div></label></div>
                    <div class="bseas-settings-block"><label class="bseas-settings-block-label">最大获取评论数</label><input type="number" class="bseas-settings-input" id="bseas-s-opinion-count" value="${bseas_opinion_comments_count}" min="0" max="100"></div>
                </div>
            </div>
            <div class="bseas-settings-group">
                <div class="bseas-settings-group-title"><span class="bseas-settings-group-title-dot"></span>面板设置</div>
                <div class="bseas-settings-subgroup">
                    <div class="bseas-settings-block"><label class="bseas-settings-check-row"><input type="checkbox" id="bseas-s-auto-open" ${bseas_auto_open_panel ? 'checked' : ''}><div class="bseas-settings-check-text"><span class="bseas-settings-check-title">自动打开面板</span><span class="bseas-settings-check-desc">开启后自动打开面板。仅在有字幕的视频中生效。</span></div></label></div>
                    <div class="bseas-settings-block"><label class="bseas-settings-block-label">自动打开的标签页</label><select class="bseas-settings-input" id="bseas-s-auto-tab" ${!bseas_auto_open_panel ? 'disabled' : ''}>${tabOptions}</select></div>
                    <div style="border-top:1px solid #e2e8f0; margin:8px 0; opacity:0.5;"></div>
                    <div class="bseas-settings-block"><label class="bseas-settings-block-label">按钮默认位置</label><select class="bseas-settings-input" id="bseas-s-pos-preset"><option value="top-left" ${bseas_panel_pos_preset === 'top-left' ? 'selected' : ''}>左上</option><option value="top-right" ${bseas_panel_pos_preset === 'top-right' ? 'selected' : ''}>右上</option><option value="bottom-left" ${bseas_panel_pos_preset === 'bottom-left' ? 'selected' : ''}>左下</option><option value="bottom-right" ${bseas_panel_pos_preset === 'bottom-right' ? 'selected' : ''}>右下</option></select></div>
                    <div style="border-top:1px solid #e2e8f0; margin:8px 0; opacity:0.5;"></div>
                    <div class="bseas-settings-block"><label class="bseas-settings-block-label">浏览页加载字幕数量</label><input type="number" class="bseas-settings-input" id="bseas-s-max-preview" value="${bseas_max_preview_subtitles}" min="1"><div style="font-size:12px;color:var(--bseas-text-muted);margin-top:6px;">为避免页面卡顿，浏览页最多渲染此数量的字幕。</div></div>
                </div>
            </div>
            <div class="bseas-author-info"><div class="bseas-ext-links"><a href="${GITHUB_REPO_URL}" target="_blank" class="bseas-ext-link"><svg viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>GitHub</a><a href="${GREASYFORK_URL}" target="_blank" class="bseas-ext-link"><svg viewBox="0 0 1024 1024"><path d="M514.56 514.56m-486.4 0a486.4 486.4 0 1 0 972.8 0 486.4 486.4 0 1 0-972.8 0Z"/><path d="M389.376 249.856c102.0416 103.0144 103.9872 105.8816 99.1744 141.5168-3.84 37.5296-3.84 37.5296 172.3392 216.576 97.2288 98.2016 177.152 183.8592 177.152 190.6176 0 26.9312-21.1968 49.1008-45.2608 49.1008-20.224 0-62.5664-36.5568-204.0832-177.152-153.088-152.1152-181.9648-176.1792-196.4032-168.448-31.744 18.2784-57.7536 0.9728-159.7952-101.0688-76.0832-76.0832-98.2016-103.9872-93.3888-117.4528 5.7856-14.4384 19.2512-3.84 82.7904 58.7264L298.9056 418.304l21.1968-21.1968 21.1968-21.1968-75.1104-75.9808c-50.0736-51.0464-71.2192-77.9776-63.5392-82.7904 7.68-4.8128 38.5024 20.224 85.6576 66.4064L361.472 356.7104l22.1184-21.1968 21.1968-22.1184-73.1648-73.1648C268.0832 175.7184 250.7776 144.896 277.7088 144.896c3.84 0 53.9136 47.2064 111.6672 104.96z" fill="#FFFFFF"/></svg>Greasy Fork</a><a href="${SCRIPTCAT_URL}" target="_blank" class="bseas-ext-link"><svg viewBox="0 0 1024 1024" width="14" height="14"><path fill="currentColor" d="M501.333333 273.322667c-63.146667 0-69.461333 6.698667-102.144 6.698666C371.968 280.021333 290.218667 213.333333 249.386667 213.333333c-40.874667 0-88.533333 24.021333-88.533334 93.354667v80c0.085333 20.992 7.68 85.333333 37.546667 68.138667-35.285333 41.728-38.826667 90.410667-38.357333 137.514666-9.514667 2.730667-19.2 5.845333-28.629334 9.045334-29.184 9.984-60.16 22.698667-74.112 31.744a32 32 0 0 0 34.730667 53.76c6.656-4.309333 30.762667-14.933333 60.074667-24.96l9.728-3.2c1.962667 18.474667 6.869333 35.413333 14.165333 50.773333l-1.024 0.554667c-17.493333 9.216-33.706667 19.84-44.032 26.581333l-4.821333 3.157333a32 32 0 1 0 34.730666 53.76l5.589334-3.669333c10.453333-6.826667 23.850667-15.573333 38.442666-23.253333 3.413333-1.834667 6.698667-3.456 9.856-4.949334C288.554667 830.933333 421.12 853.333333 501.333333 853.333333s212.778667-22.4 286.592-91.648c3.157333 1.493333 6.4 3.114667 9.856 4.949334 14.592 7.68 27.989333 16.426667 38.442667 23.253333l5.589333 3.669333a32 32 0 0 0 34.730667-53.76l-4.821333-3.157333a555.008 555.008 0 0 0-44.032-26.581333l-1.024-0.554667c7.296-15.36 12.202667-32.298667 14.165333-50.773333l9.728 3.2c29.312 10.026667 53.418667 20.650667 60.117333 24.96a32 32 0 0 0 34.688-53.76c-13.952-9.045333-44.928-21.76-74.069333-31.744-9.429333-3.2-19.157333-6.314667-28.672-9.088 0.512-47.104-3.072-95.744-38.4-137.472 29.866667 17.194667 37.546667-47.146667 37.589333-68.181334V306.688C841.813333 237.354667 794.154667 213.333333 753.28 213.333333c-40.832 0-122.581333 66.688-149.76 66.688-32.725333 0-39.04-6.698667-102.186667-6.698666z"/></svg>脚本猫</a></div><p class="bseas-author-text">作者: <a href="https://github.com/LiuMashiro" target="_blank" class="bseas-author-link">LiuMashiro</a></p><p class="bseas-author-text" style="margin-top:8px;">字幕获取模块部分使用了M0M Chen的 视频字幕提取器Pro 代码（MIT）</p><p class="bseas-author-text" style="margin-top:12px;font-size:12px;">当前版本: v${SCRIPT_VERSION}${updateBadgeHtml}</p></div>
            <div style="text-align:center; margin-top:2px;">
                <a href="javascript:void(0);" class="bseas-danger-link" id="bseas-clear-cache">清除所有储存</a>
                <span style="color: var(--bseas-text-muted); margin: 0 4px;">|</span>
                <a href="javascript:void(0);" class="bseas-danger-link" id="bseas-factory-reset">清除所有储存并恢复出厂设置</a>
            </div>
        </div>`);
        const pSelect = document.getElementById('bseas-s-platform');
        const urlWrapper = document.getElementById('bseas-url-wrapper');
        const urlInput = document.getElementById('bseas-s-url');
        const mSelect = document.getElementById('bseas-s-model-select');
        const mCustom = document.getElementById('bseas-s-model-custom');
        const pLink = document.getElementById('bseas-s-link');
        const autoOpenCheckbox = document.getElementById('bseas-s-auto-open');
        const autoTabSelect = document.getElementById('bseas-s-auto-tab');
        let previousPlatform = bseas_platform;
        function updateUIForPlatform(isInit = false) {
            const plat = pSelect.value;
            const pData = API_PLATFORMS[plat];
            pLink.href = pData.link;
            pLink.style.display = pData.link ? 'inline-block' : 'none';
            urlWrapper.style.display = plat === 'custom' ? 'block' : 'none';
            if (!isInit || plat !== 'custom') { if (plat !== 'custom') urlInput.value = pData.url; }
            urlInput.disabled = plat !== 'custom';
            const models = pData.models;
            mSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join('');
            if (isInit) { if (models.includes(bseas_model)) mSelect.value = bseas_model; else { mSelect.value = '自定义'; mCustom.value = bseas_model; } }
            else mSelect.selectedIndex = 0;
            updateModelCustom();
        }
        function updateModelCustom() { mCustom.style.display = mSelect.value === '自定义' ? 'block' : 'none'; }
        autoOpenCheckbox.addEventListener('change', () => {
            autoTabSelect.disabled = !autoOpenCheckbox.checked;
            if (autoTabSelect.disabled) {
                autoTabSelect.classList.add('disabled-setting');
            } else {
                autoTabSelect.classList.remove('disabled-setting');
            }
        });
        // API 禁用开关
        const disableApiCheckbox = document.getElementById('bseas-s-disable-api');
        const apiInputs = [
            document.getElementById('bseas-s-platform'),
            document.getElementById('bseas-s-url'),
            document.getElementById('bseas-s-model-select'),
            document.getElementById('bseas-s-model-custom'),
            document.getElementById('bseas-s-key')
        ];
        function toggleApiSettings(disabled) {
            apiInputs.forEach(el => {
                if (el) {
                    el.disabled = disabled;
                    if (disabled) el.classList.add('disabled-setting');
                    else el.classList.remove('disabled-setting');
                }
            });
        }
        if (disableApiCheckbox) {
            toggleApiSettings(disableApiCheckbox.checked);
            disableApiCheckbox.addEventListener('change', () => toggleApiSettings(disableApiCheckbox.checked));
        }
        // 二次确认开关
        const confirmEnableCheckbox = document.getElementById('bseas-s-confirm-enable');
        const confirmCharsInput = document.getElementById('bseas-s-confirm-chars');
        function toggleConfirmThreshold(enabled) {
            confirmCharsInput.disabled = !enabled;
            if (!enabled) confirmCharsInput.classList.add('disabled-setting');
            else confirmCharsInput.classList.remove('disabled-setting');
        }
        if (confirmEnableCheckbox) {
            toggleConfirmThreshold(confirmEnableCheckbox.checked);
            confirmEnableCheckbox.addEventListener('change', () => toggleConfirmThreshold(confirmEnableCheckbox.checked));
        }
        pSelect.addEventListener('change', () => {
            const currentKeyInput = document.getElementById('bseas-s-key');
            GM_setValue('bseas_api_key_' + previousPlatform, currentKeyInput.value);
            previousPlatform = pSelect.value;
            updateUIForPlatform(false);
            currentKeyInput.value = GM_getValue('bseas_api_key_' + pSelect.value, '');
        });
        mSelect.addEventListener('change', updateModelCustom);
        updateUIForPlatform(true);
        document.getElementById('bseas-api-hint-btn')?.addEventListener('click', () => {
            const box = document.getElementById('bseas-api-hint-box');
            const btn = document.getElementById('bseas-api-hint-btn');
            if (box.style.display === 'none') { box.style.display = 'block'; btn.textContent = '收起提示'; }
            else { box.style.display = 'none'; btn.textContent = '查看使用提示'; }
        });
        document.getElementById('bseas-clear-cache')?.addEventListener('click', () => {
            if (!confirm('确认清除所有AI分析储存？这将删除您已生成的所有AI分析。此操作不可恢复！')) return;
            try {
                GM_deleteValue('aiSummaryCache');
                showToast('✓ 已清除储存，即将刷新页面...', 'success');
                setTimeout(() => location.reload(), 1200);
            } catch (e) { showToast('✗ 清除失败: ' + e.message, 'error'); }
        });
        document.getElementById('bseas-factory-reset')?.addEventListener('click', () => {
            if (!confirm('确认清除所有储存和设置并恢复出厂模式？这将删除您已生成的所有AI分析。此操作不可恢复！')) return;
            try {
                const keys = GM_listValues();
                keys.forEach(k => GM_deleteValue(k));
                showToast('✓ 已恢复出厂设置，即将刷新页面...', 'success');
                setTimeout(() => location.reload(), 1200);
            } catch (e) { showToast('✗ 重置失败: ' + e.message, 'error'); }
        });
    }

    // ===================== 24. 初始化与路由监听 =====================
    function init() {
        log('B站字幕获取、AI分析及广告跳过工具 v' + SCRIPT_VERSION + ' 已加载。作者：LiuMashiro');
        aiSummaryCache = loadCache();
        createUI();
        setTimeout(() => { fetchAllSubtitles(); initAdSkipMonitor(); }, AUTO_FETCH_DELAY_MS);
        setTimeout(() => { checkForUpdates(); }, 5000);
    }
    function resetState() {
        if (autoGenerateTimer) { clearTimeout(autoGenerateTimer); autoGenerateTimer = null; }
        if (adSkipInterval) { clearInterval(adSkipInterval); adSkipInterval = null; }
        if (progressMarkObserver) { progressMarkObserver.disconnect(); progressMarkObserver = null; }
        abortCurrentRequest();
        currentGenerationId++;
        isGeneratingAI = false;
        progressMarkInitialized = false;
        lastAdCheckResult = null;
        currentVideoKey = null;
        currentAid = null;
        hotComments = [];
        allSubtitles = [];
        currentSubtitleData = null;
        selectedSubtitleId = null;
        aiConversationHistory = [];
        adSegments = [];
        hasJumpedAds = {};
        showRawAIText = false;
        subtitleSearchKeyword = '';
        const existingMark = document.getElementById('bseas-ad-progress-mark');
        if (existingMark) existingMark.remove();
        updateUI();
        setTimeout(() => fetchAllSubtitles(), AUTO_FETCH_DELAY_MS);
    }
    let lastUrl = location.href;
    new MutationObserver(() => { if (location.href !== lastUrl) { lastUrl = location.href; resetState(); } }).observe(document, { subtree: true, childList: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
