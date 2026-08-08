// ==UserScript==
// @name         B站字幕获取、AI分析及广告跳过工具
// @namespace    http://tampermonkey.net/
// @version      2.4.2
// @description  实现字幕提取、AI内容总结（并可追问）、植入广告自动识别自动跳过，并依据评论区热门评论进行舆情分析。
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
// @require      https://cdn.jsdelivr.net/npm/pinyin-pro@3.28.1/dist/index.js
// @resource     KATEX_CSS https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ===================== 1. 常量配置 =====================
    const SCRIPT_VERSION = '2.4.2';
    const GITHUB_REPO_URL = 'https://github.com/LiuMashiro/Bilibili-Subtitle-Extraction-AI-Summary-Ad-Skipping/tree/main';
    const GREASYFORK_URL = 'https://greasyfork.org/zh-CN/scripts/579482';
    const SCRIPTCAT_URL = 'https://scriptcat.org/zh-CN/script-show-page/6728';
    const CHANGELOG_RAW_URL = 'https://raw.githubusercontent.com/LiuMashiro/Bilibili-Subtitle-Extraction-AI-Summary-Ad-Skipping/main/CHANGELOG.md';
    const AD_KEYWORD_LIST = ['转转', '追觅', '神奇小鹿', '妙界', '拼多多', '加速器', '得物', '萌牙家', '夏凉被', '小冰被', '欧莱雅', '海蓝之谜', '洗发水', '防脱发产品', '洗面奶', '扫地机器人', '蓝盒子', '黑白调', '西昊', '按摩仪', '笑容加', '牙刷', '618', '双十一', '云鲸', '徕芬', 'UWANT 友望', '慕思', '珀莱雅', '鱼油'];
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
    const TAB_ORDER = ['preview', 'ai', 'text', 'settings'];

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
    const bseas_latex = true;
    let bseas_disable_api = GM_getValue('bseas_disable_api', false);
    let bseas_panel_pos_preset = GM_getValue('bseas_panel_pos_preset', 'top-right');
    let bseas_max_preview_subtitles = GM_getValue('bseas_max_preview_subtitles', 600);
    if (bseas_max_preview_subtitles === 200) { bseas_max_preview_subtitles = 600; GM_setValue('bseas_max_preview_subtitles', 600); }
    let bseas_confirm_chars = GM_getValue('bseas_confirm_chars', 20000);
    let bseas_confirm_enabled = GM_getValue('bseas_confirm_enabled', true);
    let bseas_ai_evaluation = GM_getValue('bseas_ai_evaluation', false);
    let bseas_save_tokens = GM_getValue('bseas_save_tokens', false);
    let bseas_update_mode = GM_getValue('bseas_update_mode', 'reduced');
    let bseas_update_last_prompt_ts = GM_getValue('bseas_update_last_prompt_ts', 0);

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

    function buildDetailWords(level) {
        switch (level) {
            case 'very_detailed': return { summaryWord: '非常详细', overviewWord: '全面', listWord: '详细地分点列出核心结论、关键信息和具体细节（包含论述过程和支撑论据）' };
            case 'detailed': return { summaryWord: '详细', overviewWord: '详细', listWord: '详细地分点列出核心结论和关键信息' };
            case 'minimal': return { summaryWord: '极简', overviewWord: '极简', listWord: '极简地分点列出核心要点（剔除一切修饰性废话）' };
            default: return { summaryWord: '简洁', overviewWord: '简明', listWord: '精简地分点列出核心结论和关键信息（剔除修饰性废话）' };
        }
    }
    function buildBgmNote() { return '标注音符♪符号的是背景音乐/主人物唱歌。'; }
    function buildOpinionSection(saveTokens) {
        if (saveTokens) return { head: '## 舆论分析', body: '极简提炼热门评论整体观点和氛围，无评论跳过' };
        return { head: '## 舆论分析', body: '- 提炼评论区的1-N个主要观点方向（根据情况决定），简明概括每个方向的核心立场，标注每个观点方向的情感倾向（正面/负面/中性/混合）和大约占比。\n- 如有高赞代表性观点，可简要引用（无需标注用户名）\n- 一句话概括评论区整体氛围' };
    }
    function buildAiEvaluationSection(saveTokens) {
        if (saveTokens) return { head: '## AI评价', body: '客观、理性、一针见血地评价本视频（两句话以内）。默认内容事实属实。' };
        return { head: '## AI评价', body: '对视频做出客观、理性、简洁、透过现象看本质、深度且一针见血的评价。自行决定对本视频、本评论区的立场（可以支持、可以反对），但言语保持克制。考虑到信息滞后，请默认内容事实属实，不质疑事实真实性。' };
    }
    function buildAdRulesSection(adHint, saveTokens) {
        if (saveTokens) {
            if (adHint) return '字幕含时间戳[MM:SS - MM:SS]。识别中间插入的最长一段广告，末尾输出一行：广告时间[MM:SS - MM:SS]（无广告则输出 广告时间[无]）。';
            return '末尾严格输出一行：广告时间[无]';
        }
        const hint = adHint ? '【重要！本视频很可能含有广告，请注意按要求输出广告时间！】\n' : '';
        return `${hint}识别中间插入的广告。在全文末尾列出"广告时间"部分，支持以下两种格式：
格式A（同一行）：广告时间[MM:SS - MM:SS]
格式B（分行）：
### 广告时间
[MM:SS - MM:SS]

规则：
- 如果视频中没有广告，请严格回复：广告时间[无]
- 如果有多段中间插入的广告，取最长的一段。
- <5s的广告时间，或者整个视频都是广告，则忽略不计。
- 只包含分钟和秒，禁止任何其他多余文字、符号或标点。
- "-"左右包含空格。
- 超长视频允许分钟数值大于60，如[70:00 - 75:00]。禁止小时位。禁止分秒毫秒位。`;
    }

    function getAISummaryPrompt(hasSubtitle, includeFormatRules = true, adHint = false) {
        const saveTokens = bseas_save_tokens;
        const aiEvaluation = bseas_ai_evaluation;
        const opinionAnalysis = bseas_opinion_analysis;

        if (saveTokens) {
            const parts = [];
            if (hasSubtitle) {
                parts.push('## 视频总结\n从字幕极简总结视频核心内容，剔除一切修饰废话。');
            } else {
                parts.push('根据视频标题、简介、热门评论（如有）极简进行舆论分析，剔除一切修饰废话。');
            }
            if (opinionAnalysis) { const op = buildOpinionSection(true); parts.push(op.head + '\n' + op.body); }
            if (aiEvaluation) { const ev = buildAiEvaluationSection(true); parts.push(ev.head + '\n' + ev.body); }
            parts.push(buildAdRulesSection(adHint, true));
            return parts.join('\n\n');
        }

        const formatRules = includeFormatRules ? getFormatRules() + '\n\n' : '';

        if (!hasSubtitle) {
            const opinion = buildOpinionSection(false);
            const aiEval = aiEvaluation ? buildAiEvaluationSection(false) : null;
            let p = `${formatRules}当前视频未提供字幕数据。请根据视频标题、简介及热门评论（如有）直接进行舆论分析，不做内容总结。\n若无评论数据，则仅分析标题与简介的倾向。\n\n请直接输出：\n${opinion.head}\n${opinion.body}`;
            if (aiEval) p += `\n\n---\n${aiEval.head}\n${aiEval.body}`;
            p += `\n\n${buildBgmNote()}\n\n${buildAdRulesSection(adHint, false)}`;
            return p;
        }

        const d = buildDetailWords(bseas_detail_level);
        const opinion = opinionAnalysis ? buildOpinionSection(false) : null;
        const aiEval = aiEvaluation ? buildAiEvaluationSection(false) : null;

        let p = `${formatRules}请根据以下字幕内容生成一份【${d.summaryWord}】的视频总结。\n\n注意事项：\n- 不要提及广告植入、商业推广等内容，只聚焦核心内容。广告关键词包括（但不限于）：${AD_KEYWORD_LIST.join('、')}。\n- 字幕含时间戳[MM:SS.ms]，总结中请剔除时间戳只保留文字。字幕为智能识别，可能包含错误。\n\n输出结构（确保第一行为"## 视频总结"，最多使用"###"三级标题）：\n\n## 视频总结\n\n### 核心主题\n${d.overviewWord}概括视频核心主题和整体概述。\n\n### 核心结论与关键信息\n${d.listWord}。\n\n示例：\n## 视频总结\n\n### 核心主题\n示例内容。\n\n### 核心结论与关键信息\n- **示例内容**：\n  - 示例内容。`;

        if (opinion) {
            p += `\n\n---\n\n若提供热门评论数据，在"核心结论与关键信息"之后输出舆论分析：\n${opinion.head}\n${opinion.body}\n若无评论数据，则跳过，不输出"---"和"## 舆论分析"。`;
        }
        if (aiEval) {
            p += `\n\n---\n\n${aiEval.head}\n${aiEval.body}`;
        }
        p += `\n\n${buildBgmNote()}\n\n${buildAdRulesSection(adHint, false)}`;
        return p;
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
    const ASK_ICON_SVG = '<svg class="bseas-qa-icon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
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
            --bseas-ad-bg: #ffffff; --bseas-ad-border: #f59e0b; --bseas-ad-text: #92400e;
            --bseas-ad-button: #d97706; --bseas-ad-button-hover: #b45309;
            --bseas-danger: #ff3b30;
            --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
            --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
            --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
        }
        * { font-family: -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif !important; }
        .bseas-container { position:fixed; z-index:100010; }
        .bseas-trigger-btn {
            width: 60px; height: 60px;
            border-radius: 20px;
            background: rgba(255,255,255,0.62);
            backdrop-filter: blur(8px) saturate(140%);
            -webkit-backdrop-filter: blur(8px) saturate(140%);
            border: 1px solid rgba(255,255,255,0.6);
            cursor: grab;
            box-shadow:
                0 8px 24px rgba(0,0,0,0.12),
                0 16px 40px rgba(0,0,0,0.08),
                0 4px 10px rgba(0,0,0,0.05),
                inset 0 1px 0 rgba(255,255,255,0.9),
                inset 0 -1px 0 rgba(0,0,0,0.04);
            display:flex; align-items:center; justify-content:center;
            transition: transform 0.45s var(--ease-spring), box-shadow 0.35s var(--ease-out), background 0.3s;
            position: relative;
        }
        .bseas-trigger-btn:active { cursor:grabbing; }
        .bseas-trigger-btn:hover {
            transform: translateY(-3px) scale(1.06);
            background: rgba(255,255,255,0.8);
            box-shadow:
                0 22px 52px rgba(0,0,0,0.18),
                0 6px 14px rgba(0,0,0,0.07),
                inset 0 1px 0 rgba(255,255,255,0.95);
        }
        .bseas-trigger-btn:active { transform: scale(0.94); }
        .bseas-trigger-btn svg { width:26px; height:26px; fill: var(--bseas-primary); transition: transform 0.55s var(--ease-spring), fill 0.3s; pointer-events:none; filter: drop-shadow(0 1px 2px rgba(0,174,236,0.25)); }
        .bseas-trigger-btn.on-dark svg { fill:#fff; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }
        .bseas-trigger-btn:hover svg { transform: scale(1.15); }
        .bseas-trigger-btn::after {
            content:''; position:absolute; inset:-2px; border-radius:22px;
            background: radial-gradient(circle at var(--bseas-mx, 30%) var(--bseas-my, 20%), rgba(0,174,236,0.18), transparent 60%);
            opacity:0; transition: opacity 0.4s var(--ease-out); pointer-events:none; z-index:-1;
        }
        .bseas-trigger-btn:hover::after { opacity:1; }
        .bseas-status-dot {
            position:absolute; top:-1px; right:-1px; width:11px; height:11px;
            border-radius:50%; border:2px solid #fff;
            transition: background 0.4s var(--ease-out), transform 0.4s var(--ease-spring), opacity 0.3s;
            display:none; pointer-events:none;
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
        }
        .bseas-status-dot.state-yellow { display:block; background:#ff9500; transform:scale(1); animation: bseas-pulse 2.4s ease-in-out infinite; }
        .bseas-status-dot.state-green { display:block; background:#34c759; transform:scale(1); }
        .bseas-status-dot.state-red { display:block; background:#ef4444; transform:scale(1); animation: bseas-pulse 1.4s ease-in-out infinite; }
        @keyframes bseas-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255,149,0,0.45); }
            50% { box-shadow: 0 0 0 5px rgba(255,149,0,0); }
        }
        @keyframes bseas-spin { to{transform:rotate(360deg)} }
        @keyframes bseas-slideup { from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none} }
        @keyframes bseas-shake { 0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-2px)}20%,40%,60%,80%{transform:translateX(2px)} }
        @keyframes bseas-panel-in { 0%{opacity:0;transform:translateY(-12px) scale(0.94)}60%{transform:translateY(2px) scale(1.01)}100%{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes bseas-panel-out { 0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-10px) scale(0.95)} }
        @keyframes bseas-tab-in-right { from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none} }
        @keyframes bseas-tab-in-left { from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none} }
        .bseas-panel { position:absolute; width:min(430px, calc(100vw - 40px)); height:min(calc(100vh - 120px),66vh); background:var(--bseas-bg-glass); backdrop-filter:blur(24px); border-radius:var(--bseas-radius-lg); box-shadow:var(--bseas-shadow); border:1px solid rgba(255,255,255,0.4); display:none; flex-direction:column; overflow:hidden; left:0; animation:bseas-panel-in 0.28s var(--ease-spring); transition:top 0.4s var(--ease-spring), bottom 0.4s var(--ease-spring); }
        .bseas-panel.show { display:flex; }
        .bseas-panel.hiding { animation:bseas-panel-out 0.22s var(--ease-standard) forwards; }
        .bseas-panel.no-transition { transition:none !important; }
        .bseas-resize-edge { position:absolute; z-index:40; pointer-events:auto; }
        .bseas-resize-edge.left { left:0; top:0; width:6px; height:100%; cursor:ew-resize; }
        .bseas-resize-edge.right { right:0; top:0; width:6px; height:100%; cursor:ew-resize; }
        .bseas-resize-edge.bottom { left:6px; right:6px; bottom:0; height:4px; cursor:ns-resize; }
        .bseas-resize-edge:hover { background:rgba(0,174,236,0.12); }
        .bseas-resize-edge.bottom::after { content:''; position:absolute; left:50%; top:50%; transform:translate(-50%,-65%); width:54px; height:3px; border-radius:3px; background:rgba(148,163,184,0.4); transition:background 0.2s; pointer-events:none; }
        .bseas-resize-edge.left::after { content:''; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:3px; height:64px; border-radius:3px; background:rgba(148,163,184,0.4); transition:background 0.2s; pointer-events:none; }
        .bseas-resize-edge.bottom:hover::after, .bseas-resize-edge.left:hover::after { background:rgba(0,174,236,0.55); }
        .bseas-header { padding:10px 22px 6px; border-bottom:1px solid var(--bseas-border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }
        .bseas-header-text { cursor:move; flex:1; min-width:0; }
        .bseas-title { font-size:16px; font-weight:700; color:var(--bseas-text); margin:0; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bseas-subtitle-info { font-size:13px; color:var(--bseas-text-dim); margin-top:2px; font-weight:500; transition:color 0.3s; }
        .bseas-ad-hint { font-size:12px; color:var(--bseas-text-muted); margin-top:1px; font-weight:400; display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
        .bseas-header-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
        .bseas-icon-btn { width:34px; height:34px; border-radius:var(--bseas-radius-sm); background:#ffffff; border:1px solid var(--bseas-border); cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--bseas-text-dim); transition:all 0.2s; text-decoration:none; }
        .bseas-icon-btn:hover { background:#e2e8f0; color:var(--bseas-text); transform:scale(1.05); }
        .bseas-icon-btn:active { transform:scale(0.95); }
        .bseas-icon-btn svg { width:18px; height:18px; fill:currentColor; transition:transform 0.4s ease; }
        .bseas-icon-btn.spinning svg { animation:bseas-spin 0.8s linear infinite; }
        .bseas-icon-btn.settings-btn:hover svg { transform:rotate(90deg); }
        .bseas-update-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; background:linear-gradient(135deg,#ef4444,#dc2626); color:white; font-size:11px; font-weight:700; border-radius:8px; cursor:pointer; text-decoration:none; transition:all 0.2s; margin-left:4px; vertical-align:middle; white-space:nowrap; }
        .bseas-update-badge:hover { transform:scale(1.05); box-shadow:0 2px 8px rgba(220,38,38,0.4); color:white; text-decoration:none; }
        .bseas-update-badge-close { display:inline-flex; align-items:center; justify-content:center; margin-left:4px; width:16px; height:16px; border-radius:50%; background:rgba(255,255,255,0.25); cursor:pointer; }
        .bseas-update-badge-close:hover { background:rgba(255,255,255,0.45); }
        .bseas-correct-btns { display:flex; gap:8px; width:100%; margin-top:6px; }
        .bseas-correct-op { display:flex; align-items:center; justify-content:center; gap:6px; flex:1; min-width:0; color:white; background:var(--bseas-primary); border:none; padding:6px 14px; border-radius:20px; cursor:pointer; position:relative; overflow:hidden; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); box-shadow:0 1px 3px rgba(0,0,0,0.04); font-size:13px; font-weight:500; }
        .bseas-correct-op > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .bseas-correct-op.edit { background:white; color:var(--bseas-text); border:1px solid var(--bseas-border); }
        .bseas-correct-op:hover { transform:translateY(-2px); box-shadow:0 4px 14px rgba(0,174,236,0.2); }
        .bseas-correct-op.edit:hover { border-color:var(--bseas-primary); color:var(--bseas-primary); box-shadow:0 4px 14px rgba(0,174,236,0.1); }
        .bseas-correct-op:active { transform:translateY(0); }
        .bseas-correct-op.loading { opacity:0.6; pointer-events:none; }
        .bseas-correct-op.disabled { opacity:0.45; filter:grayscale(60%); cursor:not-allowed; }
        .bseas-correct-progress { position:absolute; left:0; top:0; height:100%; width:0%; background:rgba(255,255,255,0.25); pointer-events:none; }
        .bseas-edit-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:100020; display:flex; align-items:center; justify-content:center; animation:bseas-fadein 0.2s ease; }
        .bseas-edit-overlay.closing { animation:bseas-fadeout 0.2s ease forwards; }
        @keyframes bseas-fadein { from{opacity:0} to{opacity:1} }
        @keyframes bseas-fadeout { from{opacity:1} to{opacity:0} }
        .bseas-edit-modal { background:white; border-radius:12px; width:90%; max-width:640px; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 8px 32px rgba(0,0,0,0.2); animation:bseas-edit-modal-in 0.28s var(--ease-spring); }
        .bseas-edit-modal.closing { animation:bseas-edit-modal-out 0.2s var(--ease-out) forwards; }
        @keyframes bseas-edit-modal-in { from{opacity:0; transform:translateY(-60px) scale(0.96)} to{opacity:1; transform:none} }
        @keyframes bseas-edit-modal-out { from{opacity:1; transform:none} to{opacity:0; transform:translateY(-60px) scale(0.96)} }
        .bseas-edit-modal-header { padding:14px 20px; font-size:16px; font-weight:600; color:var(--bseas-text); border-bottom:1px solid var(--bseas-border); display:flex; align-items:center; justify-content:space-between; }
        .bseas-edit-modal-body { flex:1; overflow-y:auto; padding:8px 20px; }
        .bseas-edit-entry { display:flex; gap:8px; padding:8px 0; border-bottom:1px solid rgba(0,0,0,0.05); align-items:flex-start; }
        .bseas-edit-times { display:flex; align-items:center; gap:4px; flex-shrink:0; margin-top:2px; }
        .bseas-edit-time { width:62px; border:1px solid var(--bseas-border); border-radius:6px; padding:4px 5px; font-size:12px; color:var(--bseas-primary); font-family:monospace; font-weight:700; background:rgba(0,174,236,0.06); text-align:center; transition:border-color 0.2s, box-shadow 0.2s; }
        .bseas-edit-time:focus { outline:none; border-color:var(--bseas-primary); box-shadow:0 0 0 2px rgba(0,174,236,0.12); background:#fff; }
        .bseas-edit-arrow { color:var(--bseas-text-muted); display:flex; align-items:center; }
        .bseas-edit-arrow svg { width:14px; height:14px; fill:currentColor; }
        .bseas-edit-actions { display:flex; flex-direction:column; gap:4px; flex-shrink:0; margin-top:2px; }
        .bseas-edit-add { width:30px; height:26px; border:none; border-radius:6px; background:rgba(0,174,236,0.1); color:var(--bseas-primary); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
        .bseas-edit-add:hover { background:rgba(0,174,236,0.22); transform:scale(1.05); }
        .bseas-edit-add svg { width:16px; height:16px; fill:currentColor; }
        .bseas-edit-del { width:30px; height:30px; border:none; border-radius:6px; background:rgba(239,68,68,0.08); color:#ef4444; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.2s; }
        .bseas-edit-del:hover { background:rgba(239,68,68,0.18); transform:scale(1.05); }
        .bseas-edit-del svg { width:16px; height:16px; fill:currentColor; }
        .bseas-edit-ts { font-size:12px; color:var(--bseas-primary); font-family:monospace; font-weight:700; background:rgba(0,174,236,0.06); padding:4px 6px; border-radius:4px; flex-shrink:0; min-width:90px; text-align:center; margin-top:2px; }
        .bseas-edit-textarea { flex:1; border:1px solid var(--bseas-border); border-radius:6px; padding:8px 10px; font-size:15px; color:var(--bseas-text); resize:vertical; min-height:38px; font-family:inherit; transition:border-color 0.2s; line-height:1.5; }
        .bseas-edit-textarea:focus { outline:none; border-color:var(--bseas-primary); box-shadow:0 0 0 2px rgba(0,174,236,0.1); }
        .bseas-edit-toolbar { display:flex; gap:8px; padding:10px 20px; border-bottom:1px solid var(--bseas-border); flex-wrap:wrap; align-items:center; }
        .bseas-edit-tool-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; border:1px solid var(--bseas-border); border-radius:8px; background:#fff; color:var(--bseas-text); font-size:13px; font-weight:500; cursor:pointer; transition:all 0.2s; }
        .bseas-edit-tool-btn:hover { border-color:var(--bseas-primary); color:var(--bseas-primary); transform:translateY(-1px); }
        .bseas-edit-tool-btn svg { width:15px; height:15px; fill:currentColor; }
        .bseas-edit-findbar { display:none; flex-direction:column; gap:6px; padding:10px 20px; background:var(--bseas-bg-card); border-bottom:1px solid var(--bseas-border); }
        .bseas-edit-findbar.open { display:flex; }
        .bseas-edit-find-row { display:flex; gap:6px; align-items:center; }
        .bseas-edit-find-input { flex:1; border:1px solid var(--bseas-border); border-radius:6px; padding:6px 10px; font-size:13px; color:var(--bseas-text); background:#fff; transition:border-color 0.2s; min-width:0; }
        .bseas-edit-find-input:focus { outline:none; border-color:var(--bseas-primary); box-shadow:0 0 0 2px rgba(0,174,236,0.1); }
        .bseas-edit-find-btn { padding:6px 10px; border:none; border-radius:6px; background:var(--bseas-primary); color:#fff; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.2s; white-space:nowrap; }
        .bseas-edit-find-btn:hover { background:var(--bseas-primary-hover); }
        .bseas-edit-find-btn.secondary { background:rgba(120,120,128,0.12); color:var(--bseas-text); }
        .bseas-edit-find-btn.secondary:hover { background:rgba(120,120,128,0.2); }
        .bseas-edit-find-count { font-size:12px; color:var(--bseas-text-muted); white-space:nowrap; }
        .bseas-edit-modal-footer { padding:12px 20px; border-top:1px solid var(--bseas-border); display:flex; justify-content:flex-end; gap:10px; }
        .bseas-edit-modal-btn { padding:6px 18px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; border:none; transition:all 0.2s; display:inline-flex; align-items:center; gap:5px; }
        .bseas-edit-modal-btn svg { width:15px; height:15px; fill:currentColor; flex-shrink:0; }
        .bseas-edit-modal-btn.cancel { background:rgba(120,120,128,0.08); color:var(--bseas-text); }
        .bseas-edit-modal-btn.cancel:hover { background:rgba(120,120,128,0.15); }
        .bseas-edit-modal-btn.save { background:var(--bseas-primary); color:white; }
        .bseas-edit-modal-btn.save:hover { transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,174,236,0.3); }
        .bseas-dl-format-group { display:flex; flex-direction:column; gap:10px; }
        .bseas-dl-option { display:flex; align-items:flex-start; gap:10px; padding:12px; border:1.5px solid var(--bseas-border); border-radius:10px; cursor:pointer; transition:all 0.2s; }
        .bseas-dl-option:hover { border-color:var(--bseas-primary); background:rgba(0,174,236,0.03); }
        .bseas-dl-option input[type="radio"] { appearance:none; -webkit-appearance:none; width:20px; height:20px; border:1.5px solid #cbd5e1; border-radius:50%; cursor:pointer; margin:0; flex-shrink:0; transition:border-color 0.2s, background-color 0.2s, box-shadow 0.2s; position:relative; background:#fff; outline:none; margin-top:1px; }
        .bseas-dl-option input[type="radio"]:hover { border-color:var(--bseas-primary); box-shadow:0 0 0 3px rgba(0,174,236,0.12); }
        .bseas-dl-option input[type="radio"]:checked { background:#fff; border-color:var(--bseas-primary); }
        .bseas-dl-option input[type="radio"]:checked::after { content:''; position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:10px; height:10px; border-radius:50%; background:var(--bseas-primary); }
        .bseas-dl-option.checked { border-color:var(--bseas-primary); background:rgba(0,174,236,0.06); }
        .bseas-dl-option-content { display:flex; flex-direction:column; gap:2px; }
        .bseas-dl-option-title { font-size:14px; font-weight:600; color:var(--bseas-text); }
        .bseas-dl-option-desc { font-size:12px; color:var(--bseas-text-muted); }
        .bseas-dl-ts-row { display:flex; align-items:center; justify-content:space-between; margin-top:16px; padding:10px 12px; background:var(--bseas-bg-card); border-radius:8px; }
        .bseas-dl-ts-label { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; color:var(--bseas-text); cursor:pointer; user-select:none; transition:color 0.2s; }
        .bseas-dl-ts-label:hover { color:var(--bseas-primary); }
        .bseas-dl-ts-label input[type="checkbox"] { appearance:none; -webkit-appearance:none; width:20px; height:20px; border:1.5px solid #cbd5e1; border-radius:6px; cursor:pointer; margin:0; flex-shrink:0; transition:border-color 0.2s, background-color 0.2s, box-shadow 0.2s; position:relative; background:#fff; outline:none; }
        .bseas-dl-ts-label input[type="checkbox"]:hover { border-color:var(--bseas-primary); box-shadow:0 0 0 3px rgba(0,174,236,0.12); }
        .bseas-dl-ts-label input[type="checkbox"]:checked { background:var(--bseas-primary); border-color:var(--bseas-primary); background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6L9 17l-5-5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:center; background-size:13px 13px; }
        .bseas-dl-ts-hint { font-size:11px; color:var(--bseas-text-muted); }
        .bseas-play-toast { position:fixed; left:50%; bottom:11%; transform:translateX(-50%); background:rgba(0,0,0,0.72); color:#fff; padding:10px 28px; border-radius:10px; font-size:19px; line-height:1.5; text-align:center; max-width:82%; z-index:100005; pointer-events:auto; cursor:move; backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); transition:opacity 0.25s ease, bottom 0.15s ease; text-shadow:0 1px 3px rgba(0,0,0,0.5); }
        .bseas-play-toast.empty { opacity:0; pointer-events:none; }
        .bseas-play-toast.no-transition { transition:none !important; }
        .bseas-play-preview { cursor:move; pointer-events:auto; animation:bseas-play-preview-in 0.22s var(--ease-out); }
        @keyframes bseas-play-preview-in { from{opacity:0; transform:translateX(-50%) translateY(8px)} to{opacity:1; transform:translateX(-50%) translateY(0)} }
        .bseas-play-preview.closing { animation:bseas-play-preview-out 0.18s var(--ease-out) forwards; }
        @keyframes bseas-play-preview-out { from{opacity:1; transform:translateX(-50%) translateY(0)} to{opacity:0; transform:translateX(-50%) translateY(8px)} }
        .bseas-play-preview.no-transition { transition:none !important; }
        .bseas-play-line2 { font-size:15px; opacity:0.85; margin-top:5px; }
        .bseas-play-ctrl { position:fixed; right:24px; bottom:24px; z-index:100002; display:flex; align-items:center; gap:8px; background:rgba(0,0,0,0.6); padding:8px 14px; border-radius:22px; backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); }
        .bseas-play-ctrl select { background:rgba(255,255,255,0.15); color:#fff; border:1px solid rgba(255,255,255,0.3); border-radius:6px; padding:4px 8px; font-size:12px; outline:none; cursor:pointer; }
        .bseas-play-ctrl select option { color:#000; }
        .bseas-play-ctrl button { background:none; border:none; color:#fff; cursor:pointer; padding:4px; display:flex; align-items:center; border-radius:50%; transition:background 0.2s; }
        .bseas-play-ctrl button:hover { background:rgba(255,255,255,0.15); }
        .bseas-play-ctrl button svg { width:18px; height:18px; fill:currentColor; }
        .bseas-play-guide { position:fixed; left:50%; top:50%; transform:translate(-50%,-50%); background:white; border-radius:14px; padding:24px 28px; z-index:100030; box-shadow:0 8px 40px rgba(0,0,0,0.25); max-width:420px; width:90%; animation:bseas-play-guide-in 0.24s var(--ease-spring); }
        @keyframes bseas-play-guide-in { from{opacity:0; transform:translate(-50%,-50%) scale(0.92)} to{opacity:1; transform:translate(-50%,-50%) scale(1)} }
        .bseas-play-guide.closing { animation:bseas-play-guide-out 0.18s var(--ease-out) forwards; }
        @keyframes bseas-play-guide-out { from{opacity:1; transform:translate(-50%,-50%) scale(1)} to{opacity:0; transform:translate(-50%,-50%) scale(0.94)} }
        .bseas-play-guide-title { font-size:17px; font-weight:700; color:var(--bseas-text); margin-bottom:6px; text-align:center; }
        .bseas-play-guide-desc { font-size:12px; color:var(--bseas-text-muted); line-height:1.5; margin-bottom:16px; text-align:center; }
        .bseas-play-guide-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; gap:10px; }
        .bseas-play-guide-label { font-size:13px; font-weight:600; color:var(--bseas-text); flex-shrink:0; }
        .bseas-play-guide select { border:1px solid var(--bseas-border); border-radius:6px; padding:5px 8px; font-size:13px; color:var(--bseas-text); background:#fff; outline:none; cursor:pointer; min-width:120px; }
        .bseas-play-guide select:focus { border-color:var(--bseas-primary); }
        .bseas-play-guide-slider { display:flex; align-items:center; gap:8px; flex:1; }
        .bseas-play-guide-slider input[type="range"] { flex:1; -webkit-appearance:none; appearance:none; height:5px; border-radius:3px; background:rgba(0,174,236,0.2); outline:none; cursor:pointer; }
        .bseas-play-guide-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:16px; height:16px; border-radius:50%; background:var(--bseas-primary); cursor:pointer; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,174,236,0.4); }
        .bseas-play-guide-slider input[type="range"]::-moz-range-thumb { width:16px; height:16px; border-radius:50%; background:var(--bseas-primary); cursor:pointer; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,174,236,0.4); }
        .bseas-play-guide-slider input[type="range"]::-moz-range-track { height:5px; border-radius:3px; background:rgba(0,174,236,0.2); }
        .bseas-play-guide-slider span { font-size:12px; color:var(--bseas-text-muted); min-width:32px; text-align:right; }
        .bseas-play-guide-btns { display:flex; gap:10px; justify-content:center; margin-top:16px; }
        .bseas-follow-btn { position:absolute; right:16px; bottom:112px; width:38px; height:38px; border-radius:50%; background:#fff; color:var(--bseas-primary); border:1px solid var(--bseas-border); cursor:pointer; display:none; align-items:center; justify-content:center; z-index:30; transition:all 0.2s; }
        .bseas-follow-btn:hover { transform:scale(1.1); border-color:#cbd5e1; }
        .bseas-follow-btn.active { background:var(--bseas-primary); color:#fff; border-color:var(--bseas-primary); animation:bseas-follow-pulse 2s ease-in-out infinite; }
        .bseas-follow-btn svg { width:12px; height:12px; fill:currentColor; transform:translateX(1px); }
        @keyframes bseas-follow-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        .bseas-subtitle-item.current-follow { background:rgba(0,174,236,0.1); border-radius:6px; transition:background 0.3s ease; }
        .bseas-search-clear { position:absolute; right:10px; top:50%; transform:translateY(-50%); cursor:pointer; color:var(--bseas-text-muted); display:none; align-items:center; justify-content:center; width:20px; height:20px; border-radius:50%; }
        .bseas-search-clear:hover { background:rgba(0,0,0,0.08); color:var(--bseas-text); }
        .bseas-search-icon { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--bseas-text-muted); pointer-events:none; display:flex; }
        .bseas-ext-links { display:flex; gap:8px; justify-content:center; align-items:center; flex-wrap:wrap; margin-bottom:14px; }
        .bseas-ext-link { display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:8px; text-decoration:none; font-size:12px; font-weight:500; transition:all 0.2s; color:var(--bseas-text-dim); background:var(--bseas-bg-card); border:1px solid var(--bseas-border); }
        .bseas-ext-link:hover { color:var(--bseas-text); border-color:#cbd5e1; transform:translateY(-1px); box-shadow:0 2px 6px rgba(0,0,0,0.06); text-decoration:none; }
        .bseas-ext-link svg { width:14px; height:14px; fill:currentColor; flex-shrink:0; }
        .bseas-api-warning { background:var(--bseas-warning-bg); border:1px solid var(--bseas-warning-border); border-radius:var(--bseas-radius-md); padding:10px 16px; margin:8px 22px 0; display:flex; align-items:center; gap:10px; animation:bseas-shake 0.5s ease; }
        .bseas-api-warning-icon { font-size:18px; }
        .bseas-api-warning-text { flex:1; font-size:13px; color:var(--bseas-warning-text); font-weight:600; }
        .bseas-api-warning-btn { background:var(--bseas-warning); color:white; border:none; border-radius:var(--bseas-radius-sm); padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .bseas-api-warning-btn:hover { background:#e0a800; transform:translateY(-1px); }
        .bseas-api-warning-btn:active { transform:translateY(0); }
        .bseas-source-section { border-bottom:1px solid var(--bseas-border); flex-shrink:0; }
        .bseas-sticky-top { position:sticky; top:0; z-index:20; flex-shrink:0; margin:0 -22px; background:rgba(255,255,255,0.6); backdrop-filter:blur(24px) saturate(180%); -webkit-backdrop-filter:blur(24px) saturate(180%); border-bottom:1px solid var(--bseas-border); }
        .bseas-source-header { display:flex; align-items:center; justify-content:space-between; padding:7px 22px; cursor:pointer; user-select:none; transition:background 0.2s; }
        .bseas-source-header:hover { background:rgba(0,0,0,0.02); }
        .bseas-source-label { font-size:13px; font-weight:600; color:var(--bseas-text-dim); }
        .bseas-source-arrow { width:20px; height:20px; display:flex; align-items:center; justify-content:center; transition:transform 0.3s cubic-bezier(0.4,0,0.2,1); color:var(--bseas-text-dim); }
        .bseas-source-arrow svg { width:16px; height:16px; fill:currentColor; }
        .bseas-source-arrow.collapsed { transform:rotate(-90deg); }
        .bseas-collapse { display:grid; grid-template-rows:0fr; transition:grid-template-rows 0.3s var(--ease-out); }
        .bseas-collapse > .bseas-collapse-inner { overflow:hidden; min-height:0; }
        .bseas-collapse.open { grid-template-rows:1fr; }
        .bseas-source-body { padding:4px 22px 14px; display:flex; flex-wrap:wrap; gap:8px; }
        .bseas-source-body.hidden { display:none; }
        .bseas-subtitle-option { padding:6px 14px; background:white; border:1px solid var(--bseas-border); border-radius:20px; color:var(--bseas-text); font-size:13px; font-weight:500; cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); display:flex; align-items:center; gap:6px; position:relative; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.04); }
        .bseas-subtitle-del { display:flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:50%; color:#ef4444; opacity:0.4; transition:all 0.2s; cursor:pointer; margin-left:auto; }
        .bseas-subtitle-del:hover { opacity:1; background:rgba(239,68,68,0.12); }
        .bseas-subtitle-option::before { content:''; position:absolute; top:0; left:0; width:0; height:100%; background:var(--bseas-primary); opacity:0.08; transition:width 0.3s ease; }
        .bseas-subtitle-option:hover { border-color:var(--bseas-primary); transform:translateY(-2px); box-shadow:0 4px 14px rgba(0,174,236,0.15); }
        .bseas-subtitle-option:hover::before { width:100%; }
        .bseas-subtitle-option:active { transform:translateY(0); }
        .bseas-subtitle-option.active { background:var(--bseas-primary); border-color:var(--bseas-primary); color:white; transform:scale(1.02); box-shadow:0 4px 12px rgba(0,174,236,0.25); }
        .bseas-subtitle-option.active::before { display:none; }
        .bseas-tag { font-size:10px; font-weight:700; padding:2px 6px; border-radius:6px; transition:all 0.2s; display:inline-flex; align-items:center; }
        .bseas-tag-check { position:relative; top:-1px; }
        .bseas-subtitle-option:not(.active) .bseas-tag.ai { background:rgba(0,174,236,0.1); color:var(--bseas-primary); }
        .bseas-subtitle-option:not(.active) .bseas-tag.cc { background:rgba(16,185,129,0.1); color:#10b981; }
        .bseas-subtitle-option.active .bseas-tag { background:rgba(255,255,255,0.2); color:white; }
        .bseas-subtitle-option.active .bseas-subtitle-del { color:#fff; opacity:0.65; }
        .bseas-subtitle-option.active .bseas-subtitle-del:hover { opacity:1; background:rgba(255,255,255,0.18); }
        .bseas-tabs { display:flex; margin:11px 22px 11px; gap:4px; flex-shrink:0; }
        .bseas-tabs.hidden { display:none; }
        .bseas-tab { flex:1; padding:8px 0; border:none; background:transparent; color:var(--bseas-text-dim); font-size:13.5px; font-weight:600; cursor:pointer; border-radius:var(--bseas-radius-sm); transition:all 0.25s cubic-bezier(0.4,0,0.2,1); text-align:center; position:relative; overflow:hidden; }
        .bseas-tab::before { content:''; position:absolute; bottom:0; left:50%; width:0; height:2px; background:var(--bseas-primary); transition:all 0.3s ease; transform:translateX(-50%); }
        .bseas-tab:hover:not(.active) { color:var(--bseas-text); background:rgba(255,255,255,0.5); }
        .bseas-tab:hover:not(.active)::before { width:60%; }
        .bseas-tab.active { background:white; color:var(--bseas-primary); box-shadow:0 2px 8px rgba(0,0,0,0.06); transform:translateY(-1px); }
        .bseas-tab.active::before { width:80%; }
        .bseas-content { flex:1; min-height:0; overflow-y:auto; scrollbar-gutter:stable; padding:0 22px 0; overscroll-behavior:contain; -webkit-overscroll-behavior:contain; display:flex; flex-direction:column; position:relative; z-index:0; }
        .bseas-tab-body.anim-right { animation:bseas-tab-in-right 0.3s var(--ease-out); }
        .bseas-tab-body.anim-left { animation:bseas-tab-in-left 0.3s var(--ease-out); }
        .bseas-settings-page { animation:bseas-tab-in-right 0.3s var(--ease-out); }
        .bseas-settings-page.back { animation-name:bseas-tab-in-left; }
        #bseas-settings-main.bseas-main-anim { animation:bseas-tab-in-left 0.3s var(--ease-out); }
        .bseas-settings-link-entry { display:flex; align-items:center; justify-content:space-between; padding:13px 16px; background:transparent; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-md); cursor:pointer; transition:all 0.2s; margin:4px 0 0; }
        .bseas-settings-link-entry:hover { background:rgba(120,120,128,0.06); border-color:rgba(120,120,128,0.2); }
        .bseas-settings-link-entry-label { font-size:13.5px; font-weight:500; color:var(--bseas-text); display:flex; align-items:center; gap:8px; }
        .bseas-settings-link-entry-arrow { color:var(--bseas-text-dim); transition:transform 0.25s var(--ease-out); }
        .bseas-settings-link-entry:hover .bseas-settings-link-entry-arrow { transform:translateX(3px); }
        .bseas-settings-back { display:flex; align-items:center; gap:6px; margin:0 0 12px; padding:8px 12px; background:rgba(120,120,128,0.06); border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-sm); cursor:pointer; font-size:13px; font-weight:500; color:var(--bseas-text-dim); transition:all 0.2s; align-self:flex-start; }
        .bseas-settings-back:hover { color:var(--bseas-text); background:rgba(120,120,128,0.1); }
        .bseas-settings-back svg { width:16px; height:16px; fill:currentColor; }
        .bseas-content::-webkit-scrollbar { width:6px; }
        .bseas-content::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; transition:background 0.2s; }
        .bseas-content::-webkit-scrollbar-thumb:hover { background:#94a3b8; }
        .bseas-tab-body { flex:1; min-height:0; display:flex; flex-direction:column; padding-top:14px; }
        .bseas-tab-body::after { content:""; display:block; flex-shrink:0; height:var(--bseas-footer-h, 96px); }
        .bseas-checkbox-label { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; color:var(--bseas-text); cursor:pointer; user-select:none; transition:color 0.2s; }
        .bseas-checkbox-label:hover { color:var(--bseas-primary); }
        .bseas-checkbox-label input[type="checkbox"] { appearance:none; -webkit-appearance:none; width:20px; height:20px; border:1.5px solid #cbd5e1; border-radius:6px; cursor:pointer; margin:0; flex-shrink:0; transition:border-color 0.2s var(--ease-out), background-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out); position:relative; background:#fff; outline:none; }
        .bseas-checkbox-label input[type="checkbox"]:hover { border-color:var(--bseas-primary); box-shadow:0 0 0 3px rgba(0,174,236,0.12); }
        .bseas-checkbox-label input[type="checkbox"]:checked { background:var(--bseas-primary); border-color:var(--bseas-primary); background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23ffffff' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6L9 17l-5-5'/%3E%3C/svg%3E"); background-repeat:no-repeat; background-position:center; background-size:13px 13px; }
        .bseas-text-controls { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; padding:10px 14px; background:white; border-radius:var(--bseas-radius-sm); border:1px solid var(--bseas-border); transition:box-shadow 0.2s; }
        .bseas-text-controls:hover { box-shadow:0 2px 8px rgba(0,0,0,0.04); }
        .bseas-text-area { width:100%; flex:1; min-height:200px; background:white; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-md); padding:16px; color:var(--bseas-text); font-size:14px; line-height:1.7; resize:none; box-sizing:border-box; transition:all 0.2s; }
        .bseas-text-area:focus { outline:none; border-color:var(--bseas-primary); box-shadow:0 0 0 3px rgba(0,174,236,0.1); transform:translateY(-1px); }
        .bseas-loading, .bseas-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; color:var(--bseas-text-dim); font-size:15px; font-weight:500; gap:16px; animation:bseas-slideup 0.3s ease; }
        .bseas-spinner { width:32px; height:32px; border:3px solid rgba(0,174,236,0.15); border-top-color:var(--bseas-primary); border-radius:50%; animation:bseas-spin 0.8s linear infinite; }
        .bseas-search-box { position:relative; margin-bottom:14px; }
        .bseas-search-input { width:100%; padding:10px 32px 10px 36px; background:white; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-sm); font-size:14px; color:var(--bseas-text); box-sizing:border-box; transition:all 0.2s; }
        .bseas-search-input:focus { outline:none; border-color:var(--bseas-primary); box-shadow:0 0 0 3px rgba(0,174,236,0.1); }
        .bseas-search-count { position:absolute; right:34px; top:50%; transform:translateY(-50%); font-size:12px; color:var(--bseas-text-muted); pointer-events:none; }
        .bseas-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px; }
        .bseas-stat-item { background:white; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-md); padding:14px 8px; text-align:center; transition:all 0.2s; min-width:0; overflow:hidden; }
        .bseas-stat-item:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,0.06); }
        .bseas-stat-label { font-size:12px; font-weight:600; color:var(--bseas-text-dim); margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .bseas-stat-value { font-size:20px; font-weight:800; color:var(--bseas-text); transition:color 0.2s; }
        .bseas-stat-item.bseas-stat-compact { padding:14px 2px; }
        .bseas-stat-item.bseas-stat-compact .bseas-stat-label { overflow:hidden; text-overflow:clip; white-space:nowrap; }
        .bseas-stat-item:hover .bseas-stat-value { color:var(--bseas-primary); }
        .bseas-subtitle-item { padding:14px 16px; margin-bottom:10px; background:white; border-radius:var(--bseas-radius-md); border:1px solid var(--bseas-border); cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); display:flex; flex-direction:column; gap:6px; position:relative; overflow:hidden; }
        .bseas-subtitle-item::before { content:''; position:absolute; left:0; top:0; width:3px; height:0; background:var(--bseas-primary); transition:height 0.3s ease; }
        .bseas-subtitle-item:hover { border-color:#cbd5e1; box-shadow:0 4px 12px rgba(0,0,0,0.04); transform:translateY(-1px); }
        .bseas-subtitle-item:hover::before { height:100%; }
        .bseas-subtitle-item:active { transform:translateY(0); }
        .bseas-ts { font-size:12px; color:var(--bseas-primary); font-family:monospace; font-weight:700; background:rgba(0,174,236,0.06); align-self:flex-start; padding:2px 6px; border-radius:4px; transition:all 0.2s; }
        .bseas-subtitle-item:hover .bseas-ts { background:var(--bseas-primary); color:white; }
        .bseas-st { font-size:14.5px; color:var(--bseas-text); line-height:1.6; }
        .bseas-st mark { background:rgba(255,235,59,0.5); color:inherit; border-radius:2px; padding:0; margin:0; }
        .bseas-ai-big-btn { width:100%; padding:14px; background:var(--bseas-primary); color:white; border:none; border-radius:var(--bseas-radius-md); font-size:15px; font-weight:600; cursor:pointer; margin-bottom:16px; display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); box-shadow:0 4px 16px rgba(0,174,236,0.25); position:relative; overflow:hidden; }
        .bseas-ai-big-btn::before { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.2),transparent); transition:left 0.5s ease; }
        .bseas-ai-big-btn:hover:not(:disabled) { background:var(--bseas-primary-hover); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,174,236,0.35); }
        .bseas-ai-big-btn:hover:not(:disabled)::before { left:100%; }
        .bseas-ai-big-btn:active:not(:disabled) { transform:translateY(0); }
        .bseas-ai-big-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .bseas-retry-btn { position:absolute; top:16px; right:16px; width:32px; height:32px; background:#f1f5f9; border:none; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--bseas-text-dim); z-index:10; transition:background 0.2s,color 0.2s; }
        .bseas-retry-btn:hover { background:var(--bseas-primary); color:white; }
        .bseas-retry-btn svg { width:16px; height:16px; fill:currentColor; transition:transform 0.4s ease; }
        .bseas-retry-btn:hover svg { transform:rotate(180deg) scale(1.1); }
        .bseas-ai-result { background:white; border-radius:var(--bseas-radius-md); padding:24px; margin-bottom:16px; border:1px solid var(--bseas-border); color:var(--bseas-text); line-height:1.8; font-size:15px; transition:box-shadow 0.2s; }
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
        .bseas-sp-box { border-radius:var(--bseas-radius-md); padding:16px 20px; margin-bottom:16px; display:flex; flex-direction:column; gap:10px; }
        .bseas-sp-box.status-found { background:linear-gradient(135deg,#fffef7 0%,#fffbeb 100%); border:1px solid var(--bseas-ad-border); box-shadow:0 4px 12px rgba(245,158,11,0.08); }
        .status-found .bseas-sp-header { flex-wrap:nowrap; gap:10px; }
        .status-found .bseas-sp-title { color:var(--bseas-ad-text); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .status-found .bseas-sp-cancel { background:#ffffff; color:var(--bseas-ad-text); border:1px solid var(--bseas-ad-border); border-radius:10px; padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); flex-shrink:0; white-space:nowrap; }
        .status-found .bseas-sp-cancel:hover { background:#fef3c7; transform:translateY(-1px); }
        .status-found .bseas-sp-cancel:active { transform:translateY(0) scale(0.98); }
        .status-found .bseas-sp-skip { background:var(--bseas-ad-button); color:white; border:none; border-radius:10px; padding:6px 14px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); box-shadow:0 2px 8px rgba(245,158,11,0.3); flex-shrink:0; white-space:nowrap; }
        .status-found .bseas-sp-skip:hover { background:var(--bseas-ad-button-hover); transform:translateY(-1px); box-shadow:0 4px 12px rgba(245,158,11,0.4); }
        .status-found .bseas-sp-skip:active { transform:translateY(0) scale(0.98); }
        .bseas-sp-box.status-none { background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%); border:1px solid #22c55e; box-shadow:0 4px 12px rgba(34,197,94,0.1); box-sizing:border-box; min-height:64px; justify-content:center; }
        .bseas-sp-box.status-err { background:linear-gradient(135deg,#fef2f2 0%,#fee2e2 100%); border:1px solid #ef4444; box-shadow:0 4px 12px rgba(239,68,68,0.1); }
        .bseas-sp-header { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .bseas-sp-icon { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:bold; flex-shrink:0; }
        .status-none .bseas-sp-icon { background:#22c55e; color:white; box-shadow:0 2px 8px rgba(34,197,94,0.3); }
        .status-err .bseas-sp-icon { background:#ef4444; color:white; box-shadow:0 2px 8px rgba(239,68,68,0.3); }
        .bseas-sp-title { font-size:14px; font-weight:700; flex:1; }
        .status-none .bseas-sp-title { color:#166534; }
        .status-err .bseas-sp-title { color:#991b1b; }
        .bseas-sp-badge { background:white; border:1px solid var(--bseas-ad-border); border-radius:10px; padding:6px 12px; font-family:monospace; font-size:13px; font-weight:700; color:#000000; box-shadow:none; }
        .bseas-sp-action-row { display:flex; align-items:center; gap:10px; margin-left:34px; }
        .bseas-sp-action-row .bseas-sp-badge { flex:1; }
        .bseas-sp-skip { background:var(--bseas-ad-button); color:white; border:none; border-radius:10px; padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); box-shadow:0 2px 8px rgba(245,158,11,0.3); flex-shrink:0; }
        .bseas-sp-skip:hover { background:var(--bseas-ad-button-hover); transform:translateY(-2px) scale(1.02); box-shadow:0 4px 12px rgba(245,158,11,0.4); }
        .bseas-sp-skip:active { transform:translateY(0) scale(0.98); }
        .bseas-sp-hint { font-size:12px; color:#000000; margin-left:34px; }
        .bseas-followup-section { margin-top:24px; background:white; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-md); padding:16px; transition:box-shadow 0.2s; }
        .bseas-followup-section:hover { box-shadow:0 4px 12px rgba(0,0,0,0.04); }
        .bseas-followup-label { font-size:13px; font-weight:700; color:var(--bseas-primary); margin-bottom:10px; display:flex; align-items:center; gap:6px; }
        .bseas-followup-input { width:100%; background:#f8fafc; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-sm); padding:12px 14px; color:var(--bseas-text); font-size:14px; margin-bottom:12px; resize:none; height:72px; box-sizing:border-box; transition:all 0.2s; }
        .bseas-followup-input:focus { outline:none; border-color:var(--bseas-primary); background:white; transform:translateY(-1px); box-shadow:0 0 0 3px rgba(0,174,236,0.1); }
        .bseas-followup-btn { width:100%; padding:12px; background:var(--bseas-primary); color:white; border:none; border-radius:var(--bseas-radius-sm); font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .bseas-followup-btn:hover:not(:disabled) { background:var(--bseas-primary-hover); transform:translateY(-1px); }
        .bseas-followup-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .bseas-qa-item { margin-top:16px; padding-top:16px; border-top:1px solid var(--bseas-border); }
        .bseas-qa-q { font-size:14px; font-weight:700; color:var(--bseas-text); margin-bottom:10px; background:#f1f5f9; padding:10px 14px; border-radius:var(--bseas-radius-sm); transition:background 0.2s; display:flex; align-items:flex-start; gap:6px; line-height:1.5; }
        .bseas-qa-q:hover { background:#e2e8f0; }
        .bseas-qa-icon { color:var(--bseas-primary); flex-shrink:0; margin-top:3px; }
        .bseas-qa-a { background:white; border:1px solid var(--bseas-border); border-radius:var(--bseas-radius-md); padding:16px 18px; font-size:14.5px; color:var(--bseas-text); line-height:1.7; transition:box-shadow 0.2s; }
        .bseas-qa-a:hover { box-shadow:0 4px 12px rgba(0,0,0,0.04); }
        .bseas-noapi-box { background:var(--bseas-warning-bg); border:1px solid var(--bseas-warning-border); border-radius:var(--bseas-radius-md); padding:16px; margin-bottom:16px; }
        .bseas-noapi-title { font-size:14px; font-weight:700; color:var(--bseas-warning-text); margin-bottom:8px; display:flex; align-items:center; gap:6px; }
        .bseas-noapi-desc { font-size:13px; color:var(--bseas-warning-text); line-height:1.6; margin-bottom:12px; }
        .bseas-settings { padding:8px 0 4px; }
        .bseas-settings-section { margin-bottom:28px; }
        .bseas-settings-section:last-child { margin-bottom:8px; }
        .bseas-settings-section-title { font-size:13px; font-weight:600; color: var(--bseas-text-dim); text-transform: uppercase; letter-spacing: 0.4px; margin: 0 4px 8px 4px; padding-left: 4px; }
        .bseas-settings-card { background: rgba(255,255,255,0.85); border: 1px solid var(--bseas-border); border-radius: var(--bseas-radius-md); overflow: hidden; }
        .bseas-settings-row { padding: 12px 14px; border-bottom: 0.5px solid var(--bseas-border); transition: background 0.2s; }
        .bseas-settings-row:last-child { border-bottom: none; }
        .bseas-settings-row:hover { background: rgba(120,120,128,0.04); }
        .bseas-settings-row.inline { display: flex; align-items: center; gap: 12px; }
        .bseas-settings-row:has(.bseas-settings-row-action:has(.bseas-toggle)) { display: flex; align-items: center; gap: 12px; }
        .bseas-settings-row-content { flex: 1; min-width: 0; }
        .bseas-settings-row-label { font-size:13.5px; font-weight:500; color: var(--bseas-text); margin-bottom:3px; letter-spacing:-0.1px; }
        .bseas-settings-row-desc { font-size:12px; color: var(--bseas-text-muted); line-height:1.45; }
        .bseas-settings-row-action { flex-shrink: 0; }
        .bseas-settings-row-action select,
        .bseas-settings-row-action input { min-width: 120px; max-width: 160px; }
        .bseas-settings-stack-label { display:block; font-size:13.5px; font-weight:500; color: var(--bseas-text); margin-bottom:6px; letter-spacing:-0.1px; }
        .bseas-settings-hint { font-size:11.5px; color: var(--bseas-text-muted); margin-top:6px; line-height:1.45; }
        .bseas-settings-input {
            width:100%; padding:10px 12px;
            background: rgba(120,120,128,0.06);
            border: 1px solid var(--bseas-border); border-radius: var(--bseas-radius-sm);
            font-size:13.5px; color: var(--bseas-text);
            box-sizing: border-box; transition: border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out), background-color 0.2s var(--ease-out);
        }
        .bseas-settings-input:focus { outline: none; border-color: var(--bseas-primary); background: white; box-shadow: 0 0 0 3px rgba(0,174,236,0.12); }
        input[type=number].bseas-settings-input::-webkit-inner-spin-button,
        input[type=number].bseas-settings-input::-webkit-outer-spin-button { opacity:0; }
        input[type=number].bseas-settings-input:focus::-webkit-inner-spin-button,
        input[type=number].bseas-settings-input:focus::-webkit-outer-spin-button { opacity:1; }
        select.bseas-settings-input { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='%238e8e93'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 30px; cursor: pointer; }
        .bseas-settings-link-row { display:flex; align-items:center; justify-content:space-between; padding: 10px 14px; }
        .bseas-settings-link-row a { font-size:12px; color: var(--bseas-primary); text-decoration: none; font-weight:500; }
        .bseas-settings-link-row a:hover { text-decoration: underline; }

        .bseas-toggle { position: relative; display: inline-block; width: 44px; height: 28px; flex-shrink: 0; vertical-align: middle; }
        .bseas-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
        .bseas-toggle-slider { position: absolute; inset: 0; background: rgba(120,120,128,0.22); border-radius: 999px; cursor: pointer; transition: background 0.35s var(--ease-out); }
        .bseas-toggle-slider::before { content: ''; position: absolute; width: 24px; height: 24px; left: 2px; top: 2px; background: white; border-radius: 50%; box-shadow: 0 3px 6px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.04); transition: transform 0.45s var(--ease-spring), width 0.2s var(--ease-spring); }
        .bseas-toggle:hover .bseas-toggle-slider::before { width: 26px; }
        .bseas-toggle input:checked + .bseas-toggle-slider { background: #34c759; }
        .bseas-toggle input:checked + .bseas-toggle-slider::before { transform: translateX(16px); }
        .bseas-toggle:hover input:checked + .bseas-toggle-slider::before { transform: translateX(14px); }
        .bseas-toggle:active .bseas-toggle-slider::before { width: 26px; }
        .bseas-toggle:active input:checked + .bseas-toggle-slider::before { transform: translateX(14px); }
        .bseas-toggle input:disabled + .bseas-toggle-slider { opacity: 0.45; cursor: default; }
        .bseas-settings-row-action .bseas-toggle { }

        .bseas-password-mask { -webkit-text-security:disc; }
        .bseas-danger-link { display:inline-block; color: var(--bseas-danger); font-size:12.5px; text-decoration:none; cursor:pointer; transition: text-decoration 0.2s; }
        .bseas-danger-link:hover { text-decoration: underline; }
        #bseas-clear-cache { color: #d97706; }
        #bseas-storage-usage.warn { color: #d97706; font-weight:600; }

        .bseas-author-info { margin-top:20px; padding-top:18px; border-top: 0.5px solid var(--bseas-border); text-align:center; }
        .bseas-author-text { font-size:12px; color: var(--bseas-text-muted); }
        .bseas-author-link { color: var(--bseas-primary); text-decoration:none; font-weight:500; transition: color 0.2s; }
        .bseas-author-link:hover { color: var(--bseas-primary-hover); text-decoration: underline; }
        .bseas-footer {
            padding:14px 22px 18px;
            background: rgba(255,255,255,0.72);
            backdrop-filter: blur(24px) saturate(180%);
            -webkit-backdrop-filter: blur(24px) saturate(180%);
            border-top: 0.5px solid var(--bseas-border);
            display:flex; gap:10px; flex-direction:column;
            position:absolute; left:0; right:0; bottom:0; z-index:6;
        }
        .bseas-btn { flex:1; min-width:0; padding:12px 8px; border:0.5px solid var(--bseas-border); border-radius:var(--bseas-radius-md); font-size:13.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; white-space:nowrap; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; backdrop-filter:blur(8px) saturate(140%); -webkit-backdrop-filter:blur(8px) saturate(140%); }
        .bseas-btn svg { width:15px; height:15px; fill:currentColor; flex-shrink:0; }
        #bseas-play-btn svg { width:12px; height:12px; transform:translateX(1px); }
        .bseas-btn::before { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent); transition:left 0.5s ease; }
        .bseas-btn:hover:not(:disabled)::before { left:100%; }
        .bseas-btn-primary { background:rgba(0,174,236,0.88); color:white; }
        .bseas-btn-primary:hover:not(:disabled) { background:var(--bseas-primary-hover); transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,174,236,0.2); }
        .bseas-btn-primary:active:not(:disabled) { transform:translateY(0); }
        .bseas-btn-primary:disabled { opacity:0.5; cursor:not-allowed; }
        .bseas-btn-secondary { background:rgba(255,255,255,0.78); color:var(--bseas-text); }
        .bseas-btn-secondary:hover:not(:disabled) { background:rgba(248,250,252,0.9); border-color:#cbd5e1; transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.04); }
        .bseas-btn-secondary:active:not(:disabled) { transform:translateY(0); }
        .bseas-btn-secondary:disabled { opacity:0.5; cursor:not-allowed; }
        .bseas-toast { position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(16px) scale(0.95); background:rgba(15,23,42,0.68); backdrop-filter:blur(8px) saturate(140%); -webkit-backdrop-filter:blur(8px) saturate(140%); color:white; padding:12px 24px; border-radius:12px; font-size:14px; font-weight:500; opacity:0; transition:opacity 0.25s ease,transform 0.25s cubic-bezier(0.16,1,0.3,1); z-index:100001; pointer-events:none; white-space:nowrap; max-width:80vw; border:1px solid rgba(255,255,255,0.1); box-shadow:0 8px 32px rgba(0,0,0,0.12); }
        .bseas-toast.show { opacity:1; transform:translateX(-50%) translateY(0) scale(1); }
        .bseas-toast.success { background:rgba(16,185,129,0.68); }
        .bseas-toast.error { background:rgba(239,68,68,0.68); }
        .bseas-toast.warning { background:rgba(255,193,7,0.68); }
        .bseas-toast.with-action { pointer-events:auto; white-space:normal; display:flex; align-items:center; gap:14px; }
        .bseas-toast-msg { white-space:nowrap; }
        .bseas-toast-action { color:#ffffff; cursor:pointer; text-decoration:underline; font-weight:600; white-space:nowrap; }
        .bseas-toast-action:hover { color:#f1f5f9; }
        .bseas-settings-input:disabled,
        .bseas-settings-row.disabled-setting {
            opacity: 0.45;
            filter: grayscale(60%);
            background-color: #f1f5f9;
            cursor: not-allowed;
        }
        .bseas-disclaimer-link { display:inline-block; color: var(--bseas-primary); font-size:12.5px; text-decoration:none; cursor:pointer; transition: color 0.2s; }
        .bseas-disclaimer-link:hover { color: var(--bseas-primary-hover); text-decoration: underline; }
        .bseas-disclaimer-card { display:flex; align-items:center; justify-content:space-between; margin-top:12px; padding:11px 14px; border:0.5px solid var(--bseas-border); border-radius:var(--bseas-radius-md); background:var(--bseas-bg-card); text-decoration:none; transition:all 0.2s; }
        .bseas-disclaimer-card:hover { border-color:var(--bseas-primary); background:white; }
        .bseas-dc-left { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:500; color:var(--bseas-text); }
        .bseas-dc-left svg { color:var(--bseas-primary); }
        .bseas-dc-arrow { color:var(--bseas-text-dim); transition:all 0.2s; }
        .bseas-disclaimer-card:hover .bseas-dc-arrow { color:var(--bseas-primary); transform:translateX(2px); }
    `);

    // ===================== 6. 全局状态 =====================
    let allSubtitles = [];
    let currentSubtitleData = null;
    let selectedSubtitleId = null;
    let panelVisible = false;
    let currentTab = 'preview';
    let isLoading = false;
    let textShowTimestamps = GM_getValue('bseas_text_show_timestamps', true);
    let downloadShowTimestamps = GM_getValue('bseas_download_show_timestamps', true);
    (function migrateOldTimestampKey() {
        const oldVal = GM_getValue('bseas_show_timestamps', undefined);
        if (oldVal !== undefined) {
            GM_setValue('bseas_text_show_timestamps', oldVal);
            GM_setValue('bseas_download_show_timestamps', oldVal);
            GM_deleteValue('bseas_show_timestamps');
            textShowTimestamps = oldVal;
            downloadShowTimestamps = oldVal;
        }
    })();
    let showPreviewCharsWithTs = false;
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
    let currentStreamText = '';
    let currentFollowupQ = null;
    let currentFollowupText = '';
    let progressMarkInitialized = false;
    let lastAdCheckResult = null;
    let adDetectionNotified = false;
    let latestVersion = null;
    let hasUpdate = false;
    let updateLinkUrl = null;
    let currentAbortController = null;
    let currentGMXHR = null;
    let subtitleSearchKeyword = '';
    let expandedSearch = false;
    let currentPreviewLimit = 0;
    let _documentClickHandler = null;
    let _resizeDocHandlers = null;
    let _dragDocHandlers = [];

    // ===================== 7. 日志工具 =====================
    function log(...args) { console.log('[BSEAS]', ...args); }

    // ===================== 8. 储存管理 =====================
    function loadCache() {
        const raw = GM_getValue('aiSummaryCache', {});
        const result = {};
        for (const key of Object.keys(raw)) {
            const val = raw[key];
            if (typeof val === 'string') result[key] = { prompt: '', summary: val, qa: [], ts: 0 };
            else if (val && typeof val === 'object' && typeof val.summary === 'string') {
                result[key] = { prompt: typeof val.prompt === 'string' ? val.prompt : '', summary: val.summary, qa: Array.isArray(val.qa) ? val.qa : [], ts: typeof val.ts === 'number' ? val.ts : 0 };
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
        aiSummaryCache[videoKey] = { prompt, summary, qa, ts: Date.now() };
        GM_setValue('aiSummaryCache', aiSummaryCache);
    }
    function overwriteCachedAdAsNone(videoKey) {
        const entry = aiSummaryCache[videoKey];
        if (!entry) return;
        const summary = typeof entry === 'string' ? entry : entry.summary;
        if (!summary) return;
        const idx = summary.lastIndexOf('广告时间');
        const newSummary = idx !== -1 ? (summary.slice(0, idx) + '广告时间[无]（已取消）') : (summary.trimEnd() + '\n\n广告时间[无]（已取消）');
        if (typeof entry === 'string') {
            aiSummaryCache[videoKey] = newSummary;
        } else {
            entry.summary = newSummary;
            entry.ts = Date.now();
        }
        GM_setValue('aiSummaryCache', aiSummaryCache);
    }
    function appendCachedQA(videoKey, q, a) {
        const entry = aiSummaryCache[videoKey];
        if (!entry) return;
        if (!Array.isArray(entry.qa)) entry.qa = [];
        entry.qa.push({ q, a });
        entry.ts = Date.now();
        GM_setValue('aiSummaryCache', aiSummaryCache);
    }

    // ===================== 9. 通用工具 =====================
    function formatTime(s) { const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2,'0')}`; }
    function formatTimeWithMs(s) { const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 100); return `${m}:${sec.toString().padStart(2,'0')}.${ms.toString().padStart(2,'0')}`; }
    function formatTimeForSRT(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 1000); return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`; }
    function parseTimeInput(str) {
        if (str == null) return null;
        str = String(str).trim();
        if (str === '') return null;
        if (/^\d+(\.\d+)?$/.test(str)) return Math.max(0, parseFloat(str));
        let m = str.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
        if (m) {
            const min = parseInt(m[1], 10), sec = parseInt(m[2], 10);
            const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
            return Math.max(0, min * 60 + sec + ms / 1000);
        }
        m = str.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?$/);
        if (m) {
            const h = parseInt(m[1], 10), min = parseInt(m[2], 10), sec = parseInt(m[3], 10);
            const ms = m[4] ? parseInt(m[4].padEnd(3, '0'), 10) : 0;
            return Math.max(0, h * 3600 + min * 60 + sec + ms / 1000);
        }
        return null;
    }
    function parseSRT(text) {
        if (!text || typeof text !== 'string') return [];
        const blocks = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split(/\n\s*\n/);
        const result = [];
        for (const block of blocks) {
            const lines = block.split('\n').filter(l => l.trim() !== '');
            if (lines.length < 2) continue;
            const timeLine = lines.find(l => l.includes('-->'));
            if (!timeLine) continue;
            const m = timeLine.match(/(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})/);
            if (!m) continue;
            const parseSRTTime = (t) => {
                const p = t.replace(',', '.').split(':');
                if (p.length === 3) return Number(p[0]) * 3600 + Number(p[1]) * 60 + Number(p[2]);
                return Number(p[0]) * 60 + Number(p[1]);
            };
            const from = parseSRTTime(m[1]);
            const to = parseSRTTime(m[2]);
            const contentStartIdx = lines.indexOf(timeLine) + 1;
            const content = lines.slice(contentStartIdx).join('\n').trim();
            if (content) result.push({ from, to, content });
        }
        return result;
    }
    function buildSRTFromBody(body) {
        if (!Array.isArray(body)) return '';
        return body.map((it, index) => `${index + 1}\n${formatTimeForSRT(it.from)} --> ${formatTimeForSRT(it.to)}\n${it.content || ''}\n`).join('\n');
    }
    function parseAdTime(str) { str = str.trim(); const m = str.match(/^(\d+):(\d{2})$/); return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : null; }
    function formatCommentsForAI() { return hotComments.length ? hotComments.map(c => `“${c.content.length > 200 ? c.content.slice(0,200) + '...' : c.content}” 赞数:${c.like}`).join('\n') : ''; }
    function showToast(msg, type = '', action) {
        let el = document.querySelector('.bseas-toast');
        if (!el) { el = document.createElement('div'); el.className = 'bseas-toast'; document.body.appendChild(el); }
        el.className = 'bseas-toast' + (type ? ' ' + type : '');
        if (action && action.text && typeof action.onClick === 'function') {
            safeSetInnerHTML(el, `<span class="bseas-toast-msg"></span><a class="bseas-toast-action" href="javascript:void(0);">${escapeHtml(action.text)}</a>`);
            el.querySelector('.bseas-toast-msg').textContent = msg;
            const link = el.querySelector('.bseas-toast-action');
            link.onclick = (e) => { e.stopPropagation(); el.classList.remove('show'); action.onClick(); };
            el.classList.add('with-action');
        } else {
            el.textContent = msg;
            el.classList.remove('with-action');
        }
        void el.offsetWidth;
        el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.classList.remove('show'); el.classList.remove('with-action'); }, action && action.duration ? action.duration : 2500);
    }
    function seekToTime(sec) {
        const v = document.querySelector('video');
        if (!v) return;
        const prev = v.currentTime;
        v.currentTime = sec;
        showToast(`跳转到 ${formatTime(sec)}`, 'success', { text: '撤销', duration: 6000, onClick: () => { v.currentTime = prev; showToast(`已返回 ${formatTime(prev)}`, 'success'); } });
    }
    function setLoadingState(loading) { isLoading = loading; document.querySelector('#bseas-refresh-btn')?.classList.toggle('spinning', loading); }
    function getVideoTitle() { const h1 = document.querySelector('h1.video-title'); if (!h1) return ''; return h1.dataset.title || h1.getAttribute('title') || h1.textContent.trim(); }
    function getVideoDescription() { const el = document.querySelector('.desc-info-text'); return el ? el.textContent.trim() : ''; }
    function getVideoTags() { const els = document.querySelectorAll('.video-tag-container .tag-link'); const tags = []; els.forEach(t => { const nameEl = t.querySelector('.tag-name'); const name = nameEl ? nameEl.textContent.trim() : t.textContent.trim(); if (name) tags.push(name); }); return tags; }
    function getUpName() {
        const el = document.querySelector('.up-name');
        if (el) return el.textContent.trim();
        return '';
    }
    function getVideoPartNumber() {
        const url = window.location.href;
        const match = url.match(/[?&]p=(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }
    function getCurrentSubtitleLanguage() {
        return currentSubtitleData?.lan_doc || '';
    }
    function sanitizeFilename(name) { return (name || 'subtitle').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 100); }
    function compareVersions(v1, v2) {
        const toNum = s => { const n = parseInt(s, 10); return isNaN(n) ? 0 : n; };
        const p1 = v1.split('.').map(toNum), p2 = v2.split('.').map(toNum);
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const a = p1[i] || 0, b = p2[i] || 0;
            if (a > b) return 1; if (a < b) return -1;
        }
        return 0;
    }
    function versionDiffMeetsThreshold(latest, current) {
        const toNum = s => { const n = parseInt(s, 10); return isNaN(n) ? 0 : n; };
        const p1 = String(latest).split('.').map(toNum);
        const p2 = String(current).split('.').map(toNum);
        const major = (p1[0] || 0) - (p2[0] || 0);
        const minor = (p1[1] || 0) - (p2[1] || 0);
        const patch = (p1[2] || 0) - (p2[2] || 0);
        if (major !== 0 || minor !== 0) return true;
        return patch > 1;
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
            if (bseas_update_mode === 'reduced' && shouldShowUpdateReminder(bseas_update_mode, bseas_update_last_prompt_ts, Date.now(), latestVersion, SCRIPT_VERSION, 'panel')) {
                bseas_update_last_prompt_ts = Date.now();
                GM_setValue('bseas_update_last_prompt_ts', bseas_update_last_prompt_ts);
            }
            showUpdateBadgeInPanel();
        } else { log(`当前已是最新版本(${chosen.source}):`, SCRIPT_VERSION); }
    }
    const UPDATE_REMINDER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
    function shouldShowUpdateReminder(mode, lastPromptTs, now, latest, current, scope) {
        if (mode === 'disabled') return false;
        if (scope === 'settings') return true;
        if (mode === 'always') return true;
        if (!versionDiffMeetsThreshold(latest, current)) return false;
        return (now - (lastPromptTs || 0)) >= UPDATE_REMINDER_COOLDOWN_MS;
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
                if (response.status === 200) { const m = response.responseText.match(/##\s*\[([^\]]+)\]/); if (m && m[1] && /^\d+\.\d+\.\d+[-\w.]*$/.test(m[1].trim())) githubCheckResult = { version: m[1].trim() }; }
                githubCheckDone = true; resolveUpdateAfterChecks();
            },
            onerror: () => { log('更新检测: 网络请求失败'); githubCheckDone = true; resolveUpdateAfterChecks(); },
            ontimeout: () => { log('更新检测: 请求超时'); githubCheckDone = true; resolveUpdateAfterChecks(); }
        });
    }
    function showUpdateBadgeInPanel() {
        if (!shouldShowUpdateReminder(bseas_update_mode, bseas_update_last_prompt_ts, Date.now(), latestVersion, SCRIPT_VERSION, 'panel')) return;
        const hint = document.getElementById('bseas-ad-hint');
        if (!hint || hint.querySelector('.bseas-update-badge')) return;
        const badge = document.createElement('a');
        badge.href = updateLinkUrl || SCRIPTCAT_URL; badge.target = '_blank'; badge.rel = 'noopener noreferrer';
        badge.className = 'bseas-update-badge'; badge.textContent = '新版本 v' + latestVersion;
        if (bseas_update_mode === 'reduced') {
            const close = document.createElement('span');
            close.className = 'bseas-update-badge-close';
            close.title = '7天内不再提醒';
            close.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
            close.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                bseas_update_last_prompt_ts = Date.now();
                GM_setValue('bseas_update_last_prompt_ts', bseas_update_last_prompt_ts);
                badge.remove();
                showToast('已关闭，7天内不再提醒', 'success');
            });
            badge.appendChild(close);
        }
        hint.appendChild(badge);
    }
    function getStorageUsageBytes() {
        let totalBytes = 0;
        const keys = GM_listValues();
        for (const k of keys) {
            try { totalBytes += new Blob([JSON.stringify(GM_getValue(k, ''))]).size; } catch (e) {}
        }
        return totalBytes;
    }
    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    function updateStorageUsageDisplay() {
        const el = document.getElementById('bseas-storage-usage');
        if (!el) return;
        const bytes = getStorageUsageBytes();
        el.textContent = '已用：' + formatBytes(bytes);
        el.classList.toggle('warn', bytes > 4 * 1024 * 1024);
    }
    function checkStorageSize() {
        const totalBytes = getStorageUsageBytes();
        updateStorageUsageDisplay();
        if (totalBytes <= 5 * 1024 * 1024) return;
        const entries = Object.entries(aiSummaryCache);
        if (entries.length === 0) return;
        entries.sort((a, b) => (a[1].ts || 0) - (b[1].ts || 0));
        const removeCount = Math.floor(entries.length / 2);
        if (removeCount < 1) return;
        for (let i = 0; i < removeCount; i++) delete aiSummaryCache[entries[i][0]];
        GM_setValue('aiSummaryCache', aiSummaryCache);
        showToast(`⚠ 储存空间超限，已自动清理 ${removeCount} 条旧记录`, 'warning');
        const dot = document.querySelector('.bseas-status-dot');
        if (dot) {
            dot.className = 'bseas-status-dot state-red';
            setTimeout(() => updateDotState(), 6000);
        }
        updateStorageUsageDisplay();
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
        if (inCode) { out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>'); }
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
    function notifyAdDetected() {
        if (adDetectionNotified || !adSegments || adSegments.length === 0) return;
        adDetectionNotified = true;
        const msg = bseas_auto_skip_ad
            ? '检测到视频植入广告，已在进度条标黄显示，并将自动跳过'
            : '检测到视频植入广告，已在进度条标黄显示';
        showToast(msg, 'success');
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
            const subs = pd.data.subtitle.subtitles.map((s, i) => ({
                id: s.id || i, lan: s.lan, lan_doc: s.lan_doc, subtitle_url: s.subtitle_url,
                isAI: s.lan.startsWith('ai-'), body: null
            }));
            const isZh = s => /^zh/i.test(s.lan) || /[\u4e00-\u9fa5]/.test(s.lan_doc || '');
            subs.sort((a, b) => {
                const az = isZh(a), bz = isZh(b);
                if (az !== bz) return az ? -1 : 1;
                return 0;
            });
            return subs;
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
            const r = await fetch(`https://api.bilibili.com/x/v2/reply/main?type=1&oid=${aid}&mode=3&next=0&ps=${bseas_save_tokens ? 10 : bseas_opinion_comments_count}`, { credentials: 'include' });
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
    function buildAPIRequest(messages, stream) {
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
            if (stream) headers['Accept'] = 'text/event-stream';
            bodyData = { model: actualModel, max_tokens: 8192, messages: messages };
            if (stream) bodyData.stream = true;
        } else if (isGemini) {
            fetchUrl = fetchUrl.replace('{model_name}', actualModel);
            if (stream) {
                if (fetchUrl.includes(':generateContent')) fetchUrl = fetchUrl.replace(':generateContent', ':streamGenerateContent');
                fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `key=${safeApiKey}&alt=sse`;
            } else {
                fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `key=${safeApiKey}`;
            }
            bodyData = { contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) };
        } else {
            headers['Authorization'] = `Bearer ${safeApiKey}`;
            if (stream) headers['Accept'] = 'text/event-stream';
            bodyData = { model: actualModel, messages: messages };
            if (stream) bodyData.stream = true;
        }
        return { fetchUrl, headers, bodyData, isClaude, isGemini };
    }
    async function callAPIStream(messages, onChunk) {
        const { fetchUrl, headers, bodyData, isClaude, isGemini } = buildAPIRequest(messages, true);
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
            const { fetchUrl, headers, bodyData, isClaude, isGemini } = buildAPIRequest(messages, false);
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
        const today = new Date();
        const weekdays = ['日','一','二','三','四','五','六'];
        const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日 星期${weekdays[today.getDay()]}`;
        contextInfo += `今天是${dateStr}。\n`;
        const videoTitle = getVideoTitle();
        const videoDesc = getVideoDescription();
        const videoTags = getVideoTags();
        if (videoTitle) contextInfo += `视频标题：「${videoTitle}」\n`;
        if (videoDesc) contextInfo += `视频简介：「${videoDesc}」\n`;
        if (videoTags.length > 0) contextInfo += `视频标签：${videoTags.join(', ')}\n`;
        const upName = getUpName();
        const partNum = getVideoPartNumber();
        const subLang = getCurrentSubtitleLanguage();
        if (upName) contextInfo += `UP主：「${upName}」\n`;
        if (partNum !== null) contextInfo += `当前分P：第${partNum}P\n`;
        if (subLang) contextInfo += `字幕语言：${subLang}\n`;
        if (contextInfo) contextInfo += '\n';
        const commentsText = (bseas_opinion_analysis && hotComments.length > 0) ? formatCommentsForAI() : '';
        if (commentsText) contextInfo += `===== 热门评论（按热度排序）=====\n${commentsText}\n\n`;
        const adHint = hasSubtitle && subtitleContainsAdKeyword();
        const usePlain = bseas_save_tokens && !adHint;
        const finalSubtitle = hasSubtitle ? (usePlain ? getPlainSubtitleText() : subtitleText) : '';
        const toolIdentity = '你是哔哩哔哩辅助工具的AI分析模块，正在分析B站视频字幕内容。';
        return `${toolIdentity}\n\n${getAISummaryPrompt(hasSubtitle, includeFormatRules, adHint)}\n\n${contextInfo}${hasSubtitle ? '===== 视频字幕 =====\n' + finalSubtitle : ''}`;
    }
    function buildCorrectSubtitlePrompt() {
        const title = getVideoTitle();
        const desc = getVideoDescription();
        const today = new Date();
        const weekdays = ['日','一','二','三','四','五','六'];
        const dateStr = `${today.getFullYear()}年${today.getMonth()+1}月${today.getDate()}日 星期${weekdays[today.getDay()]}`;
        let ctx = `今天是${dateStr}。\n`;
        if (title) ctx += `视频标题：「${title}」\n`;
        if (desc) ctx += `视频简介：「${desc}」\n`;
        const tags = getVideoTags();
        if (tags.length > 0) ctx += `视频标签：${tags.join(', ')}\n`;
        const upName = getUpName();
        const partNum = getVideoPartNumber();
        const subLang = getCurrentSubtitleLanguage();
        if (upName) ctx += `UP主：「${upName}」\n`;
        if (partNum !== null) ctx += `当前分P：第${partNum}P\n`;
        if (subLang) ctx += `字幕语言：${subLang}\n`;
        const commentsText = hotComments.length > 0 ? formatCommentsForAI() : '';
        if (commentsText) ctx += `\n===== 热门评论（按热度排序，可能含黑话/专有名词的正确表述，仅作修正参考）=====\n${commentsText}\n`;
        const curBody = currentSubtitleData?.body || [];
        const curJson = JSON.stringify(curBody.map(it => ({ from: it.from, to: it.to, content: it.content })));
        let otherTracks = '';
        for (const s of allSubtitles) {
            if (s === currentSubtitleData) continue;
            if (!s.body?.length) continue;
            otherTracks += `\n--- 字幕轨道(${s.lan_doc}) ---\n` + s.body.map(it => `[${formatTime(it.from)} - ${formatTime(it.to)}] ${it.content}`).join('\n');
        }
        const totalEntries = curBody.length;
        return `你是哔哩哔哩辅助工具的字幕修正模块。请结合视频内容与上下文，修正"当前选中字幕"中的识别错误（错别字、断句、专有名词等），进行推测、润色、优化、修正。
${ctx}
===== 当前选中字幕（JSON 数组，from/to 为秒数即时间戳）=====
${curJson}
${otherTracks ? '===== 其他字幕轨道（仅作上下文参考，不要修正它们）=====' + otherTracks : ''}

要求：
1. 仅修正每条的 content 文本，from 与 to 数值必须原样保留，不得改变。
2. 输出数组长度必须严格等于 ${totalEntries} 条，与输入一一对应，严禁合并、拆分、新增或删除任何条目。
3. 即使某条字幕的 content 需要大幅修正，也必须输出对应的一条，不得跳过或合并到相邻条目。
4. 完整输出全部条目，不得遗漏。
5. 直接输出 JSON 数组，格式与输入一致：[{"from":0.5,"to":2.1,"content":"修正后文本"}]
6. 不要输出任何解释文字，不要用代码块包裹。`;
    }
    function parseCorrectedSubtitleJSON(rawText) {
        if (!rawText || typeof rawText !== 'string') return null;
        let s = rawText.trim();
        const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fence) s = fence[1].trim();
        let parsed = null;
        try { parsed = JSON.parse(s); }
        catch (e) {
            const arr = s.match(/\[[\s\S]*\]/);
            if (!arr) return null;
            try { parsed = JSON.parse(arr[0]); } catch (e2) { return null; }
        }
        if (!Array.isArray(parsed)) return null;
        const items = parsed.map(it => {
            if (!it || typeof it !== 'object') return null;
            const from = typeof it.from === 'number' ? it.from : parseFloat(it.from);
            const to = typeof it.to === 'number' ? it.to : parseFloat(it.to);
            const content = typeof it.content === 'string' ? it.content : String(it.content == null ? '' : it.content);
            if (isNaN(from) || isNaN(to) || !content) return null;
            return { from, to, content };
        }).filter(Boolean);
        return items.length > 0 ? items : null;
    }
    function correctedSubtitleKey(videoKey) { return 'bseas_corrected_subtitle_' + videoKey; }
    function userSubsKey(videoKey) { return 'bseas_user_subs_' + videoKey; }
    function getCorrectedSubtitle(videoKey) {
        if (!videoKey) return null;
        const v = GM_getValue(correctedSubtitleKey(videoKey), null);
        if (!v) return null;
        if (Array.isArray(v)) return { body: v, lanDoc: '', method: 'ai' };
        if (v.body && Array.isArray(v.body)) return { body: v.body, lanDoc: v.lanDoc || '', method: v.method || 'ai' };
        return null;
    }
    function setCorrectedSubtitle(videoKey, body, lanDoc, method) {
        if (!videoKey || !Array.isArray(body)) return;
        GM_setValue(correctedSubtitleKey(videoKey), { body, lanDoc: lanDoc || '', method: method || 'ai' });
    }
    function clearCorrectedSubtitle(videoKey) {
        if (!videoKey) return;
        GM_deleteValue(correctedSubtitleKey(videoKey));
    }
    function getUserSubtitlesList(videoKey) {
        if (!videoKey) return [];
        const v = GM_getValue(userSubsKey(videoKey), null);
        if (!Array.isArray(v)) return [];
        return v;
    }
    function saveUserSubtitleItem(videoKey, body, lanDoc, existingId) {
        if (!videoKey || !Array.isArray(body)) return null;
        const list = getUserSubtitlesList(videoKey);
        if (existingId) {
            const idx = list.findIndex(s => s.id === existingId);
            if (idx >= 0) { list[idx].body = body; list[idx].lanDoc = lanDoc || list[idx].lanDoc; GM_setValue(userSubsKey(videoKey), list); return existingId; }
        }
        let n = 1;
        while (list.some(s => s.id === 'user-' + n)) n++;
        const id = 'user-' + n;
        list.push({ id, lanDoc: lanDoc || ('中文' + n), body, method: 'manual' });
        GM_setValue(userSubsKey(videoKey), list);
        return id;
    }
    function deleteUserSubtitleItem(videoKey, id) {
        if (!videoKey || !id) return;
        const list = getUserSubtitlesList(videoKey).filter(s => s.id !== id);
        GM_setValue(userSubsKey(videoKey), list);
    }
    function createThrottledRenderer(el, options) {
        options = options || {};
        const shouldRender = options.shouldRender || (() => true);
        const autoScroll = !!options.autoScroll;
        const throttleMs = options.throttleMs != null ? options.throttleMs : 80;
        let lastRenderTime = 0;
        let pendingText = null;
        let timerId = null;
        let targetEl = el;
        function doRender(text) {
            if (!shouldRender()) return;
            if (targetEl.id && !document.body.contains(targetEl)) {
                const fresh = document.getElementById(targetEl.id);
                if (fresh) targetEl = fresh; else return;
            } else if (!document.body.contains(targetEl)) return;
            safeSetInnerHTML(targetEl, markdownToHtml(text));
            renderLatex(targetEl);
            if (autoScroll) targetEl.scrollTop = targetEl.scrollHeight;
        }
        function flush() {
            timerId = null;
            if (pendingText === null) return;
            const text = pendingText;
            pendingText = null;
            lastRenderTime = Date.now();
            doRender(text);
        }
        return {
            update(text) {
                pendingText = text;
                const now = Date.now();
                const elapsed = now - lastRenderTime;
                if (elapsed >= throttleMs) {
                    lastRenderTime = now;
                    pendingText = null;
                    doRender(text);
                } else if (timerId === null) {
                    timerId = setTimeout(flush, throttleMs - elapsed);
                }
            },
            finalize(text) {
                if (timerId !== null) { clearTimeout(timerId); timerId = null; }
                pendingText = null;
                lastRenderTime = Date.now();
                doRender(text);
            },
            cancel() {
                if (timerId !== null) { clearTimeout(timerId); timerId = null; }
                pendingText = null;
            }
        };
    }
    async function generateAISummaryStream(subtitleText, streamEl, shouldRender) {
        const fullPrompt = buildFullPrompt(subtitleText);
        const messages = [{ role: 'user', content: fullPrompt }];
        const renderer = createThrottledRenderer(streamEl, { autoScroll: true, shouldRender: shouldRender || (() => true) });
        let summary = await callAPIStream(messages, text => { currentStreamText = text; renderer.update(text); });
        renderer.finalize(summary);
        currentStreamText = '';
        let adCheck = extractAdSegments(summary);
        if (bseas_save_tokens && !subtitleContainsAdKeyword()) adCheck = { type: 'none', segments: [] };
        lastAdCheckResult = adCheck;

        setCachedSummary(currentVideoKey, fullPrompt, summary);
        aiConversationHistory = [{ role: 'user', content: fullPrompt, fullContent: fullPrompt }, { role: 'assistant', content: summary }];
        adSegments = adCheck.segments;
        if (adSegments.length > 0) { initProgressMark(); initAdSkipMonitor(); notifyAdDetected(); }

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
                if (adSegments.length > 0) { initProgressMark(); initAdSkipMonitor(); notifyAdDetected(); }
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
            currentStreamText = '';
            currentFollowupQ = null;
            currentFollowupText = '';
            if (autoGenerateTimer) { clearTimeout(autoGenerateTimer); autoGenerateTimer = null; }
        }
        currentVideoKey = vk;
        allSubtitles = []; currentSubtitleData = null; selectedSubtitleId = null;
        adSegments = []; hasJumpedAds = {}; lastAdCheckResult = null; adDetectionNotified = false;
        progressMarkInitialized = false; hotComments = []; subtitleSearchKeyword = ''; currentPreviewLimit = 0; expandedSearch = false;
        aiConversationHistory = [];
        const existingMark = document.getElementById('bseas-ad-progress-mark');
        if (existingMark) existingMark.remove();
        setLoadingState(true);
        try {
            allSubtitles = await fetchBilibiliSubtitles();
            appendCorrectedSubtitleOption();
            const commentPromise = bseas_opinion_analysis ? fetchHotComments() : Promise.resolve([]);
            if (allSubtitles.length > 0) await loadSubtitle(allSubtitles[0]);
            hotComments = await commentPromise;
        } catch (e) {}
        setLoadingState(false);
        updateUI(); updateContent();
    }
    function appendCorrectedSubtitleOption(lanDoc, method) {
        if (!currentVideoKey) return;
        const stored = getCorrectedSubtitle(currentVideoKey);
        if (stored && stored.body && stored.body.length > 0) {
            const doc = lanDoc || stored.lanDoc || '已修正';
            const m = method || stored.method || 'ai';
            const idx = allSubtitles.findIndex(s => s.id === 'ai-corrected');
            if (idx >= 0) { allSubtitles[idx].body = stored.body; allSubtitles[idx].lan_doc = doc; allSubtitles[idx].editMethod = m; }
            else allSubtitles.unshift({ id: 'ai-corrected', lan_doc: doc, isAI: true, body: stored.body, editMethod: m });
        }
        const userSubs = getUserSubtitlesList(currentVideoKey);
        for (const us of userSubs) {
            const idx = allSubtitles.findIndex(s => s.id === us.id);
            if (idx >= 0) { allSubtitles[idx].body = us.body; allSubtitles[idx].lan_doc = us.lanDoc; allSubtitles[idx].isUserEdited = true; allSubtitles[idx].editMethod = 'manual'; }
            else allSubtitles.unshift({ id: us.id, lan_doc: us.lanDoc, isUserEdited: true, body: us.body, editMethod: 'manual' });
        }
    }
    let loadSubtitleGeneration = 0;
    async function loadSubtitle(sub) {
        if (!sub) return;
        if (selectedSubtitleId === sub.id && currentSubtitleData?.body?.length > 0) return;
        selectedSubtitleId = sub.id;
        subtitleSearchKeyword = '';
        currentPreviewLimit = 0;
        expandedSearch = false;
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
        const thisGen = ++loadSubtitleGeneration;
        sub.body = await fetchSubtitleContent(sub.subtitle_url);
        if (thisGen !== loadSubtitleGeneration) return;
        currentSubtitleData = sub;
        setLoadingState(false);
        updateUI(); updateContent(); afterLoad();
    }
    let isCorrectingSubtitle = false;
    let _correctProgressRAF = 0;
    let _correctBar = null;
    let _correctPhase = 0;
    let _correctPhase1Start = 0;
    let _correctEstimatedTotal = 0;
    function startCorrectProgress(bar, estimatedTotalChars) {
        if (!bar) return;
        _correctBar = bar;
        _correctPhase = 1;
        _correctEstimatedTotal = Math.max(estimatedTotalChars, 1000);
        bar.style.width = '0%';
        bar.style.transition = '';
        _correctPhase1Start = performance.now();
        const tick = (now) => {
            if (_correctPhase !== 1) return;
            const elapsed = now - _correctPhase1Start;
            const ratio = Math.min(elapsed / 20000, 1);
            const eased = 1 - Math.pow(1 - ratio, 3);
            bar.style.width = (eased * 20) + '%';
            if (ratio < 1) {
                _correctProgressRAF = requestAnimationFrame(tick);
            }
        };
        _correctProgressRAF = requestAnimationFrame(tick);
    }
    function updateCorrectProgress(receivedChars) {
        if (!_correctBar || _correctPhase === 0) return;
        if (_correctPhase === 1) {
            _correctPhase = 2;
            if (_correctProgressRAF) { cancelAnimationFrame(_correctProgressRAF); _correctProgressRAF = 0; }
        }
        const ratio = _correctEstimatedTotal > 0 ? Math.min(receivedChars / _correctEstimatedTotal, 1) : 0;
        bar_setPct(_correctBar, 20 + ratio * 80);
    }
    function bar_setPct(bar, pct) { if (bar) bar.style.width = pct + '%'; }
    function finishCorrectProgress(bar) {
        _correctPhase = 0;
        if (_correctProgressRAF) { cancelAnimationFrame(_correctProgressRAF); _correctProgressRAF = 0; }
        if (!bar) return;
        bar.style.transition = 'width 0.3s ease';
        bar.style.width = '100%';
        setTimeout(() => { bar.style.transition = ''; bar.style.width = '0%'; }, 600);
    }
    async function runAICorrectSubtitle() {
        if (isCorrectingSubtitle) return;
        if (!currentSubtitleData?.body?.length) { showToast('请先选择字幕', 'warning'); return; }
        if (currentSubtitleData?.id === 'ai-corrected') { showToast('已修正字幕无需重复修正', 'warning'); return; }
        if (bseas_disable_api) { showToast('已禁用 API，无法修正', 'warning'); return; }
        if (!bseas_api_key) { showToast('未配置 API Key', 'warning'); return; }
        const correctionText = getTimestampedTextForAI();
        if (bseas_confirm_enabled && correctionText.length > bseas_confirm_chars) {
            if (!confirm(`字幕文字量过多（包含时间戳为 ${correctionText.length} 字），调用 AI 修正可能会消耗较多 Tokens，是否继续？`)) return;
        }
        isCorrectingSubtitle = true;
        const btn = document.getElementById('bseas-ai-correct-btn');
        const bar = btn?.querySelector('.bseas-correct-progress');
        if (btn) { btn.classList.add('loading'); const sp = btn.querySelector('span'); if (sp) sp.textContent = '修正中...'; }
        const curJson = JSON.stringify(currentSubtitleData.body.map(it => ({ from: it.from, to: it.to, content: it.content })));
        startCorrectProgress(bar, curJson.length * 1.1);
        showToast('开始修正字幕，耗时较长，请耐心等候', '');
        try {
            const originalBody = currentSubtitleData.body;
            const lanDoc = currentSubtitleData.lan_doc || '已修正';
            if (!hotComments.length) { try { hotComments = await fetchHotComments(); } catch (e) {} }
            const prompt = buildCorrectSubtitlePrompt();
            const messages = [{ role: 'user', content: prompt }];
            const resp = await callAPIStream(messages, text => updateCorrectProgress(text.length));
            const parsed = parseCorrectedSubtitleJSON(resp);
            if (!parsed || parsed.length !== originalBody.length) throw new Error('修正条目数不匹配，请重试');
            const body = parsed.map((it, i) => ({ from: originalBody[i].from, to: originalBody[i].to, content: it.content }));
            setCorrectedSubtitle(currentVideoKey, body, lanDoc, 'ai');
            appendCorrectedSubtitleOption(lanDoc, 'ai');
            const corrected = allSubtitles.find(s => s.id === 'ai-corrected');
            if (corrected) await loadSubtitle(corrected);
            showToast('字幕修正完成', 'success');
        } catch (e) {
            showToast('修正失败: ' + (e?.message || '未知错误'), 'error');
        } finally {
            finishCorrectProgress(bar);
            isCorrectingSubtitle = false;
            const btn2 = document.getElementById('bseas-ai-correct-btn');
            if (btn2) { btn2.classList.remove('loading'); const sp = btn2.querySelector('span'); if (sp) sp.textContent = 'AI 修正字幕'; }
        }
    }
    function openSRTPasteDialog() {
        if (!currentVideoKey) { showToast('请先加载视频', 'warning'); return; }
        const existing = document.querySelector('.bseas-edit-overlay.bseas-srtpaste-overlay');
        if (existing) return;
        const video = document.querySelector('#bilibili-player video') || document.querySelector('video');
        const videoDur = video ? video.duration : 0;
        const overlay = document.createElement('div');
        overlay.className = 'bseas-edit-overlay bseas-srtpaste-overlay';
        safeSetInnerHTML(overlay, `<div class="bseas-edit-modal" style="max-width:560px;"><div class="bseas-edit-modal-header"><span>新建字幕 - 粘贴SRT</span></div><div class="bseas-edit-modal-body" style="padding:16px 20px;"><div style="font-size:13px;color:var(--bseas-text-muted);margin-bottom:10px;">请粘贴SRT格式字幕内容${videoDur ? `（视频时长 ${formatTime(videoDur)}）` : ''}：</div><textarea id="bseas-srtpaste-input" class="bseas-text-area" style="width:100%;min-height:260px;font-family:monospace;font-size:13px;resize:vertical;" placeholder="1\n00:00:01,000 --> 00:00:03,000\n字幕内容\n..."></textarea><div id="bseas-srtpaste-hint" style="font-size:12px;color:var(--bseas-text-muted);margin-top:8px;"></div></div><div class="bseas-edit-modal-footer"><button class="bseas-edit-modal-btn cancel">取消</button><button class="bseas-edit-modal-btn save" id="bseas-srtpaste-confirm">解析并编辑</button></div></div>`);
        document.body.appendChild(overlay);
        const inputEl = overlay.querySelector('#bseas-srtpaste-input');
        const hintEl = overlay.querySelector('#bseas-srtpaste-hint');
        const closeDialog = () => { overlay.querySelector('.bseas-edit-modal')?.classList.add('closing'); overlay.classList.add('closing'); setTimeout(() => { overlay.remove(); document.removeEventListener('keydown', escHandler); }, 200); };
        overlay.querySelector('.cancel').addEventListener('click', closeDialog);
        overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
        const escHandler = e => { if (e.key === 'Escape') closeDialog(); };
        document.addEventListener('keydown', escHandler);
        overlay.querySelector('#bseas-srtpaste-confirm').addEventListener('click', () => {
            const text = inputEl.value.trim();
            if (!text) { showToast('请粘贴SRT内容', 'warning'); return; }
            const parsed = parseSRT(text);
            if (parsed.length === 0) { showToast('未解析到有效字幕，请检查格式', 'warning'); return; }
            let overCount = 0;
            if (videoDur && videoDur > 0) {
                for (const it of parsed) { if (it.to > videoDur + 1) overCount++; }
            }
            document.removeEventListener('keydown', escHandler);
            closeDialog();
            openSubtitleEditor({ isNew: true, presetBody: parsed });
            if (overCount > 0) setTimeout(() => showToast(`解析 ${parsed.length} 条，其中 ${overCount} 条时间超出视频时长`, 'warning'), 300);
            else setTimeout(() => showToast(`解析成功 ${parsed.length} 条字幕`, 'success'), 300);
        });
        setTimeout(() => inputEl?.focus(), 100);
    }
    function openSubtitleEditor(opts) {
        opts = opts || {};
        const isNew = !!opts.isNew;
        if (!isNew && !currentSubtitleData?.body?.length) { showToast('请先选择字幕', 'warning'); return; }
        if (!currentVideoKey) { showToast('请先加载视频', 'warning'); return; }
        const existing = document.querySelector('.bseas-edit-overlay.bseas-editor-overlay');
        if (existing) existing.remove();
        const lanDoc = isNew ? '手动新建' : (currentSubtitleData.lan_doc || '字幕');
        const baseBody = opts.presetBody ? opts.presetBody : ((!isNew && currentSubtitleData?.body?.length) ? currentSubtitleData.body : []);
        const DEL_SVG = '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
        const PLUS_SVG = '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
        const DOWNLOAD_SVG = '<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
        const FIND_SVG = '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
        let working = baseBody.map(it => ({ from: Number(it.from) || 0, to: Number(it.to) || 0, content: it.content || '' }));
        if (working.length === 0) working.push({ from: 0, to: 5, content: '' });
        const overlay = document.createElement('div');
        overlay.className = 'bseas-edit-overlay bseas-editor-overlay';
        const editTitlePrefix = isNew ? '导入字幕' : (currentSubtitleData?.isAI ? '编辑AI字幕' : (currentSubtitleData?.isUserEdited ? '编辑字幕' : '编辑字幕'));
        const titleText = `${editTitlePrefix} - ${escapeHtml(lanDoc)}`;
        safeSetInnerHTML(overlay, `<div class="bseas-edit-modal"><div class="bseas-edit-modal-header"><span id="bseas-edit-title">${titleText}（共${working.length}条）</span><button class="bseas-edit-tool-btn" id="bseas-edit-toggle-find" title="查找替换" style="padding:4px 8px;">${FIND_SVG}</button></div><div class="bseas-edit-findbar" id="bseas-edit-findbar"><div class="bseas-edit-find-row"><input type="text" class="bseas-edit-find-input" id="bseas-edit-find" placeholder="查找内容"><button class="bseas-edit-find-btn secondary" id="bseas-edit-find-next">下一个</button><span class="bseas-edit-find-count" id="bseas-edit-find-count"></span></div><div class="bseas-edit-find-row"><input type="text" class="bseas-edit-find-input" id="bseas-edit-replace" placeholder="替换为"><button class="bseas-edit-find-btn" id="bseas-edit-replace-one">替换</button><button class="bseas-edit-find-btn" id="bseas-edit-replace-all">全部替换</button></div></div><div class="bseas-edit-modal-body" id="bseas-edit-body"></div><div class="bseas-edit-modal-footer"><button class="bseas-edit-modal-btn cancel">取消</button><button class="bseas-edit-modal-btn" id="bseas-edit-export-srt" style="background:rgba(0,174,236,0.1);color:var(--bseas-primary);">${DOWNLOAD_SVG}<span style="margin-left:4px;">导出SRT</span></button><button class="bseas-edit-modal-btn save">保存</button></div></div>`);
        document.body.appendChild(overlay);
        const bodyEl = overlay.querySelector('#bseas-edit-body');
        const titleEl = overlay.querySelector('#bseas-edit-title');
        let findCursor = { entry: 0, offset: 0 };
        function flushInputs() {
            const entries = bodyEl.querySelectorAll('.bseas-edit-entry');
            entries.forEach((entry, i) => {
                if (!working[i]) return;
                const fromEl = entry.querySelector('.bseas-edit-time[data-field="from"]');
                const toEl = entry.querySelector('.bseas-edit-time[data-field="to"]');
                const ta = entry.querySelector('.bseas-edit-textarea');
                if (fromEl) { const v = parseTimeInput(fromEl.value); if (v != null) working[i].from = v; }
                if (toEl) { const v = parseTimeInput(toEl.value); if (v != null) working[i].to = v; }
                if (ta) working[i].content = ta.value;
            });
        }
        function renderEntries() {
            const html = working.map((it, i) => `<div class="bseas-edit-entry" data-idx="${i}"><div class="bseas-edit-times"><input class="bseas-edit-time" data-field="from" value="${escapeHtml(formatTimeWithMs(it.from))}" title="开始时间 (M:SS.ms)"><span class="bseas-edit-arrow"><svg viewBox="0 0 24 24"><path d="M14 5l-1.41 1.41L16.17 10H4v2h12.17l-3.58 3.59L14 17l6-6z"/></svg></span><input class="bseas-edit-time" data-field="to" value="${escapeHtml(formatTimeWithMs(it.to))}" title="结束时间 (M:SS.ms)"></div><textarea class="bseas-edit-textarea" rows="1">${escapeHtml(it.content || '')}</textarea><div class="bseas-edit-actions"><button class="bseas-edit-add" data-add-idx="${i}" title="在此条之前新建">${PLUS_SVG}</button><button class="bseas-edit-del" data-del-idx="${i}" title="删除该条">${DEL_SVG}</button></div></div>`).join('');
            safeSetInnerHTML(bodyEl, html);
            if (titleEl) titleEl.textContent = `${editTitlePrefix} - ${lanDoc}（共${working.length}条）`;
        }
        renderEntries();
        bodyEl.addEventListener('click', (e) => {
            const delBtn = e.target.closest('.bseas-edit-del');
            if (delBtn) {
                e.stopPropagation();
                flushInputs();
                const idx = parseInt(delBtn.dataset.delIdx, 10);
                if (isNaN(idx) || idx < 0 || idx >= working.length) return;
                working.splice(idx, 1);
                if (working.length === 0) working.push({ from: 0, to: 5, content: '' });
                renderEntries();
                return;
            }
            const addBtn = e.target.closest('.bseas-edit-add');
            if (addBtn) {
                e.stopPropagation();
                flushInputs();
                const insertIdx = parseInt(addBtn.dataset.addIdx, 10);
                if (isNaN(insertIdx) || insertIdx < 0 || insertIdx > working.length) return;
                const prevTo = insertIdx > 0 ? working[insertIdx - 1].to : 0;
                working.splice(insertIdx, 0, { from: prevTo, to: prevTo + 5, content: '' });
                renderEntries();
                const newEntry = bodyEl.querySelectorAll('.bseas-edit-entry')[insertIdx];
                if (newEntry) {
                    newEntry.scrollIntoView({ block: 'center' });
                    const ta = newEntry.querySelector('.bseas-edit-textarea');
                    if (ta) ta.focus();
                }
            }
        });
        const closeOverlay = () => {
            const modal = overlay.querySelector('.bseas-edit-modal');
            if (modal) {
                modal.classList.add('closing');
                overlay.classList.add('closing');
                setTimeout(() => { overlay.remove(); document.removeEventListener('keydown', escHandler); }, 200);
            } else {
                overlay.remove(); document.removeEventListener('keydown', escHandler);
            }
        };
        overlay.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === overlay) closeOverlay(); });
        const escHandler = (e) => { if (e.key === 'Escape') closeOverlay(); };
        document.addEventListener('keydown', escHandler);
        overlay.querySelector('.cancel').addEventListener('click', (e) => { e.stopPropagation(); closeOverlay(); });
        overlay.querySelector('#bseas-edit-export-srt').addEventListener('click', (e) => {
            e.stopPropagation();
            flushInputs();
            const text = buildSRTFromBody(working);
            if (!text) { showToast('无字幕可导出', 'warning'); return; }
            const title = sanitizeFilename(getVideoTitle()) || 'subtitle';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
            a.download = `${title}.srt`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            showToast('SRT 导出成功', 'success');
        });
        const findbar = overlay.querySelector('#bseas-edit-findbar');
        overlay.querySelector('#bseas-edit-toggle-find').addEventListener('click', (e) => {
            e.stopPropagation();
            findbar.classList.toggle('open');
            if (findbar.classList.contains('open')) overlay.querySelector('#bseas-edit-find')?.focus();
        });
        function countMatches(findStr) {
            if (!findStr) return 0;
            let n = 0;
            for (const it of working) { let idx = 0; while ((idx = it.content.indexOf(findStr, idx)) !== -1) { n++; idx += findStr.length; } }
            return n;
        }
        function updateFindCount() {
            const f = overlay.querySelector('#bseas-edit-find').value;
            const cntEl = overlay.querySelector('#bseas-edit-find-count');
            if (cntEl) cntEl.textContent = f ? `${countMatches(f)} 处` : '';
        }
        overlay.querySelector('#bseas-edit-find').addEventListener('input', () => { findCursor = { entry: 0, offset: 0 }; updateFindCount(); });
        function findNextOccurrence(findStr, fromEntry, fromOffset) {
            for (let i = fromEntry; i < working.length; i++) {
                const content = working[i].content;
                const start = i === fromEntry ? fromOffset : 0;
                const idx = content.indexOf(findStr, start);
                if (idx !== -1) return { entry: i, offset: idx };
            }
            for (let i = 0; i <= fromEntry && i < working.length; i++) {
                const content = working[i].content;
                const idx = content.indexOf(findStr, 0);
                if (idx !== -1) return { entry: i, offset: idx };
            }
            return null;
        }
        overlay.querySelector('#bseas-edit-find-next').addEventListener('click', (e) => {
            e.stopPropagation();
            flushInputs();
            const f = overlay.querySelector('#bseas-edit-find').value;
            if (!f) return;
            const total = countMatches(f);
            if (total === 0) { showToast('未找到匹配项', ''); return; }
            const found = findNextOccurrence(f, findCursor.entry, findCursor.offset);
            if (found) {
                findCursor = { entry: found.entry, offset: found.offset + f.length };
                const entryEl = bodyEl.querySelectorAll('.bseas-edit-entry')[found.entry];
                if (entryEl) {
                    entryEl.scrollIntoView({ block: 'center' });
                    const ta = entryEl.querySelector('.bseas-edit-textarea');
                    if (ta) { ta.focus(); ta.setSelectionRange(found.offset, found.offset + f.length); }
                }
            }
            updateFindCount();
        });
        overlay.querySelector('#bseas-edit-replace-one').addEventListener('click', (e) => {
            e.stopPropagation();
            flushInputs();
            const f = overlay.querySelector('#bseas-edit-find').value;
            const r = overlay.querySelector('#bseas-edit-replace').value;
            if (!f) return;
            const found = findNextOccurrence(f, findCursor.entry, findCursor.offset);
            if (!found) { showToast('未找到匹配项', ''); return; }
            working[found.entry].content = working[found.entry].content.slice(0, found.offset) + r + working[found.entry].content.slice(found.offset + f.length);
            findCursor = { entry: found.entry, offset: found.offset + r.length };
            renderEntries();
            updateFindCount();
            showToast('已替换 1 处', 'success');
        });
        overlay.querySelector('#bseas-edit-replace-all').addEventListener('click', (e) => {
            e.stopPropagation();
            flushInputs();
            const f = overlay.querySelector('#bseas-edit-find').value;
            const r = overlay.querySelector('#bseas-edit-replace').value;
            if (!f) return;
            let n = 0;
            for (const it of working) {
                if (it.content.includes(f)) { n += it.content.split(f).length - 1; it.content = it.content.split(f).join(r); }
            }
            findCursor = { entry: 0, offset: 0 };
            renderEntries();
            updateFindCount();
            showToast(n ? `已替换 ${n} 处` : '未找到匹配项', n ? 'success' : '');
        });
        overlay.querySelector('.save').addEventListener('click', (e) => {
            e.stopPropagation();
            flushInputs();
            const editedBody = working.map(it => {
                const from = Number(it.from) || 0;
                let to = Number(it.to) || 0;
                if (to < from) to = from;
                return { from, to, content: it.content || '' };
            });
            if (editedBody.length === 0) { showToast('至少保留一条字幕', 'warning'); return; }
            const isEditingAI = !isNew && currentSubtitleData?.isAI;
            const isEditingUser = !isNew && currentSubtitleData?.isUserEdited;
            let savedId;
            if (isEditingUser) {
                savedId = saveUserSubtitleItem(currentVideoKey, editedBody, lanDoc, currentSubtitleData.id);
            } else {
                const existing = getUserSubtitlesList(currentVideoKey);
                let n = 1;
                while (existing.some(s => s.id === 'user-' + n)) n++;
                const autoName = isNew ? ('手动字幕' + n) : ('中文' + n);
                savedId = saveUserSubtitleItem(currentVideoKey, editedBody, autoName, null);
            }
            appendCorrectedSubtitleOption();
            const saved = allSubtitles.find(s => s.id === savedId);
            if (saved) loadSubtitle(saved);
            showToast('字幕编辑已保存', 'success');
            closeOverlay();
        });
    }
    let _lastTabIndex = 0;
    function switchTab(tab) {
        if (tab === currentTab) return;
        const newIdx = TAB_ORDER.indexOf(tab);
        const direction = newIdx >= _lastTabIndex ? 'right' : 'left';
        _lastTabIndex = newIdx < 0 ? 0 : newIdx;
        currentTab = tab;
        if (followModeActive && tab !== 'preview') stopFollowMode();
        updateFollowBtnVisibility();
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
        const panel = document.querySelector('.bseas-panel');
        const _ft2 = panel?.querySelector('.bseas-footer');
        if (_ft2 && panel.classList.contains('show')) panel.style.setProperty('--bseas-footer-h', (_ft2.offsetHeight + 14) + 'px');
        const animTarget = document.querySelector('.bseas-tab-body');
        if (animTarget) {
            animTarget.classList.remove('anim-right', 'anim-left');
            void animTarget.offsetWidth;
            animTarget.classList.add(direction === 'right' ? 'anim-right' : 'anim-left');
        }
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
                <div class="bseas-content"><div class="bseas-sticky-top"><div class="bseas-header">
                    <div class="bseas-header-text">
                        <div class="bseas-title">B站字幕获取、AI分析及广告跳过</div>
                        <div class="bseas-subtitle-info">点击刷新</div>
                        <div class="bseas-ad-hint" id="bseas-ad-hint">广告跳过功能仅在进行AI分析后可用</div>
                    </div>
                    <div class="bseas-header-actions">
                        <button class="bseas-icon-btn" id="bseas-refresh-btn" title="刷新"><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>
                        <button class="bseas-icon-btn settings-btn" id="bseas-settings-btn" title="设置"><svg viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg></button>
                    </div>
                </div>
                <div class="bseas-api-warning-container">${showApiWarning ? `<div class="bseas-api-warning"><span class="bseas-api-warning-icon">⚠</span><span class="bseas-api-warning-text">未设置API Key，AI分析功能将无法使用</span><button class="bseas-api-warning-btn" id="bseas-go-settings">去设置</button></div>` : ''}</div>
                <div class="bseas-source-section"><div class="bseas-source-header" id="bseas-source-toggle"><span class="bseas-source-label">字幕</span><span class="bseas-source-arrow collapsed" id="bseas-source-arrow"><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></span></div><div class="bseas-collapse" id="bseas-source-collapse"><div class="bseas-collapse-inner"><div class="bseas-source-body" id="bseas-source-body"><div style="color:var(--bseas-text-dim);font-size:13px;">暂无数据</div></div></div></div></div>
                <div class="bseas-tabs"><button class="bseas-tab active" data-tab="preview">浏览</button><button class="bseas-tab" data-tab="ai">AI 分析</button><button class="bseas-tab" data-tab="text">文本</button></div></div><div class="bseas-tab-body"><div class="bseas-empty">正在初始化...</div></div></div>
                <button class="bseas-follow-btn" id="bseas-follow-btn" title="字幕跟随视频滚动"><svg viewBox="0 0 1024 1024"><path d="M882.734114 459.147258l0.024559-0.024559L244.016061 21.12718l-0.199545 0.188288C230.582097 8.748245 212.62819 1.014096 192.840518 1.014096c-40.704051 0-73.699536 32.66905-73.699536 72.996524 0 22.148439-0.954745 65.513086 0 64.572668l0 373.422851 0 393.071354c0 0.325411 0 25.249057 0 44.935422 0 40.302915 32.995485 72.972988 73.699536 72.972988 19.862373 0 37.892005-7.78429 51.125401-20.466124l0.050142 0.025583 638.742613-437.982216-0.024559-0.038886c13.886265-13.270235 22.549575-31.889291 22.549575-52.531424 0-0.050142 0-0.088004 0-0.150426 0-0.050142 0-0.11154 0-0.149403C905.28369 491.048829 896.620379 472.41647 882.734114 459.147258z"/></svg></button>
                <div class="bseas-footer">
                    <div id="bseas-footer-normal" style="display:flex;gap:12px;width:100%;">
                        <button class="bseas-btn bseas-btn-secondary" id="bseas-play-btn" disabled><svg viewBox="0 0 1024 1024" width="20" height="20"><path fill="currentColor" d="M882.734114 459.147258l0.024559-0.024559L244.016061 21.12718l-0.199545 0.188288C230.582097 8.748245 212.62819 1.014096 192.840518 1.014096c-40.704051 0-73.699536 32.66905-73.699536 72.996524 0 22.148439-0.954745 65.513086 0 64.572668l0 373.422851 0 393.071354c0 0.325411 0 25.249057 0 44.935422 0 40.302915 32.995485 72.972988 73.699536 72.972988 19.862373 0 37.892005-7.78429 51.125401-20.466124l0.050142 0.025583 638.742613-437.982216-0.024559-0.038886c13.886265-13.270235 22.549575-31.889291 22.549575-52.531424 0-0.050142 0-0.088004 0-0.150426 0-0.050142 0-0.11154 0-0.149403C905.28369 491.048829 896.620379 472.41647 882.734114 459.147258z"/></svg>播放</button>
                        <button class="bseas-btn bseas-btn-secondary" id="bseas-download-btn" disabled><svg viewBox="0 0 1024 1024" width="18" height="18"><path fill="currentColor" d="M498.347 824.32l-296.96-296.96c-11.947-11.947-3.414-34.133 13.653-34.133h160.427c11.946 0 20.48-8.534 20.48-20.48V54.613c0-11.946 8.533-20.48 20.48-20.48h189.44c11.946 0 20.48 8.534 20.48 20.48v418.134c0 11.946 8.533 20.48 20.48 20.48h160.426c18.774 0 27.307 22.186 13.654 34.133L525.653 824.32c-6.826 6.827-20.48 6.827-27.306 0zM916.48 989.867H107.52c-18.773 0-35.84-15.36-35.84-35.84 0-18.774 15.36-35.84 35.84-35.84h810.667c18.773 0 35.84 15.36 35.84 35.84-1.707 20.48-17.067 35.84-37.547 35.84z"/></svg>下载</button>
                        <button class="bseas-btn bseas-btn-primary" id="bseas-copy-btn" disabled><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>复制全部</button>
                    </div>
                    <div id="bseas-footer-settings" style="display:none;gap:12px;width:100%;">
                        <button class="bseas-btn bseas-btn-secondary" id="bseas-s-cancel">取消</button>
                        <button class="bseas-btn bseas-btn-primary" id="bseas-s-save">保存设置</button>
                    </div>
                </div>
                <div class="bseas-resize-edge left"></div><div class="bseas-resize-edge right"></div><div class="bseas-resize-edge bottom"></div>
            </div>
        `);
        document.body.appendChild(c);
        applySavedPanelPosition(c);
        makeDraggable(c);
        makeResizable(c);
        bindEvents(c);
        updateTriggerBtnColor();
        setInterval(updateTriggerBtnColor, 3000);
        if (hasUpdate) showUpdateBadgeInPanel();
        window.addEventListener('resize', () => {
            const container = document.querySelector('.bseas-container');
            if (!container) return;
            const panel = container.querySelector('.bseas-panel');
            if (panel) panel.classList.add('no-transition');
            applySavedPanelPosition(container);
            if (panel) requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.remove('no-transition')));
        });
    }
    function applySavedPanelPosition(container) {
        const panel = container.querySelector('.bseas-panel');
        if (!panel) return;

        const winW = document.documentElement.clientWidth;
        const winH = document.documentElement.clientHeight;
        const manualPos = GM_getValue('bseas_panel_position', null);
        const preset = GM_getValue('bseas_panel_pos_preset', 'top-right');
        const TRIGGER_W = 60;

        container.style.left = 'auto';
        container.style.right = 'auto';
        container.style.top = 'auto';
        container.style.bottom = 'auto';

        if (manualPos) {
            if (manualPos.side === 'left') {
                container.style.left = Math.max(8, Math.min(winW - TRIGGER_W - 8, manualPos.dist)) + 'px';
                container.style.right = 'auto';
                panel.style.left = '0';
                panel.style.right = 'auto';
            } else {
                container.style.right = Math.max(8, Math.min(winW - TRIGGER_W - 8, manualPos.dist)) + 'px';
                container.style.left = 'auto';
                panel.style.right = '0';
                panel.style.left = 'auto';
            }
            container.style.top = Math.max(8, Math.min(winH - TRIGGER_W - 8, manualPos.top)) + 'px';
            container.style.bottom = 'auto';
            if (manualPos.top < winH / 2) { panel.style.top = '66px'; panel.style.bottom = 'auto'; }
            else { panel.style.bottom = '66px'; panel.style.top = 'auto'; }
        } else {
            if (preset.includes('left')) {
                container.style.left = '24px';
                container.style.right = 'auto';
                panel.style.left = '0';
                panel.style.right = 'auto';
            } else {
                container.style.right = '24px';
                container.style.left = 'auto';
                panel.style.right = '0';
                panel.style.left = 'auto';
            }
            if (preset.includes('top')) {
                container.style.top = '80px';
                container.style.bottom = 'auto';
                panel.style.top = '66px';
                panel.style.bottom = 'auto';
            } else {
                container.style.bottom = '24px';
                container.style.top = 'auto';
                panel.style.bottom = '66px';
                panel.style.top = 'auto';
            }
        }
        const savedSize = GM_getValue('bseas_panel_size', null);
        if (savedSize && savedSize.w && savedSize.h) {
            const winW = document.documentElement.clientWidth;
            const winH = document.documentElement.clientHeight;
            const maxW = Math.min(winW - 40, 550);
            const maxH = Math.min(winH - 120, 1100);
            let w, h;
            if (savedSize.winW && savedSize.winH) {
                const wRatio = savedSize.w / savedSize.winW;
                const hRatio = savedSize.h / savedSize.winH;
                const ratioW = Math.round(wRatio * winW);
                const ratioH = Math.round(hRatio * winH);
                w = Math.max(340, Math.min(maxW, Math.round(savedSize.w + (ratioW - savedSize.w) * 0.45)));
                h = Math.max(320, Math.min(maxH, ratioH));
            } else {
                w = Math.max(340, Math.min(maxW, savedSize.w));
                h = Math.max(320, Math.min(maxH, savedSize.h));
            }
            panel.style.width = w + 'px';
            panel.style.height = h + 'px';
        } else {
            panel.style.width = '';
            panel.style.height = '';
        }
    }
    function makeResizable(container) {
        const panel = container.querySelector('.bseas-panel');
        if (!panel) return;
        const edges = panel.querySelectorAll('.bseas-resize-edge');
        if (!edges.length) return;
        if (_resizeDocHandlers) {
            document.removeEventListener('mousemove', _resizeDocHandlers.move);
            document.removeEventListener('mouseup', _resizeDocHandlers.up);
            window.removeEventListener('blur', _resizeDocHandlers.up);
        }
        let resizing = false, dir = '', startW = 0, startH = 0, startX = 0, startY = 0, startRectR = 0;
        const getTriggerSide = () => {
            const manualPos = GM_getValue('bseas_panel_position', null);
            const preset = GM_getValue('bseas_panel_pos_preset', 'top-right');
            if (manualPos) return manualPos.side;
            return preset.includes('left') ? 'left' : 'right';
        };
        const onDown = (e, edge) => {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            resizing = true;
            dir = edge.classList.contains('left') ? 'left' : (edge.classList.contains('right') ? 'right' : 'bottom');
            const rect = panel.getBoundingClientRect();
            startW = rect.width; startH = rect.height;
            startX = e.clientX; startY = e.clientY;
            startRectR = rect.right;
            panel.classList.add('no-transition');
            document.body.style.userSelect = 'none';
        };
        const onMove = (e) => {
            if (!resizing) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            const maxW = Math.min(document.documentElement.clientWidth - 40, 550);
            const maxH = Math.min(document.documentElement.clientHeight - 120, 1100);
            const triggerSide = getTriggerSide();
            if (dir === 'right') {
                const w = Math.max(340, Math.min(maxW, startW + dx));
                panel.style.width = w + 'px';
            } else if (dir === 'bottom') {
                const h = Math.max(320, Math.min(maxH, startH + dy));
                panel.style.height = h + 'px';
            } else if (dir === 'left') {
                const w = Math.max(340, Math.min(maxW, startW - dx));
                panel.style.width = w + 'px';
            }
            if (dir === 'left' || dir === 'right') {
                const curRect = panel.getBoundingClientRect();
                if (triggerSide === 'right') {
                    const shift = curRect.right - startRectR;
                    if (shift !== 0) {
                        let curLeft = parseFloat(panel.style.left) || 0;
                        if (panel.style.left === '' || panel.style.left === 'auto') curLeft = 0;
                        panel.style.left = (curLeft - shift) + 'px';
                        panel.style.right = 'auto';
                    }
                }
            }
            const _ft = panel.querySelector('.bseas-footer');
            if (_ft) panel.style.setProperty('--bseas-footer-h', (_ft.offsetHeight + 14) + 'px');
        };
        const onUp = () => {
            if (!resizing) return;
            resizing = false;
            document.body.style.userSelect = '';
            panel.classList.remove('no-transition');
            GM_setValue('bseas_panel_size', { w: panel.offsetWidth, h: panel.offsetHeight, winW: document.documentElement.clientWidth, winH: document.documentElement.clientHeight });
        };
        edges.forEach(edge => edge.addEventListener('mousedown', e => onDown(e, edge)));
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        window.addEventListener('blur', onUp);
        _resizeDocHandlers = { move: onMove, up: onUp };
    }
    function updateTriggerBtnColor() {
        const btn = document.querySelector('.bseas-trigger-btn');
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) { btn.classList.remove('on-dark'); return; }
        const container = btn.closest('.bseas-container');
        let el = null;
        try {
            if (container) container.style.pointerEvents = 'none';
            el = document.elementFromPoint(cx, cy);
        } finally {
            if (container) container.style.pointerEvents = '';
        }
        if (!el) { btn.classList.remove('on-dark'); return; }
        let bg = null;
        let cur = el;
        while (cur && cur !== document.documentElement) {
            if (cur.classList && cur.classList.contains('bseas-edit-overlay')) { cur = cur.parentElement; continue; }
            const s = getComputedStyle(cur);
            const c = s.backgroundColor;
            if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') {
                const tm = c.match(/rgba?\(([^)]+)\)/);
                if (tm) {
                    const tp = tm[1].split(',').map(p => parseFloat(p.trim()));
                    const alpha = tp.length === 4 ? tp[3] : 1;
                    if (alpha > 0.3) { bg = c; break; }
                }
            }
            cur = cur.parentElement;
        }
        if (!bg) { btn.classList.remove('on-dark'); return; }
        const m = bg.match(/rgba?\(([^)]+)\)/);
        if (!m) { btn.classList.remove('on-dark'); return; }
        const parts = m[1].split(',').map(p => parseFloat(p.trim()));
        const [R, G, B] = parts;
        const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
        if (lum < 0.5) btn.classList.add('on-dark');
        else btn.classList.remove('on-dark');
    }
    function makeDraggable(container) {
        const handle = container.querySelector('.bseas-header-text');
        const triggerBtn = container.querySelector('.bseas-trigger-btn');
        const panel = container.querySelector('.bseas-panel');
        _dragDocHandlers.forEach(h => {
            document.removeEventListener('mousemove', h.move);
            document.removeEventListener('mouseup', h.up);
            window.removeEventListener('blur', h.up);
        });
        _dragDocHandlers = [];
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
                    panel.classList.add('no-transition');
                    container.style.right = 'auto';
                    container.style.bottom = 'auto';
                    const rect = container.getBoundingClientRect();
                    container.style.left = rect.left + 'px';
                    container.style.top = rect.top + 'px';
                    document.body.style.userSelect = 'none';
                }
                if (isDragging) {
                    let x = e.clientX - offsetX, y = e.clientY - offsetY;
                    x = Math.max(8, Math.min(document.documentElement.clientWidth - container.offsetWidth - 8, x));
                    y = Math.max(8, Math.min(document.documentElement.clientHeight - 60, y));
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
                    const winW = document.documentElement.clientWidth;
                    let side, dist;
                    if (rect.left + rect.width / 2 < winW / 2) {
                        side = 'left';
                        dist = rect.left;
                    } else {
                        side = 'right';
                        dist = winW - rect.right;
                    }
                    GM_setValue('bseas_panel_position', { side, dist, top: rect.top });
                    applySavedPanelPosition(container);
                    requestAnimationFrame(() => requestAnimationFrame(() => { panel.classList.remove('no-transition'); }));
                    if (isTrigger) { element._wasDragged = true; updateTriggerBtnColor(); }
                }
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            window.addEventListener('blur', onMouseUp);
            _dragDocHandlers.push({ move: onMouseMove, up: onMouseUp });
        }
        if (handle) setupDrag(handle, false);
        if (triggerBtn) setupDrag(triggerBtn, true);
    }
    function saveSettings() {
        const get = (id, prop, fallback) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            const v = el[prop];
            return v === undefined ? fallback : v;
        };
        const val = (id, fb) => get(id, 'value', fb);
        const chk = (id, fb) => get(id, 'checked', fb);
        bseas_platform = val('bseas-s-platform', bseas_platform);
        bseas_api_url = (val('bseas-s-url', bseas_api_url) || '').trim();
        bseas_api_key = (val('bseas-s-key', bseas_api_key) || '').trim();
        const selectedModel = val('bseas-s-model-select', null);
        const customModel = (val('bseas-s-model-custom', '') || '').trim();
        bseas_model = selectedModel === '自定义' ? (customModel || bseas_model) : (selectedModel || bseas_model);
        bseas_auto_summary = chk('bseas-s-auto', bseas_auto_summary);
        bseas_opinion_analysis = chk('bseas-s-opinion', bseas_opinion_analysis);
        bseas_auto_skip_ad = chk('bseas-s-auto-skip', bseas_auto_skip_ad);
        bseas_auto_open_panel = chk('bseas-s-auto-open', bseas_auto_open_panel);
        bseas_auto_open_tab = val('bseas-s-auto-tab', bseas_auto_open_tab);
        bseas_save_tokens = chk('bseas-s-save-tokens', bseas_save_tokens);
        if (!bseas_save_tokens) {
            const dv = val('bseas-s-detail', null);
            if (dv) bseas_detail_level = dv;
            const oc = document.getElementById('bseas-s-opinion-count');
            if (oc) bseas_opinion_comments_count = parseInt(oc.value) || 30;
        }
        bseas_disable_api = chk('bseas-s-disable-api', bseas_disable_api);
        bseas_panel_pos_preset = val('bseas-s-pos-preset', bseas_panel_pos_preset);
        bseas_max_preview_subtitles = parseInt(val('bseas-s-max-preview', bseas_max_preview_subtitles)) || 600;
        bseas_confirm_enabled = chk('bseas-s-confirm-enable', bseas_confirm_enabled);
        bseas_confirm_chars = parseInt(val('bseas-s-confirm-chars', bseas_confirm_chars)) || 20000;
        bseas_ai_evaluation = chk('bseas-s-ai-evaluation', bseas_ai_evaluation);
        bseas_update_mode = val('bseas-s-update-mode', bseas_update_mode);
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
        GM_setValue('bseas_disable_api', bseas_disable_api);
        GM_setValue('bseas_panel_pos_preset', bseas_panel_pos_preset);
        GM_setValue('bseas_opinion_comments_count', bseas_opinion_comments_count);
        GM_setValue('bseas_max_preview_subtitles', bseas_max_preview_subtitles);
        GM_setValue('bseas_confirm_enabled', bseas_confirm_enabled);
        GM_setValue('bseas_confirm_chars', bseas_confirm_chars);
        GM_setValue('bseas_ai_evaluation', bseas_ai_evaluation);
        GM_setValue('bseas_update_mode', bseas_update_mode);
        GM_setValue('bseas_save_tokens', bseas_save_tokens);
        GM_deleteValue('bseas_panel_position');
    }
    function bindEvents(c) {
        const panel = c.querySelector('.bseas-panel');
        const triggerBtn = c.querySelector('.bseas-trigger-btn');
        panel.addEventListener('click', e => e.stopPropagation());
        if (triggerBtn) {
            triggerBtn.addEventListener('mousemove', (e) => {
                const r = triggerBtn.getBoundingClientRect();
                triggerBtn.style.setProperty('--bseas-mx', ((e.clientX - r.left) / r.width * 100) + '%');
                triggerBtn.style.setProperty('--bseas-my', ((e.clientY - r.top) / r.height * 100) + '%');
            });
        }
        let _closeTimer = null;
        function closePanelWithAnim() {
            if (!panelVisible) return;
            panel.classList.add('hiding');
            if (_closeTimer) clearTimeout(_closeTimer);
            _closeTimer = setTimeout(() => {
                panelVisible = false;
                panel.classList.remove('show', 'hiding');
            }, 220);
        }
        triggerBtn.addEventListener('click', (e) => {
            if (triggerBtn._wasDragged) { triggerBtn._wasDragged = false; e.preventDefault(); e.stopPropagation(); return; }
            e.stopPropagation();
            if (panelVisible) { closePanelWithAnim(); }
            else {
                if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
                panelVisible = true;
                panel.classList.remove('hiding');
                panel.classList.add('show');
                const _tb = panel.querySelector('.bseas-tab-body');
                if (_tb) _tb.classList.remove('anim-right', 'anim-left');
                const _ft = panel.querySelector('.bseas-footer');
                if (_ft) panel.style.setProperty('--bseas-footer-h', (_ft.offsetHeight + 14) + 'px');
                if (allSubtitles.length === 0) fetchAllSubtitles();
            }
        });
        if (_documentClickHandler) document.removeEventListener('click', _documentClickHandler);
        _documentClickHandler = e => {
            if (!panelVisible) return;
            if (c.contains(e.target)) return;
            if (e.target.closest && e.target.closest('.bseas-edit-overlay')) return;
            closePanelWithAnim();
        };
        document.addEventListener('click', _documentClickHandler);
        c.querySelector('#bseas-source-toggle').addEventListener('click', (e) => {
            e.stopPropagation();
            sourceCollapsed = !sourceCollapsed;
            c.querySelector('#bseas-source-collapse')?.classList.toggle('open', !sourceCollapsed);
            c.querySelector('#bseas-source-arrow').classList.toggle('collapsed', sourceCollapsed);
        });
        c.querySelectorAll('.bseas-tab').forEach(tab => tab.addEventListener('click', (e) => { e.stopPropagation(); switchTab(tab.dataset.tab); }));
        c.querySelector('#bseas-refresh-btn').addEventListener('click', e => { e.stopPropagation(); if (!isLoading) fetchAllSubtitles(true); });
        c.querySelector('#bseas-settings-btn').addEventListener('click', e => { e.stopPropagation(); switchTab(currentTab === 'settings' ? 'preview' : 'settings'); });
        c.querySelector('#bseas-go-settings')?.addEventListener('click', e => { e.stopPropagation(); switchTab('settings'); });
        c.querySelector('#bseas-copy-btn').addEventListener('click', () => { const t = getFormattedText(); if (t) { GM_setClipboard(t); showToast('✓ 已复制', 'success'); } });
        c.querySelector('#bseas-play-btn').addEventListener('click', e => { e.stopPropagation(); togglePlayMode(); });
        c.querySelector('#bseas-download-btn').addEventListener('click', e => { e.stopPropagation(); openDownloadMenu(); });
        c.querySelector('#bseas-follow-btn').addEventListener('click', e => { e.stopPropagation(); toggleFollowMode(); });
        c.querySelector('#bseas-s-cancel')?.addEventListener('click', (e) => { e.stopPropagation(); switchTab('preview'); });
        c.querySelector('#bseas-s-save')?.addEventListener('click', (e) => {
            e.stopPropagation();
            saveSettings();
            showToast('✓ 设置已保存', 'success');
            switchTab('preview');
            panelVisible = false;
            if (playModeActive) stopPlayMode();
            if (followModeActive) stopFollowMode();
            document.querySelector('.bseas-container')?.remove();
            createUI();
            setTimeout(() => fetchAllSubtitles(true), 200);
        });
    }
    function downloadSubtitle(format) {
        const text = format === 'srt' ? getSRTText() : getFormattedTextForDownload();
        if (!text) return;
        const title = sanitizeFilename(getVideoTitle());
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        a.download = `${title}.${format}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        showToast(`✓ ${format.toUpperCase()}下载成功`, 'success');
    }
    function openDownloadMenu() {
        if (!currentSubtitleData?.body?.length) { showToast('请先选择字幕', 'warning'); return; }
        const existing = document.querySelector('.bseas-edit-overlay.bseas-dl-overlay');
        if (existing) return;
        const overlay = document.createElement('div');
        overlay.className = 'bseas-edit-overlay bseas-dl-overlay';
        safeSetInnerHTML(overlay, `<div class="bseas-edit-modal" style="max-width:380px;"><div class="bseas-edit-modal-header"><span>下载字幕</span></div><div class="bseas-edit-modal-body" style="padding:20px;"><div class="bseas-dl-format-group"><label class="bseas-dl-option checked"><input type="radio" name="bseas-dl-format" value="txt" checked><span class="bseas-dl-option-content"><span class="bseas-dl-option-title">TXT 纯文本</span><span class="bseas-dl-option-desc">纯文字内容，便于阅读和复制</span></span></label><label class="bseas-dl-option"><input type="radio" name="bseas-dl-format" value="srt"><span class="bseas-dl-option-content"><span class="bseas-dl-option-title">SRT 字幕文件</span><span class="bseas-dl-option-desc">带时间轴，适合视频播放器加载</span></span></label></div><div class="bseas-dl-ts-row" id="bseas-dl-ts-row"><label class="bseas-dl-ts-label"><input type="checkbox" id="bseas-dl-ts" ${downloadShowTimestamps ? 'checked' : ''}><span>包含时间戳</span></label></div></div><div class="bseas-edit-modal-footer"><button class="bseas-edit-modal-btn cancel">取消</button><button class="bseas-edit-modal-btn save" id="bseas-dl-confirm">下载</button></div></div>`);
        document.body.appendChild(overlay);
        const tsRow = overlay.querySelector('#bseas-dl-ts-row');
        const updateTsVisibility = () => {
            const checked = overlay.querySelector('input[name="bseas-dl-format"]:checked');
            if (!checked) return;
            tsRow.style.display = checked.value === 'txt' ? 'flex' : 'none';
        };
        overlay.querySelectorAll('input[name="bseas-dl-format"]').forEach(r => r.addEventListener('change', () => {
            overlay.querySelectorAll('.bseas-dl-option').forEach(o => o.classList.remove('checked'));
            r.closest('.bseas-dl-option').classList.add('checked');
            updateTsVisibility();
        }));
        updateTsVisibility();
        overlay.querySelector('#bseas-dl-ts').addEventListener('change', e => {
            downloadShowTimestamps = e.target.checked;
            GM_setValue('bseas_download_show_timestamps', downloadShowTimestamps);
        });
        const closeDl = () => {
            const modal = overlay.querySelector('.bseas-edit-modal');
            if (modal) { modal.classList.add('closing'); overlay.classList.add('closing'); setTimeout(() => overlay.remove(), 200); }
            else overlay.remove();
            document.removeEventListener('keydown', escHandler);
        };
        overlay.querySelector('.bseas-edit-modal-btn.cancel').addEventListener('click', closeDl);
        overlay.querySelector('#bseas-dl-confirm').addEventListener('click', () => {
            const checked = overlay.querySelector('input[name="bseas-dl-format"]:checked');
            const fmt = checked ? checked.value : 'txt';
            closeDl();
            downloadSubtitle(fmt);
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) closeDl(); });
        const escHandler = e => { if (e.key === 'Escape') closeDl(); };
        document.addEventListener('keydown', escHandler);
    }

    let playModeActive = false;
    let playToastEl = null;
    let playCtrlEl = null;
    let playTimeupdateHandler = null;
    let playSecondSubtitle = null;
    let playOverlayEscHandler = null;
    let playVideoRef = null;
    let playOpacity = GM_getValue('bseas_play_opacity', 0.72);
    let playFontSize = GM_getValue('bseas_play_fontsize', 19);
    let playPosition = GM_getValue('bseas_play_position', '11%');
    let _playPreviewEl = null, _playPreviewMove = null, _playPreviewUp = null;
    let _playToastMove = null, _playToastUp = null;
    function isWebFullscreen() {
        return !!(document.querySelector('#bilibili-player.webfullscreen') || document.querySelector('.bpx-player-container--web-fullscreen') || document.querySelector('.bpx-player-container[data-screen="web"]'));
    }
    function enterWebFullscreen() {
        if (isWebFullscreen()) return;
        const sels = ['.bpx-player-ctrl-btn[data-screen="web"]', '.bpx-player-ctrl-web', '.squirtle-video-webfullscreen', '.bpx-player-ctrl-btn.bili-web-fullscreen', '[data-screen="web"]'];
        for (const s of sels) { const b = document.querySelector(s); if (b) { b.click(); return; } }
        try {
            const xp = '/html/body/div[2]/div[2]/div[1]/div[2]/div[2]/div/div/div[1]/div[1]/div[13]/div[2]/div[2]/div[3]/div[8]/div[1]';
            const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const n = r && r.singleNodeValue; if (n) { n.click(); }
        } catch (e) {}
    }
    function togglePlayMode() {
        if (playModeActive) { stopPlayMode(); return; }
        if (!currentSubtitleData?.body?.length) { showToast('请先选择字幕', 'warning'); return; }
        const video = document.querySelector('#bilibili-player video') || document.querySelector('video');
        if (!video) { showToast('未找到视频元素', 'warning'); return; }
        showPlayGuide(video);
    }
    function showPlayGuide(video) {
        const existing = document.querySelector('.bseas-play-guide-overlay');
        if (existing) { if (playOverlayEscHandler) { document.removeEventListener('keydown', playOverlayEscHandler); playOverlayEscHandler = null; } if (_playPreviewMove) document.removeEventListener('mousemove', _playPreviewMove); if (_playPreviewUp) document.removeEventListener('mouseup', _playPreviewUp); if (_playPreviewEl) _playPreviewEl.remove(); _playPreviewEl = _playPreviewMove = _playPreviewUp = null; existing.remove(); }
        const overlay = document.createElement('div');
        overlay.className = 'bseas-edit-overlay bseas-play-guide-overlay';
        const allOpts = allSubtitles.slice();
        const zhSub = allOpts.find(s => /^zh/i.test(s.lan) || /[\u4e00-\u9fa5]/.test(s.lan_doc || ''));
        const defaultFirstId = zhSub ? zhSub.id : (allOpts[0] ? allOpts[0].id : '');
        const otherOpts = allOpts.filter(s => String(s.id) !== String(defaultFirstId));
        const makeOpt = (s) => `<option value="${escapeHtml(String(s.id))}">${escapeHtml(s.lan_doc || s.lan || '')}</option>`;
        safeSetInnerHTML(overlay, `<div class="bseas-play-guide"><div class="bseas-play-guide-title">播放模式</div><div class="bseas-play-guide-desc">建议进入「网页全屏」（非全屏），悬浮控件可漂浮在视频上方。</div><div class="bseas-play-guide-row"><span class="bseas-play-guide-label">第一语言</span><select id="bseas-play-first">${allOpts.map(makeOpt).join('')}</select></div><div class="bseas-play-guide-row"><span class="bseas-play-guide-label">第二语言</span><select id="bseas-play-second"><option value="">关闭</option>${otherOpts.map(makeOpt).join('')}</select></div><div class="bseas-play-guide-row"><span class="bseas-play-guide-label">底色透明度</span><div class="bseas-play-guide-slider"><input type="range" id="bseas-play-opacity" min="0" max="1" step="0.05" value="${playOpacity}"><span id="bseas-play-opacity-val">${Math.round(playOpacity * 100)}%</span></div></div><div class="bseas-play-guide-row"><span class="bseas-play-guide-label">文字大小</span><div class="bseas-play-guide-slider"><input type="range" id="bseas-play-fontsize" min="12" max="36" step="1" value="${playFontSize}"><span id="bseas-play-fontsize-val">${playFontSize}px</span></div></div><div class="bseas-play-guide-btns"><button class="bseas-edit-modal-btn cancel" id="bseas-play-guide-cancel">取消</button><button class="bseas-edit-modal-btn save" id="bseas-play-guide-go">开始播放</button></div></div>`);
        document.body.appendChild(overlay);
        const firstSel = overlay.querySelector('#bseas-play-first');
        if (firstSel) firstSel.value = String(defaultFirstId);
        const secondSel = overlay.querySelector('#bseas-play-second');
        const rebuildSecondOpts = () => {
            if (!firstSel || !secondSel) return;
            const curFirst = firstSel.value;
            const curSecond = secondSel.value;
            const opts = allOpts.filter(s => String(s.id) !== String(curFirst));
            secondSel.innerHTML = `<option value="">关闭</option>${opts.map(makeOpt).join('')}`;
            if (opts.some(s => String(s.id) === String(curSecond))) secondSel.value = curSecond;
        };
        if (firstSel) firstSel.addEventListener('change', rebuildSecondOpts);
        const opacityInput = overlay.querySelector('#bseas-play-opacity');
        const opacityVal = overlay.querySelector('#bseas-play-opacity-val');
        const fontsizeInput = overlay.querySelector('#bseas-play-fontsize');
        const fontsizeVal = overlay.querySelector('#bseas-play-fontsize-val');
        const previewEl = document.createElement('div');
        previewEl.className = 'bseas-play-preview';
        previewEl.style.cssText = `position:fixed;bottom:${playPosition};left:50%;transform:translateX(-50%);background:rgba(0,0,0,${playOpacity});backdrop-filter:blur(8px) saturate(140%);-webkit-backdrop-filter:blur(8px) saturate(140%);color:#fff;padding:10px 28px;border-radius:10px;font-size:${playFontSize}px;font-weight:500;z-index:100040;white-space:nowrap;transition:background 0.15s, font-size 0.15s, bottom 0.15s;box-shadow:0 4px 20px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1);`;
        previewEl.textContent = '示例字幕预览效果';
        document.body.appendChild(previewEl);
        _playPreviewEl = previewEl;
        let pvDragging = false, pvStartY = 0, pvStartBottom = 0;
        const onPreviewMove = (e) => {
            if (!pvDragging) return;
            let nb = pvStartBottom - (e.clientY - pvStartY);
            nb = Math.max(24, Math.min(window.innerHeight - 80, nb));
            previewEl.style.bottom = nb + 'px';
        };
        const onPreviewUp = () => {
            if (!pvDragging) return;
            pvDragging = false;
            previewEl.classList.remove('no-transition');
            document.body.style.userSelect = '';
            const bpx = parseFloat(getComputedStyle(previewEl).bottom) || 0;
            playPosition = (bpx / window.innerHeight * 100).toFixed(1) + '%';
            GM_setValue('bseas_play_position', playPosition);
        };
        previewEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            pvDragging = true;
            previewEl.classList.add('no-transition');
            pvStartY = e.clientY;
            pvStartBottom = parseFloat(getComputedStyle(previewEl).bottom) || 0;
            document.body.style.userSelect = 'none';
        });
        document.addEventListener('mousemove', onPreviewMove);
        document.addEventListener('mouseup', onPreviewUp);
        _playPreviewMove = onPreviewMove; _playPreviewUp = onPreviewUp;
        const updatePreview = () => { previewEl.style.background = `rgba(0,0,0,${opacityInput.value})`; previewEl.style.fontSize = fontsizeInput.value + 'px'; };
        opacityInput.addEventListener('input', () => { opacityVal.textContent = Math.round(opacityInput.value * 100) + '%'; updatePreview(); });
        fontsizeInput.addEventListener('input', () => { fontsizeVal.textContent = fontsizeInput.value + 'px'; updatePreview(); });
        let guideCancelled = false;
        const closeGuide = (byUser) => { if (byUser) guideCancelled = true; document.removeEventListener('keydown', playOverlayEscHandler); playOverlayEscHandler = null; document.removeEventListener('mousemove', onPreviewMove); document.removeEventListener('mouseup', onPreviewUp); _playPreviewEl = _playPreviewMove = _playPreviewUp = null; previewEl.classList.add('closing'); overlay.querySelector('.bseas-play-guide')?.classList.add('closing'); overlay.classList.add('closing'); setTimeout(() => { previewEl.remove(); overlay.remove(); }, 200); };
        overlay.querySelector('#bseas-play-guide-cancel').addEventListener('click', () => closeGuide(true));
        overlay.querySelector('#bseas-play-guide-go').addEventListener('click', async (e) => {
            const goBtn = e.currentTarget;
            if (goBtn.disabled) return;
            goBtn.disabled = true;
            playOpacity = parseFloat(opacityInput.value);
            playFontSize = parseInt(fontsizeInput.value, 10);
            GM_setValue('bseas_play_opacity', playOpacity);
            GM_setValue('bseas_play_fontsize', playFontSize);
            const firstId = firstSel ? firstSel.value : '';
            const secondId = overlay.querySelector('#bseas-play-second').value;
            const firstSub = firstId ? allSubtitles.find(s => String(s.id) === String(firstId)) : currentSubtitleData;
            playSecondSubtitle = secondId ? allSubtitles.find(s => String(s.id) === String(secondId)) : null;
            if (playSecondSubtitle && !playSecondSubtitle.body?.length && playSecondSubtitle.subtitle_url) {
                playSecondSubtitle.body = await fetchSubtitleContent(playSecondSubtitle.subtitle_url);
            }
            if (guideCancelled) return;
            closeGuide(false);
            enterWebFullscreen();
            if (firstSub && !firstSub.body?.length && firstSub.subtitle_url) {
                setLoadingState(true);
                firstSub.body = await fetchSubtitleContent(firstSub.subtitle_url);
                setLoadingState(false);
            }
            if (!firstSub?.body?.length) { showToast('字幕内容加载失败，请重试', 'error'); return; }
            startPlayMode(video, firstSub);
        });
        overlay.addEventListener('click', e => { if (e.target === overlay) closeGuide(true); });
        playOverlayEscHandler = e => { if (e.key === 'Escape') closeGuide(true); };
        document.addEventListener('keydown', playOverlayEscHandler);
    }
    function startPlayMode(video, firstSub) {
        playModeActive = true;
        playVideoRef = video;
        const playBtn = document.getElementById('bseas-play-btn');
        if (playBtn) { playBtn.classList.remove('bseas-btn-secondary'); playBtn.classList.add('bseas-btn-primary'); }
        if (firstSub && firstSub !== currentSubtitleData) {
            currentSubtitleData = firstSub;
            selectedSubtitleId = firstSub.id;
        }
        playToastEl = document.createElement('div');
        playToastEl.className = 'bseas-play-toast empty';
        playToastEl.style.background = `rgba(0,0,0,${playOpacity})`;
        playToastEl.style.fontSize = playFontSize + 'px';
        playToastEl.style.bottom = playPosition;
        document.body.appendChild(playToastEl);
        let ptDragging = false, ptStartY = 0, ptStartBottom = 0;
        playToastEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            ptDragging = true;
            playToastEl.classList.add('no-transition');
            ptStartY = e.clientY;
            ptStartBottom = parseFloat(getComputedStyle(playToastEl).bottom) || 0;
            document.body.style.userSelect = 'none';
        });
        const onPtMove = (e) => {
            if (!ptDragging) return;
            let nb = ptStartBottom - (e.clientY - ptStartY);
            nb = Math.max(24, Math.min(window.innerHeight - 80, nb));
            playToastEl.style.bottom = nb + 'px';
        };
        const onPtUp = () => {
            if (!ptDragging) return;
            ptDragging = false;
            playToastEl.classList.remove('no-transition');
            document.body.style.userSelect = '';
            if (!playToastEl) return;
            const bpx = parseFloat(getComputedStyle(playToastEl).bottom) || 0;
            playPosition = (bpx / window.innerHeight * 100).toFixed(1) + '%';
            GM_setValue('bseas_play_position', playPosition);
        };
        document.addEventListener('mousemove', onPtMove);
        document.addEventListener('mouseup', onPtUp);
        _playToastMove = onPtMove; _playToastUp = onPtUp;
        playTimeupdateHandler = () => updatePlayToast(video);
        video.addEventListener('timeupdate', playTimeupdateHandler);
        updatePlayToast(video);
    }
    function updatePlayToast(video) {
        if (!playToastEl) return;
        const t = video.currentTime;
        const findLine = (data) => {
            if (!data?.body) return '';
            const item = data.body.find(it => t >= it.from && t <= it.to);
            return item ? (item.content || '') : '';
        };
        const line1 = findLine(currentSubtitleData);
        const line2 = playSecondSubtitle ? findLine(playSecondSubtitle) : '';
        if (!line1 && !line2) {
            playToastEl.classList.add('empty');
        } else {
            playToastEl.classList.remove('empty');
            let html = '';
            if (line1) html += `<div class="bseas-play-line1">${escapeHtml(line1)}</div>`;
            if (line2) html += `<div class="bseas-play-line2">${escapeHtml(line2)}</div>`;
            safeSetInnerHTML(playToastEl, html);
        }
    }
    function stopPlayMode() {
        playModeActive = false;
        const playBtn = document.getElementById('bseas-play-btn');
        if (playBtn) { playBtn.classList.remove('bseas-btn-primary'); playBtn.classList.add('bseas-btn-secondary'); }
        if (playVideoRef && playTimeupdateHandler) playVideoRef.removeEventListener('timeupdate', playTimeupdateHandler);
        playVideoRef = null;
        playTimeupdateHandler = null;
        playSecondSubtitle = null;
        if (_playToastMove) { document.removeEventListener('mousemove', _playToastMove); _playToastMove = null; }
        if (_playToastUp) { document.removeEventListener('mouseup', _playToastUp); _playToastUp = null; }
        if (playToastEl) { playToastEl.remove(); playToastEl = null; }
        if (playCtrlEl) { playCtrlEl.remove(); playCtrlEl = null; }
    }

    let followModeActive = false;
    let followTimeupdateHandler = null;
    let followCheckInterval = null;
    let followVideoRef = null;
    let followLastIdx = -1;
    function toggleFollowMode() {
        if (followModeActive) { stopFollowMode(); return; }
        const video = document.querySelector('#bilibili-player video') || document.querySelector('video');
        if (!video) { showToast('未找到视频元素', 'warning'); return; }
        if (!currentSubtitleData?.body?.length) { showToast('请先选择字幕', 'warning'); return; }
        if (currentTab !== 'preview') { showToast('请先切换到浏览页', 'warning'); return; }
        startFollowMode(video);
    }
    function startFollowMode(video) {
        followModeActive = true;
        followVideoRef = video;
        followLastIdx = -1;
        const btn = document.getElementById('bseas-follow-btn');
        if (btn) btn.classList.add('active');
        followTimeupdateHandler = () => scrollFollowToCurrent(video);
        video.addEventListener('timeupdate', followTimeupdateHandler);
        scrollFollowToCurrent(video);
        showToast('字幕跟随已开启', 'success');
    }
    function scrollFollowToCurrent(video) {
        if (!followModeActive || currentTab !== 'preview' || !panelVisible) return;
        const content = document.querySelector('.bseas-content');
        if (!content) return;
        const body = currentSubtitleData?.body;
        if (!body?.length) return;
        const t = video.currentTime;
        let idx = -1;
        for (let i = 0; i < body.length; i++) {
            if (t >= body[i].from && t <= body[i].to) { idx = i; break; }
        }
        if (idx === -1) {
            for (let i = body.length - 1; i >= 0; i--) {
                if (body[i].to < t) { idx = i; break; }
            }
        }
        if (idx === -1) idx = 0;
        if (idx === followLastIdx) return;
        followLastIdx = idx;
        const limit = currentPreviewLimit > 0 ? currentPreviewLimit : bseas_max_preview_subtitles;
        if (idx >= limit) {
            currentPreviewLimit = Math.ceil((idx + 1) / bseas_max_preview_subtitles) * bseas_max_preview_subtitles;
            updatePreviewList();
        }
        const items = content.querySelectorAll('.bseas-subtitle-item');
        const target = items[idx];
        if (!target) return;
        content.querySelectorAll('.bseas-subtitle-item.current-follow').forEach(el => el.classList.remove('current-follow'));
        target.classList.add('current-follow');
        const targetTop = target.offsetTop;
        const targetH = target.clientHeight;
        content.scrollTo({
            top: targetTop - content.clientHeight / 2 + targetH / 2,
            behavior: 'smooth'
        });
    }
    function stopFollowMode() {
        followModeActive = false;
        const btn = document.getElementById('bseas-follow-btn');
        if (btn) btn.classList.remove('active');
        if (followVideoRef && followTimeupdateHandler) followVideoRef.removeEventListener('timeupdate', followTimeupdateHandler);
        followVideoRef = null;
        followTimeupdateHandler = null;
        followLastIdx = -1;
        document.querySelectorAll('.bseas-subtitle-item.current-follow').forEach(el => el.classList.remove('current-follow'));
    }
    function updateFollowBtnVisibility() {
        const btn = document.getElementById('bseas-follow-btn');
        if (!btn) return;
        const shouldShow = panelVisible && currentTab === 'preview' && !!currentSubtitleData?.body?.length;
        if (!shouldShow) { btn.style.display = 'none'; return; }
        if (followModeActive) { btn.style.display = 'flex'; return; }
        const video = document.querySelector('#bilibili-player video') || document.querySelector('video');
        const videoPlaying = video && !video.paused && !video.ended && video.readyState >= 2;
        btn.style.display = videoPlaying ? 'flex' : 'none';
    }
    function startFollowCheck() {
        if (followCheckInterval) clearInterval(followCheckInterval);
        followCheckInterval = setInterval(updateFollowBtnVisibility, 1000);
    }

    // ===================== 18. 文本格式化 =====================
    function getFormattedText() {
        if (!currentSubtitleData?.body) return '';
        return currentSubtitleData.body.map(it => textShowTimestamps ? `[${formatTimeWithMs(it.from)} - ${formatTimeWithMs(it.to)}] ${it.content}` : it.content).join('\n');
    }
    function getFormattedTextForDownload() {
        if (!currentSubtitleData?.body) return '';
        return currentSubtitleData.body.map(it => downloadShowTimestamps ? `[${formatTimeWithMs(it.from)} - ${formatTimeWithMs(it.to)}] ${it.content}` : it.content).join('\n');
    }
    function getSRTText() {
        if (!currentSubtitleData?.body) return '';
        return currentSubtitleData.body.map((it, index) => `${index + 1}\n${formatTimeForSRT(it.from)} --> ${formatTimeForSRT(it.to)}\n${it.content}\n`).join('\n');
    }
    function getTimestampedTextForAI() {
        if (!currentSubtitleData?.body) return '';
        return currentSubtitleData.body.map(it => `[${formatTime(it.from)} - ${formatTime(it.to)}] ${it.content}`).join('\n');
    }
    function getPlainSubtitleText() {
        if (!currentSubtitleData?.body) return '';
        return currentSubtitleData.body.map(it => it.content).join('\n');
    }
    function subtitleContainsAdKeyword() {
        if (!currentSubtitleData?.body) return false;
        const text = currentSubtitleData.body.map(it => it.content).join('\n');
        return AD_KEYWORD_LIST.some(keyword => keyword.split(/\s+/).filter(Boolean).some(tok => text.includes(tok)));
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
        const playBtn = document.querySelector('#bseas-play-btn');
        const dlBtn = document.querySelector('#bseas-download-btn');
        const sb = document.querySelector('#bseas-source-body');
        if (sb) {
            if (allSubtitles.length > 0) {
                const optsHtml = allSubtitles.map(s => {
                    let tag;
                    if (s.isUserEdited) {
                        tag = `<span class="bseas-tag ai bseas-tag-check"><svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></span>`;
                    } else if (s.id === 'ai-corrected') {
                        tag = (s.editMethod === 'manual'
                            ? `<span class="bseas-tag ai bseas-tag-check"><svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></span>`
                            : `<span class="bseas-tag ai bseas-tag-check"><svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>`);
                    } else {
                        tag = `<span class="bseas-tag ${s.isAI ? 'ai' : 'cc'}">${s.isAI ? 'AI' : 'CC'}</span>`;
                    }
                    const delBtn = s.isUserEdited ? `<span class="bseas-subtitle-del" data-del-id="${escapeHtml(s.id)}" title="删除此字幕"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></span>` : '';
                    return `<div class="bseas-subtitle-option ${s.id === selectedSubtitleId ? 'active' : ''}" data-id="${escapeHtml(s.id)}">${escapeHtml(s.lan_doc)}${tag}${delBtn}</div>`;
                }).join('');
                const showEditBtn = currentSubtitleData?.body?.length;
                const showCorrectBtn = currentSubtitleData?.body?.length && currentSubtitleData?.id !== 'ai-corrected' && !currentSubtitleData?.isUserEdited;
                let btnsHtml = '<div class="bseas-correct-btns">';
                if (showEditBtn) {
                    btnsHtml += `<div class="bseas-correct-op edit" id="bseas-edit-subtitle-btn"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg><span>编辑字幕</span></div>`;
                }
                if (showCorrectBtn) {
                    btnsHtml += `<div class="bseas-correct-op${bseas_disable_api ? ' disabled' : ''}" id="bseas-ai-correct-btn"${bseas_disable_api ? ' title="此功能在「禁用 API」启用时不可用"' : ''}><div class="bseas-correct-progress"></div><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><span>AI修正字幕</span></div>`;
                }
                btnsHtml += `<div class="bseas-correct-op edit" id="bseas-new-subtitle-btn"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg><span>导入字幕</span></div>`;
                btnsHtml += '</div>';
                safeSetInnerHTML(sb, optsHtml + btnsHtml);
                sb.querySelectorAll('.bseas-subtitle-option[data-id]').forEach(o => o.addEventListener('click', (e) => {
                    if (e.target.closest('.bseas-subtitle-del')) return;
                    e.stopPropagation();
                    const s = allSubtitles.find(x => String(x.id) === String(o.dataset.id));
                    if (s) loadSubtitle(s);
                }));
                sb.querySelectorAll('.bseas-subtitle-del[data-del-id]').forEach(d => d.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = d.dataset.delId;
                    deleteUserSubtitleItem(currentVideoKey, id);
                    const idx = allSubtitles.findIndex(s => String(s.id) === String(id));
                    if (idx >= 0) allSubtitles.splice(idx, 1);
                    if (String(selectedSubtitleId) === String(id)) {
                        selectedSubtitleId = null;
                        currentSubtitleData = null;
                        if (allSubtitles.length > 0) loadSubtitle(allSubtitles[0]);
                        else updateUI();
                    } else {
                        updateUI();
                    }
                    showToast('已删除该字幕', 'success');
                }));
                document.getElementById('bseas-ai-correct-btn')?.addEventListener('click', (e) => { e.stopPropagation(); if (e.currentTarget.classList.contains('disabled')) return; runAICorrectSubtitle(); });
                document.getElementById('bseas-edit-subtitle-btn')?.addEventListener('click', (e) => { e.stopPropagation(); openSubtitleEditor(); });
                document.getElementById('bseas-new-subtitle-btn')?.addEventListener('click', (e) => { e.stopPropagation(); openSRTPasteDialog(); });
            } else {
                safeSetInnerHTML(sb, '<div style="color:var(--bseas-text-dim);font-size:13px;padding-bottom:8px;">未检测到可用字幕</div><div class="bseas-correct-btns"><div class="bseas-correct-op edit" id="bseas-new-subtitle-btn"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg><span>导入字幕</span></div></div>');
                document.getElementById('bseas-new-subtitle-btn')?.addEventListener('click', (e) => { e.stopPropagation(); openSRTPasteDialog(); });
            }
        }
        if (currentSubtitleData?.body) {
            if (info) info.textContent = `成功解析 ${currentSubtitleData.body.length} 条字幕 · ${hotComments.length} 条评论${bseas_save_tokens ? ' · 省 Tokens' : ''}`;
            if (copyBtn) copyBtn.disabled = false;
            if (playBtn) playBtn.disabled = false;
            if (dlBtn) dlBtn.disabled = false;
        } else if (!isLoading) {
            if (info) info.textContent = allSubtitles.length === 0 ? '此视频暂无字幕' : '准备就绪';
        }
        updateDotState();
    }
    function updateContent() {
        const el = document.querySelector('.bseas-tab-body');
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
    function toHalfWidth(str) {
        return str.replace(/[\uFF01-\uFF5E\u3000]/g, function(ch) {
            if (ch === '\u3000') return ' ';
            return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
        });
    }
    function numberToChinese(num) {
        if (num === 0) return '零';
        if (num < 0) return '负' + numberToChinese(-num);
        const digits = ['零','一','二','三','四','五','六','七','八','九'];
        const units = [{v:1e8,u:'亿'},{v:1e4,u:'万'},{v:1e3,u:'千'},{v:1e2,u:'百'},{v:10,u:'十'}];
        let result = '', needZero = false;
        for (const {v, u} of units) {
            if (num >= v) {
                const n = Math.floor(num / v);
                if (needZero) { result += '零'; needZero = false; }
                result += (v === 10 && n === 1 && !result) ? u : (numberToChinese(n) + u);
                num = num % v;
            } else if (result) {
                needZero = true;
            }
        }
        if (num > 0) { if (needZero) result += '零'; result += digits[num]; }
        return result;
    }
    function chineseToNumber(str) {
        const digitMap = {'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'两':2};
        const unitMap = {'十':10,'百':100,'千':1000,'万':10000,'亿':100000000};
        let result = 0, current = 0;
        for (const ch of str) {
            if (ch in digitMap) {
                current = digitMap[ch];
            } else if (ch in unitMap) {
                if (current === 0) current = 1;
                if (ch === '万' || ch === '亿') {
                    result = (result + current) * unitMap[ch];
                    current = 0;
                } else {
                    result += current * unitMap[ch];
                    current = 0;
                }
            }
        }
        return result + current;
    }
    function isNumberMatch(content, keyword) {
        if (/^\d+$/.test(keyword)) {
            const chinese = numberToChinese(parseInt(keyword, 10));
            if (chinese && content.includes(chinese)) return true;
        }
        if (/^[零一二三四五六七八九十百千万亿两]+$/.test(keyword)) {
            const num = chineseToNumber(keyword);
            if (!isNaN(num) && num > 0 && content.includes(String(num))) return true;
        }
        return false;
    }
    function isPinyinMatch(content, keyword) {
        if (typeof pinyinPro === 'undefined') return false;
        if (!/^[a-z]+$/.test(keyword)) return false;
        try {
            const chineseChars = [...content].filter(ch => /[\u4e00-\u9fff]/.test(ch));
            if (chineseChars.length === 0) return false;
            const contentPinyin = pinyinPro.pinyin(chineseChars.join(''), { toneType: 'none' }).split(/\s+/);
            return contentPinyin.some(py => py === keyword || py.startsWith(keyword));
        } catch (e) { return false; }
    }
    function isHomophoneMatch(content, token) {
        if (typeof pinyinPro === 'undefined') return false;
        if (!/[\u4e00-\u9fff]/.test(token)) return false;
        try {
            const tokenPy = pinyinPro.pinyin(token, { toneType: 'none' }).trim();
            if (!tokenPy) return false;
            const chineseChars = [...content].filter(ch => /[\u4e00-\u9fff]/.test(ch));
            if (chineseChars.length === 0) return false;
            const contentPinyin = pinyinPro.pinyin(chineseChars.join(''), { toneType: 'none' }).split(/\s+/);
            return contentPinyin.some(py => py === tokenPy);
        } catch (e) { return false; }
    }
    function isTimeFormat(str) {
        return /^\d{1,2}[:：]\d{1,2}([:：]\d{1,2})?$/.test(str.trim());
    }
    function normalizeTimePattern(str) {
        const normalized = str.trim().replace(/：/g, ':');
        const parts = normalized.split(':').map(p => parseInt(p, 10));
        if (parts.length === 2) return `${parts[0]}:${parts[1].toString().padStart(2, '0')}`;
        if (parts.length === 3) { const totalSec = parts[0] * 3600 + parts[1] * 60 + parts[2]; return formatTime(totalSec); }
        return null;
    }
    function isTimeMatch(item, keyword) {
        if (!isTimeFormat(keyword)) return false;
        const pattern = normalizeTimePattern(keyword);
        if (!pattern) return false;
        const timeStr = formatTime(item.from) + ' ' + formatTime(item.to);
        return timeStr.includes(pattern);
    }
    function tokenizeExpanded(keyword) {
        const normalized = toHalfWidth(keyword).toLowerCase();
        const tokens = [];
        let buffer = '';
        for (const ch of normalized) {
            if (/[\u4e00-\u9fff]/.test(ch)) {
                if (buffer) { tokens.push(buffer); buffer = ''; }
                tokens.push(ch);
            } else if (/[a-z0-9:]/.test(ch)) {
                buffer += ch;
            } else {
                if (buffer) { tokens.push(buffer); buffer = ''; }
            }
        }
        if (buffer) tokens.push(buffer);
        return tokens;
    }
    function isExpandedTokenMatch(content, item, token) {
        if (content.includes(token)) return true;
        const isChinese = /[\u4e00-\u9fff]/.test(token);
        const isLatin = /^[a-z0-9]+$/.test(token);
        if (isChinese) {
            if (isHomophoneMatch(content, token)) return true;
            if (isNumberMatch(content, token)) return true;
        }
        if (isLatin) {
            if (isPinyinMatch(content, token)) return true;
            if (isNumberMatch(content, token)) return true;
        }
        if (isTimeMatch(item, token)) return true;
        return false;
    }
    function findHomophoneChars(content, token) {
        if (typeof pinyinPro === 'undefined') return [];
        if (!/[\u4e00-\u9fff]/.test(token)) return [];
        try {
            const tokenPy = pinyinPro.pinyin(token, { toneType: 'none' }).trim();
            if (!tokenPy) return [];
            const chars = [...content];
            const chineseChars = chars.filter(ch => /[\u4e00-\u9fff]/.test(ch));
            if (chineseChars.length === 0) return [];
            const contentPinyin = pinyinPro.pinyin(chineseChars.join(''), { toneType: 'none' }).split(/\s+/);
            const result = [];
            for (let i = 0; i < chineseChars.length; i++) {
                if (contentPinyin[i] === tokenPy) result.push(chineseChars[i]);
            }
            return result;
        } catch (e) { return []; }
    }
    function findPinyinChars(content, token) {
        if (typeof pinyinPro === 'undefined') return [];
        if (!/^[a-z]+$/.test(token)) return [];
        try {
            const chars = [...content];
            const chineseChars = chars.filter(ch => /[\u4e00-\u9fff]/.test(ch));
            if (chineseChars.length === 0) return [];
            const contentPinyin = pinyinPro.pinyin(chineseChars.join(''), { toneType: 'none' }).split(/\s+/);
            const result = [];
            for (let i = 0; i < chineseChars.length; i++) {
                const py = contentPinyin[i];
                if (py && (py === token || py.startsWith(token))) result.push(chineseChars[i]);
            }
            return result;
        } catch (e) { return []; }
    }
    function getNumberHighlightTexts(content, token) {
        const result = [];
        if (/^\d+$/.test(token)) {
            const chinese = numberToChinese(parseInt(token, 10));
            if (chinese && content.includes(chinese)) result.push(chinese);
        }
        if (/^[零一二三四五六七八九十百千万亿两]+$/.test(token)) {
            const num = chineseToNumber(token);
            if (!isNaN(num) && num > 0 && content.includes(String(num))) result.push(String(num));
            const digitMap = {'零':'0','一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','两':'2'};
            if (token in digitMap && content.includes(digitMap[token])) result.push(digitMap[token]);
        }
        return result;
    }
    function highlightKeyword(text, keyword) {
        if (!keyword) return escapeHtml(text);
        const normalizedText = toHalfWidth(text);
        if (!expandedSearch) {
            const keywords = keyword.split(/\s+/).filter(Boolean).map(kw =>
                toHalfWidth(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            );
            if (keywords.length === 0) return escapeHtml(normalizedText);
            const raw = normalizedText.replace(new RegExp(keywords.join('|'), 'gi'), m => `\x00${m}\x01`);
            return escapeHtml(raw).replace(/\x00/g, '<mark>').replace(/\x01/g, '</mark>');
        }
        const tokens = tokenizeExpanded(keyword);
        const highlightSet = new Set();
        const lowerContent = normalizedText.toLowerCase();
        for (const token of tokens) {
            if (lowerContent.includes(token)) highlightSet.add(token);
            const isChinese = /[\u4e00-\u9fff]/.test(token);
            const isLatin = /^[a-z0-9]+$/.test(token);
            if (isChinese) {
                findHomophoneChars(lowerContent, token).forEach(h => highlightSet.add(h));
                getNumberHighlightTexts(lowerContent, token).forEach(h => highlightSet.add(h));
            }
            if (isLatin) {
                findPinyinChars(lowerContent, token).forEach(h => highlightSet.add(h));
                getNumberHighlightTexts(lowerContent, token).forEach(h => highlightSet.add(h));
            }
        }
        if (highlightSet.size === 0) return escapeHtml(normalizedText);
        const highlights = Array.from(highlightSet).filter(h => h && h.length > 0).sort((a, b) => b.length - a.length);
        const escapedHighlights = highlights.map(h => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const raw = normalizedText.replace(new RegExp(escapedHighlights.join('|'), 'gi'), m => `\x00${m}\x01`);
        return escapeHtml(raw).replace(/\x00/g, '<mark>').replace(/\x01/g, '</mark>');
    }
    function highlightTime(item, keyword) {
        const fromStr = formatTime(item.from);
        const toStr = formatTime(item.to);
        let html = `${fromStr} → ${toStr}`;
        if (!expandedSearch || !keyword) return html;
        const tokens = tokenizeExpanded(keyword);
        for (const token of tokens) {
            if (isTimeFormat(token)) {
                const pattern = normalizeTimePattern(token);
                if (pattern) {
                    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    html = html.replace(new RegExp(escapedPattern, 'gi'), m => `<mark>${m}</mark>`);
                }
            }
        }
        return html;
    }
    function filterSubtitles(body) {
        if (!subtitleSearchKeyword) return body;
        if (!expandedSearch) {
            const keywords = subtitleSearchKeyword.split(/\s+/).filter(Boolean).map(kw => toHalfWidth(kw).toLowerCase());
            if (keywords.length === 0) return body;
            let source = body.filter(it => !it.content.includes('\u266a') && !it.content.includes('\u266b'));
            return source.filter(it => {
                const content = toHalfWidth(it.content).toLowerCase();
                return keywords.every(kw => content.includes(kw));
            });
        }
        const tokens = tokenizeExpanded(subtitleSearchKeyword);
        if (tokens.length === 0) return body;
        return body.filter(it => {
            const content = toHalfWidth(it.content).toLowerCase();
            return tokens.some(token => isExpandedTokenMatch(content, it, token));
        });
    }
    function buildSubtitleListHtml(filtered) {
        const limit = currentPreviewLimit > 0 ? currentPreviewLimit : bseas_max_preview_subtitles;
        const listHtml = filtered.slice(0, limit).map(it => `<div class="bseas-subtitle-item" data-time="${escapeHtml(it.from)}"><div class="bseas-ts">${highlightTime(it, subtitleSearchKeyword)}</div><div class="bseas-st">${highlightKeyword(it.content, subtitleSearchKeyword)}</div></div>`).join('');
        let footer = '';
        if (filtered.length > limit) {
            footer = `<div style="text-align:center;padding:14px;font-size:13px;"><span id="bseas-load-more" style="color:#00a1d6;text-decoration:underline;cursor:pointer;">继续加载</span></div>`;
        } else if (subtitleSearchKeyword && filtered.length === 0) {
            footer = '<div class="bseas-empty">未匹配到字幕</div>';
        }
        if (subtitleSearchKeyword && !expandedSearch) {
            footer += `<div style="text-align:center;padding:14px;font-size:13px;"><span id="bseas-expand-search" style="color:#00a1d6;text-decoration:underline;cursor:pointer;">扩大搜索</span></div>`;
        } else if (subtitleSearchKeyword && expandedSearch) {
            footer += `<div style="text-align:center;padding:14px;font-size:13px;"><span id="bseas-restore-search" style="color:#00a1d6;text-decoration:underline;cursor:pointer;">恢复普通搜索</span></div>`;
        }
        return listHtml + footer;
    }
    function bindSubtitleItemClicks(container) {
        container.querySelectorAll('.bseas-subtitle-item').forEach(item => item.addEventListener('click', (e) => { e.stopPropagation(); seekToTime(parseFloat(item.dataset.time)); }));
    }
    function bindLoadMoreClick(container) {
        container.querySelector('#bseas-load-more')?.addEventListener('click', () => {
            currentPreviewLimit = (currentPreviewLimit > 0 ? currentPreviewLimit : bseas_max_preview_subtitles) + bseas_max_preview_subtitles;
            updatePreviewList();
        });
    }
    function bindExpandSearchClick(container) {
        container.querySelector('#bseas-expand-search')?.addEventListener('click', () => {
            expandedSearch = true;
            currentPreviewLimit = 0;
            updatePreviewList();
            scrollToPreviewTop();
        });
        container.querySelector('#bseas-restore-search')?.addEventListener('click', () => {
            expandedSearch = false;
            currentPreviewLimit = 0;
            updatePreviewList();
            scrollToPreviewTop();
        });
    }
    function scrollToPreviewTop() {
        const content = document.querySelector('.bseas-content');
        if (content) content.scrollTop = 0;
    }
    function updatePreviewList() {
        const el = document.querySelector('.bseas-content');
        if (!el || currentTab !== 'preview') return;
        const body = currentSubtitleData?.body || [];
        const filtered = filterSubtitles(body);
        const listContainer = el.querySelector('#bseas-subtitle-list-container');
        if (listContainer) {
            safeSetInnerHTML(listContainer, buildSubtitleListHtml(filtered));
            bindSubtitleItemClicks(listContainer);
            bindLoadMoreClick(listContainer);
            bindExpandSearchClick(listContainer);
        }
        const countEl = el.querySelector('.bseas-search-count');
        if (countEl) {
            countEl.textContent = subtitleSearchKeyword ? `${filtered.length} 条` : '';
        }
        const clearBtn = el.querySelector('#bseas-search-clear');
        if (clearBtn) { clearBtn.style.display = subtitleSearchKeyword ? 'flex' : 'none'; }
    }
    function renderPreviewTab(el) {
        if (!currentSubtitleData?.body?.length) { safeSetInnerHTML(el, '<div class="bseas-empty">未获取到字幕，点击刷新以重试</div>'); return; }
        const body = currentSubtitleData.body;
        const filtered = filterSubtitles(body);
        const cnt = body.length;
        const dur = body[cnt - 1].to;
        const chars = body.reduce((s, i) => s + i.content.length, 0);
        const charsWithTs = getTimestampedTextForAI().length;
        const searchBox = `<div class="bseas-search-box"><span class="bseas-search-icon"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></span><input type="text" id="bseas-subtitle-search" class="bseas-search-input" placeholder="搜索字幕内容..." value="${escapeHtml(subtitleSearchKeyword)}"><span class="bseas-search-count">${subtitleSearchKeyword ? filtered.length + ' 条' : ''}</span><span class="bseas-search-clear" id="bseas-search-clear" style="${subtitleSearchKeyword ? '' : 'display:none;'}"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></span></div>`;
        const stats = `<div class="bseas-stats"><div class="bseas-stat-item"><div class="bseas-stat-label">总条数</div><div class="bseas-stat-value">${cnt}</div></div><div class="bseas-stat-item"><div class="bseas-stat-label">总时长</div><div class="bseas-stat-value">${formatTime(dur)}</div></div><div class="bseas-stat-item ${showPreviewCharsWithTs ? 'bseas-stat-compact' : ''}" id="bseas-chars-toggle" style="cursor:pointer;" title="点击切换"><div class="bseas-stat-label"><span>${showPreviewCharsWithTs ? '总字数(带时间戳)' : '总字数'}</span></div><div class="bseas-stat-value">${showPreviewCharsWithTs ? charsWithTs : chars}</div></div></div>`;
        safeSetInnerHTML(el, searchBox + stats + `<div id="bseas-subtitle-list-container">${buildSubtitleListHtml(filtered)}</div>`);
        const searchInput = el.querySelector('#bseas-subtitle-search');
        if (searchInput) {
            let debounceTimer;
            let isComposing = false;
            searchInput.addEventListener('compositionstart', () => { isComposing = true; });
            searchInput.addEventListener('compositionend', (e) => {
                isComposing = false;
                clearTimeout(debounceTimer);
                subtitleSearchKeyword = e.target.value.trim();
                currentPreviewLimit = 0;
                expandedSearch = false;
                updatePreviewList();
            });
            searchInput.addEventListener('input', (e) => {
                if (isComposing) return;
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    subtitleSearchKeyword = e.target.value.trim();
                    currentPreviewLimit = 0;
                    expandedSearch = false;
                    updatePreviewList();
                }, 200);
            });
        }
        el.querySelector('#bseas-search-clear')?.addEventListener('click', () => {
            subtitleSearchKeyword = '';
            currentPreviewLimit = 0;
            expandedSearch = false;
            const si = el.querySelector('#bseas-subtitle-search');
            if (si) si.value = '';
            updatePreviewList();
            if (si) si.focus();
        });
        el.querySelector('#bseas-chars-toggle')?.addEventListener('click', () => {
            showPreviewCharsWithTs = !showPreviewCharsWithTs;
            const item = el.querySelector('#bseas-chars-toggle');
            if (item) {
                item.classList.toggle('bseas-stat-compact', showPreviewCharsWithTs);
                const span = item.querySelector('.bseas-stat-label > span');
                span.textContent = showPreviewCharsWithTs ? '总字数(带时间戳)' : '总字数';
                item.querySelector('.bseas-stat-value').textContent = showPreviewCharsWithTs ? charsWithTs : chars;
            }
        });
        bindSubtitleItemClicks(el);
        bindLoadMoreClick(el);
        bindExpandSearchClick(el);
    }

    // ===================== 21. AI 分析页渲染 =====================
    function renderAITab(el) {
        const hasSubtitle = !!(currentSubtitleData?.body?.length);
        const cachedPrompt = getCachedPrompt(currentVideoKey);
        const cachedSummary = getCachedSummary(currentVideoKey);
        const cachedQA = getCachedQA(currentVideoKey);
        if (cachedSummary && (aiConversationHistory.length < 2 || aiConversationHistory[1]?.content !== cachedSummary)) {
            const fallbackPrompt = buildFullPrompt(getTimestampedTextForAI());
            const userPrompt = cachedPrompt || fallbackPrompt;
            aiConversationHistory = [
                { role: 'user', content: userPrompt, fullContent: userPrompt },
                { role: 'assistant', content: cachedSummary },
                ...cachedQA.flatMap(qa => [{ role: 'user', content: qa.q }, { role: 'assistant', content: qa.a }])
            ];
        }
        let html = '';
        if (!cachedSummary) {
            if (isGeneratingAI && !bseas_disable_api) {
                const streamHtml = currentStreamText ? markdownToHtml(currentStreamText) : '<div class="bseas-loading"><div class="bseas-spinner"></div><div>生成中...</div></div>';
                html += `<div class="bseas-ai-result bseas-markdown" id="bseas-stream-body" style="min-height:400px;overflow-y:auto;">${streamHtml}</div>`;
            } else if (bseas_disable_api) {
                html += `<button class="bseas-ai-big-btn" id="bseas-copy-prompt-btn"><svg width="17" height="17" viewBox="0 0 24 24"><path fill="#ffffff" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> 复制AI提示词</button>`;
                if (!hasSubtitle) html += '<div class="bseas-empty" style="padding:40px 20px;">未获取到字幕，点击复制提示词进行舆情分析</div>';
            } else {
                html += `<button class="bseas-ai-big-btn" id="bseas-generate-btn" ${!bseas_api_key || isGeneratingAI ? 'disabled' : ''}><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 8L12 16L20 8" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg> ${isGeneratingAI ? '生成中...' : 'AI分析'}</button>`;
                html += '<div style="text-align:center;font-size:12px;color:var(--bseas-text-muted);margin-bottom:16px;margin-top:-8px;">AI生成内容可能有误，请核查</div>';
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
                html += `<div style="position:relative;"><div style="font-size:13px;font-weight:bold;color:var(--bseas-text);margin-bottom:8px;">发给AI的原始文本：</div><textarea class="bseas-text-area" readonly style="min-height:200px;font-family:monospace;font-size:13px;margin-bottom:16px;">${escapeHtml(userText)}</textarea><div style="font-size:13px;font-weight:bold;color:var(--bseas-text);margin-bottom:8px;">AI返回的原始文本：</div><textarea class="bseas-text-area" readonly style="min-height:200px;font-family:monospace;font-size:13px;">${escapeHtml(aiText)}</textarea></div>`;
            } else {
                const adData = lastAdCheckResult || extractAdSegments(cachedSummary);
                if (!lastAdCheckResult) lastAdCheckResult = adData;
                adSegments = adData.segments;
                if (adSegments.length > 0) { initProgressMark(); notifyAdDetected(); }
                if (adData.type === 'has_ad' && adSegments.length > 0) html += `<div class="bseas-sp-box status-found"><div class="bseas-sp-header"><span class="bseas-sp-title">${bseas_auto_skip_ad ? '广告已标记并将自动跳过' : '广告已标记'}</span><button class="bseas-sp-cancel" title="如果误判请点击此处">取消</button><button class="bseas-sp-skip" data-end="${adSegments[0].end}" title="广告时间 ${adSegments[0].startStr} - ${adSegments[0].endStr}">立即跳过</button></div></div>`;
                else if (adData.type === 'none') html += `<div class="bseas-sp-box status-none"><div class="bseas-sp-header"><span class="bseas-sp-icon">✓</span><span class="bseas-sp-title">未检测到视频植入广告</span></div></div>`;
                else html += `<div class="bseas-sp-box status-err"><div class="bseas-sp-header"><span class="bseas-sp-icon">⚠</span><span class="bseas-sp-title">广告时间段格式解析异常</span></div></div>`;
                const displaySummary = stripAdLine(cachedSummary);
                html += `<div style="position:relative;">${retryHtml}<div class="bseas-ai-result bseas-markdown" id="bseas-ai-result"></div></div>`;
                if (cachedQA.length) html += cachedQA.map(qa => `<div class="bseas-qa-item"><div class="bseas-qa-q">${ASK_ICON_SVG}<span>${escapeHtml(qa.q)}</span></div><div class="bseas-qa-a bseas-markdown bseas-qa-md"></div></div>`).join('');
                if (isGeneratingAI && currentFollowupQ) {
                    const followupHtml = currentFollowupText ? markdownToHtml(currentFollowupText) : '<div style="display:flex;align-items:center;gap:8px;color:var(--bseas-text-muted);"><span class="bseas-spinner" style="width:16px;height:16px;border-width:2px;"></span>正在解答...</div>';
                    html += `<div class="bseas-qa-item"><div class="bseas-qa-q">${ASK_ICON_SVG}<span>${escapeHtml(currentFollowupQ)}</span></div><div class="bseas-qa-a bseas-markdown" id="bseas-stream-followup">${followupHtml}</div></div>`;
                }
                if (!bseas_disable_api) {
                    html += `<div class="bseas-followup-section"><div class="bseas-followup-label"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>追问</div><textarea class="bseas-followup-input" id="bseas-followup-input" placeholder="就视频内容提问" ${isGeneratingAI ? 'disabled' : ''}></textarea><button class="bseas-followup-btn" id="bseas-followup-btn" ${isGeneratingAI ? 'disabled' : ''}>${isGeneratingAI ? '生成中...' : '发送追问'}</button></div>`;
                }
            }
            html += `<div style="display:flex;justify-content:flex-end;margin-top:16px;margin-bottom:12px;"><label class="bseas-checkbox-label" style="font-size:13px;color:var(--bseas-text-muted);"><input type="checkbox" id="bseas-raw-toggle" ${showRawAIText ? 'checked' : ''}>查看原始文本</label></div>`;
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
            lastAdCheckResult = null; adDetectionNotified = false;
            isGeneratingAI = true;
            const myGenerationId = ++currentGenerationId;
            currentStreamText = '';
            const genBtn = document.getElementById('bseas-generate-btn');
            const retryBtn = document.getElementById('bseas-retry-btn');
            if (genBtn) genBtn.disabled = true;
            if (retryBtn) retryBtn.disabled = true;
            safeSetInnerHTML(el, `<div class="bseas-ai-result bseas-markdown" id="bseas-stream-body" style="min-height:400px;overflow-y:auto;"><div class="bseas-loading"><div class="bseas-spinner"></div><div>生成中...</div></div></div>`);
            const streamEl = document.getElementById('bseas-stream-body');
            let success = false;
            try {
                await generateAISummaryStream(subtitleText, streamEl, () => myGenerationId === currentGenerationId);
                success = true;
            } catch (err) {
                if (myGenerationId !== currentGenerationId) return;
                showToast(`✗ 失败: ${err.message}`, 'error');
                delete aiSummaryCache[currentVideoKey];
                GM_setValue('aiSummaryCache', aiSummaryCache);
            } finally {
                if (myGenerationId === currentGenerationId) {
                    isGeneratingAI = false;
                    currentStreamText = '';
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
        document.getElementById('bseas-raw-toggle')?.addEventListener('change', e => {
            const oldToggle = document.getElementById('bseas-raw-toggle');
            const oldRect = oldToggle ? oldToggle.getBoundingClientRect() : null;
            showRawAIText = e.target.checked;
            renderAITab(el);
            if (oldRect) {
                const newToggle = document.getElementById('bseas-raw-toggle');
                if (newToggle) {
                    const newRect = newToggle.getBoundingClientRect();
                    el.scrollTop += (newRect.top - oldRect.top);
                }
            }
        });
        el.querySelector('.bseas-sp-skip')?.addEventListener('click', e => { e.stopPropagation(); seekToTime(parseFloat(e.currentTarget.dataset.end)); });
        el.querySelector('.bseas-sp-cancel')?.addEventListener('click', e => {
            e.stopPropagation();
            adSegments = [];
            lastAdCheckResult = { type: 'none', segments: [] };
            overwriteCachedAdAsNone(currentVideoKey);
            progressMarkInitialized = false;
            const existingMark = document.getElementById('bseas-ad-progress-mark');
            if (existingMark) existingMark.remove();
            showToast('✓ 已取消广告标记', 'success');
            renderAITab(el);
        });
        const fBtn = document.getElementById('bseas-followup-btn');
        const fInput = document.getElementById('bseas-followup-input');
        if (fBtn && fInput) {
            const send = async () => {
                const q = fInput.value.trim();
                if (!q) return;
                if (isGeneratingAI) { showToast('请等待当前生成完成', 'warning'); return; }
                isGeneratingAI = true;
                const myGenerationId = ++currentGenerationId;
                currentFollowupQ = q;
                currentFollowupText = '';
                fBtn.disabled = true; fBtn.textContent = '思考中...'; fInput.disabled = true;
                const followupSection = el.querySelector('.bseas-followup-section');
                const answerId = 'bseas-stream-followup';
                const qaEl = document.createElement('div');
                qaEl.className = 'bseas-qa-item';
                safeSetInnerHTML(qaEl, `<div class="bseas-qa-q">${ASK_ICON_SVG}<span>${escapeHtml(q)}</span></div><div class="bseas-qa-a bseas-markdown" id="${answerId}"><div style="display:flex;align-items:center;gap:8px;color:var(--bseas-text-muted);"><span class="bseas-spinner" style="width:16px;height:16px;border-width:2px;"></span>正在解答...</div></div>`);
                followupSection.insertAdjacentElement('beforebegin', qaEl);
                const ansEl = document.getElementById(answerId);
                aiConversationHistory.push({ role: 'user', content: q });
                const renderer = createThrottledRenderer(ansEl, { shouldRender: () => myGenerationId === currentGenerationId });
                try {
                    const a = await callAPIStream(aiConversationHistory, text => { currentFollowupText = text; renderer.update(text); });
                    if (myGenerationId !== currentGenerationId) return;
                    renderer.finalize(a);
                    aiConversationHistory.push({ role: 'assistant', content: a });
                    appendCachedQA(currentVideoKey, q, a);
                    currentFollowupQ = null;
                    currentFollowupText = '';
                    fInput.value = '';
                    showToast('✓ 回复完成', 'success');
                } catch (e) {
                    renderer.cancel();
                    if (myGenerationId !== currentGenerationId) return;
                    safeSetInnerHTML(ansEl, `<span style="color:#ef4444;">❌ 追问失败: ${escapeHtml(e.message)}</span>`);
                    aiConversationHistory.pop();
                    showToast(`✗ 出错: ${e.message}`, 'error');
                } finally {
                    if (myGenerationId === currentGenerationId) { isGeneratingAI = false; currentFollowupQ = null; currentFollowupText = ''; fBtn.disabled = false; fBtn.textContent = '发送追问'; fInput.disabled = false; fInput.focus(); }
                }
            };
            fBtn.addEventListener('click', e => { e.stopPropagation(); send(); });
            fInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); send(); } });
        }
    }

    // ===================== 22. 文本页渲染 =====================
    function renderTextTab(el) {
        if (!currentSubtitleData?.body?.length) { safeSetInnerHTML(el, '<div class="bseas-empty">暂无数据</div>'); return; }
        safeSetInnerHTML(el, `<div class="bseas-text-controls"><label class="bseas-checkbox-label"><input type="checkbox" id="bseas-ts-toggle" ${textShowTimestamps ? 'checked' : ''}>包含时间戳</label><span id="bseas-ts-hint" style="font-size:12px;color:var(--bseas-text-muted);">格式:[MM:SS.ms]</span></div><textarea class="bseas-text-area" id="bseas-text-out" readonly>${escapeHtml(getFormattedText())}</textarea>`);
        document.getElementById('bseas-ts-toggle')?.addEventListener('change', e => { textShowTimestamps = e.target.checked; GM_setValue('bseas_text_show_timestamps', textShowTimestamps); document.getElementById('bseas-text-out').value = getFormattedText(); });
    }

    // ===================== 23. 设置页渲染 =====================
    function renderSettingsTab(el) {
        const pOptions = Object.keys(API_PLATFORMS).map(k => `<option value="${k}" ${bseas_platform === k ? 'selected' : ''}>${API_PLATFORMS[k].name}</option>`).join('');
        const tabOptions = Object.keys(TAB_OPTIONS).map(k => `<option value="${k}" ${bseas_auto_open_tab === k ? 'selected' : ''}>${TAB_OPTIONS[k]}</option>`).join('');
        const detailOptions = Object.keys(DETAIL_LEVELS).map(k => `<option value="${k}" ${bseas_detail_level === k ? 'selected' : ''}>${DETAIL_LEVELS[k]}</option>`).join('');
        const currentPlatformKey = GM_getValue('bseas_api_key_' + bseas_platform, '');
        const updateBadgeHtml = (hasUpdate && bseas_update_mode !== 'disabled') ? ` <a href="${updateLinkUrl || SCRIPTCAT_URL}" target="_blank" rel="noopener noreferrer" class="bseas-update-badge">新版本 v${escapeHtml(latestVersion)}</a>` : '';
        safeSetInnerHTML(el, `<div class="bseas-settings">
    <div id="bseas-settings-main">
    <section class="bseas-settings-section">
        <div style="display:flex;justify-content:space-between;align-items:center;margin:0 4px 8px 4px;">
            <div class="bseas-settings-section-title" style="margin:0;">API 配置</div>
            <span id="bseas-api-hint-btn" style="font-size:12px;font-weight:500;color:var(--bseas-primary);cursor:pointer;letter-spacing:0;">查看使用提示</span>
        </div>
        <div class="bseas-collapse" id="bseas-api-hint-collapse" style="margin-bottom:10px;">
            <div class="bseas-collapse-inner">
                <div id="bseas-api-hint-box" style="background:rgba(0,174,236,0.05);border:1px solid rgba(0,174,236,0.15);border-radius:12px;padding:14px;font-size:12.5px;color:#0c4a6e;line-height:1.65;">
                    <div style="font-weight:600;margin-bottom:4px;font-size:13px;color:#0c4a6e;">前置基础</div>
                    <ul style="margin:0 0 10px 0;padding-left:18px;"><li style="margin-bottom:4px;"><b>什么是 AI API：</b>第三方 AI 大模型开放的调用接口，发送文字请求，云端 AI 服务器返回回答。本程序的 AI 分析、视频总结、广告跳过、舆情分析功能均依赖此接口。</li><li><b>什么是 API Key（密钥）：</b>相当于 AI 接口的「门禁密码」，每次调用 AI 都需要携带此密钥验证身份、扣除额度。密钥请勿泄露。本程序开源可查，不会上传您的 API Key。</li></ul>
                    <div style="font-weight:600;margin-bottom:4px;font-size:13px;color:#0c4a6e;">获取 API Key</div>
                    <ul style="margin:0 0 10px 0;padding-left:18px;"><li style="margin-bottom:4px;">选择心仪的供应商（推荐 DeepSeek），点击「获取 API Key」跳转至供应商官网，注册账号。付费模型需小额充值（归属供应商）。也可选择智谱的免费模型。</li><li>找到 API 密钥入口，创建一个 API 密钥。不要泄露此密钥！</li></ul>
                    <div style="font-weight:600;margin-bottom:4px;font-size:13px;color:#0c4a6e;">使用 API Key</div>
                    <ul style="margin:0;padding-left:18px;"><li>在本程序中选择供应商和模型，输入 API Key 即可。本程序场景不需要强大的模型能力，建议选择价格较低的模型。</li></ul>
                </div>
            </div>
        </div>
        <div class="bseas-settings-card">
            <div class="bseas-settings-row inline">
                <div class="bseas-settings-row-content">
                    <div class="bseas-settings-row-label">禁用 API（手动模式）</div>
                    <div class="bseas-settings-row-desc">开启后将不调用 AI 接口，改为提供提示词复制键。您可将提示词粘贴给外部 AI 工具进行分析。广告跳过功能将不可用。</div>
                </div>
                <div class="bseas-settings-row-action">
                    <label class="bseas-toggle">
                        <input type="checkbox" id="bseas-s-disable-api" ${bseas_disable_api ? 'checked' : ''}>
                        <span class="bseas-toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="bseas-settings-row">
                <label class="bseas-settings-stack-label">平台 / 供应商</label>
                <select class="bseas-settings-input" id="bseas-s-platform">${pOptions}</select>
                <div style="margin-top:8px;"><a id="bseas-s-link" href="#" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--bseas-primary);text-decoration:none;font-weight:500;">获取 API Key →</a></div>
            </div>
            <div class="bseas-settings-row" id="bseas-url-wrapper" style="display:${bseas_platform === 'custom' ? 'block' : 'none'};">
                <label class="bseas-settings-stack-label">API URL Endpoint</label>
                <input type="text" class="bseas-settings-input" id="bseas-s-url" value="${escapeHtml(bseas_api_url)}">
            </div>
            <div class="bseas-settings-row">
                <label class="bseas-settings-stack-label">模型</label>
                <select class="bseas-settings-input" id="bseas-s-model-select"></select>
                <input type="text" class="bseas-settings-input" id="bseas-s-model-custom" style="margin-top:8px;display:none;" placeholder="输入自定义模型名..." value="${escapeHtml(bseas_model)}">
            </div>
            <div class="bseas-settings-row">
                <label class="bseas-settings-stack-label">API Key</label>
                <input type="text" class="bseas-settings-input bseas-password-mask" id="bseas-s-key" value="${escapeHtml(currentPlatformKey)}" placeholder="输入 API Key...">
                <div class="bseas-settings-hint">本程序不会上传 API Key。请勿泄露您的 API Key！</div>
            </div>
        </div>
    </section>

    <section class="bseas-settings-section">
        <div class="bseas-settings-section-title">AI 分析</div>
        <div class="bseas-settings-card">
            <div class="bseas-settings-row inline">
                <div class="bseas-settings-row-content">
                    <div class="bseas-settings-row-label">自动 AI 分析</div>
                </div>
                <div class="bseas-settings-row-action">
                    <label class="bseas-toggle">
                        <input type="checkbox" id="bseas-s-auto" ${bseas_auto_summary ? 'checked' : ''}>
                        <span class="bseas-toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="bseas-settings-row inline">
                <div class="bseas-settings-row-content">
                    <div class="bseas-settings-row-label">舆论分析</div>
                    <div class="bseas-settings-row-desc">开启后 AI 将根据评论对评论区进行舆论分析</div>
                </div>
                <div class="bseas-settings-row-action">
                    <label class="bseas-toggle">
                        <input type="checkbox" id="bseas-s-opinion" ${bseas_opinion_analysis ? 'checked' : ''}>
                        <span class="bseas-toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="bseas-settings-row inline">
                <div class="bseas-settings-row-content">
                    <div class="bseas-settings-row-label">AI 评价</div>
                    <div class="bseas-settings-row-desc">AI 将在总结后给出自己的评价，仅供参考</div>
                </div>
                <div class="bseas-settings-row-action">
                    <label class="bseas-toggle">
                        <input type="checkbox" id="bseas-s-ai-evaluation" ${bseas_ai_evaluation ? 'checked' : ''}>
                        <span class="bseas-toggle-slider"></span>
                    </label>
                </div>
            </div>
        </div>
    </section>

    <section class="bseas-settings-section">
        <div class="bseas-settings-section-title">面板</div>
        <div class="bseas-settings-card">
            <div class="bseas-settings-row inline">
                <div class="bseas-settings-row-content">
                    <div class="bseas-settings-row-label">自动打开面板</div>
                    <div class="bseas-settings-row-desc">仅在有字幕的视频中生效。</div>
                </div>
                <div class="bseas-settings-row-action">
                    <label class="bseas-toggle">
                        <input type="checkbox" id="bseas-s-auto-open" ${bseas_auto_open_panel ? 'checked' : ''}>
                        <span class="bseas-toggle-slider"></span>
                    </label>
                </div>
            </div>
        </div>
    </section>

    <div class="bseas-settings-link-entry" id="bseas-goto-advanced">
        <span class="bseas-settings-link-entry-label">查看高级选项</span>
        <span class="bseas-settings-link-entry-arrow"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M9 5l7 7-7 7"/></svg></span>
    </div>

    <div class="bseas-author-info"><div class="bseas-ext-links"><a href="${GITHUB_REPO_URL}" target="_blank" rel="noopener noreferrer" class="bseas-ext-link"><svg viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>GitHub</a><a href="${GREASYFORK_URL}" target="_blank" rel="noopener noreferrer" class="bseas-ext-link"><svg viewBox="0 0 1024 1024"><path d="M514.56 514.56m-486.4 0a486.4 486.4 0 1 0 972.8 0 486.4 486.4 0 1 0-972.8 0Z"/><path d="M389.376 249.856c102.0416 103.0144 103.9872 105.8816 99.1744 141.5168-3.84 37.5296-3.84 37.5296 172.3392 216.576 97.2288 98.2016 177.152 183.8592 177.152 190.6176 0 26.9312-21.1968 49.1008-45.2608 49.1008-20.224 0-62.5664-36.5568-204.0832-177.152-153.088-152.1152-181.9648-176.1792-196.4032-168.448-31.744 18.2784-57.7536 0.9728-159.7952-101.0688-76.0832-76.0832-98.2016-103.9872-93.3888-117.4528 5.7856-14.4384 19.2512-3.84 82.7904 58.7264L298.9056 418.304l21.1968-21.1968 21.1968-21.1968-75.1104-75.9808c-50.0736-51.0464-71.2192-77.9776-63.5392-82.7904 7.68-4.8128 38.5024 20.224 85.6576 66.4064L361.472 356.7104l22.1184-21.1968 21.1968-22.1184-73.1648-73.1648C268.0832 175.7184 250.7776 144.896 277.7088 144.896c3.84 0 53.9136 47.2064 111.6672 104.96z" fill="#FFFFFF"/></svg>Greasy Fork</a><a href="${SCRIPTCAT_URL}" target="_blank" rel="noopener noreferrer" class="bseas-ext-link"><svg viewBox="0 0 1024 1024" width="14" height="14"><path fill="currentColor" d="M501.333333 273.322667c-63.146667 0-69.461333 6.698667-102.144 6.698666C371.968 280.021333 290.218667 213.333333 249.386667 213.333333c-40.874667 0-88.533333 24.021333-88.533334 93.354667v80c0.085333 20.992 7.68 85.333333 37.546667 68.138667-35.285333 41.728-38.826667 90.410667-38.357333 137.514666-9.514667 2.730667-19.2 5.845333-28.629334 9.045334-29.184 9.984-60.16 22.698667-74.112 31.744a32 32 0 0 0 34.730667 53.76c6.656-4.309333 30.762667-14.933333 60.074667-24.96l9.728-3.2c1.962667 18.474667 6.869333 35.413333 14.165333 50.773333l-1.024 0.554667c-17.493333 9.216-33.706667 19.84-44.032 26.581333l-4.821333 3.157333a32 32 0 1 0 34.730666 53.76l5.589334-3.669333c10.453333-6.826667 23.850667-15.573333 38.442666-23.253333 3.413333-1.834667 6.698667-3.456 9.856-4.949334C288.554667 830.933333 421.12 853.333333 501.333333 853.333333s212.778667-22.4 286.592-91.648c3.157333 1.493333 6.4 3.114667 9.856 4.949334 14.592 7.68 27.989333 16.426667 38.442667 23.253333l5.589333 3.669333a32 32 0 0 0 34.730667-53.76l-4.821333-3.157333a555.008 555.008 0 0 0-44.032-26.581333l-1.024-0.554667c7.296-15.36 12.202667-32.298667 14.165333-50.773333l9.728 3.2c29.312 10.026667 53.418667 20.650667 60.117333 24.96a32 32 0 0 0 34.688-53.76c-13.952-9.045333-44.928-21.76-74.069333-31.744-9.429333-3.2-19.157333-6.314667-28.672-9.088 0.512-47.104-3.072-95.744-38.4-137.472 29.866667 17.194667 37.546667-47.146667 37.589333-68.181334V306.688C841.813333 237.354667 794.154667 213.333333 753.28 213.333333c-40.832 0-122.581333 66.688-149.76 66.688-32.725333 0-39.04-6.698667-102.186667-6.698666z"/></svg>脚本猫</a></div><p class="bseas-author-text">作者: <a href="https://github.com/LiuMashiro" target="_blank" class="bseas-author-link">LiuMashiro</a> · 当前版本: v${SCRIPT_VERSION}${updateBadgeHtml}</p></div>
            <div style="display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:6px; margin-top:2px;">
                <span id="bseas-storage-usage" style="font-size:12px; color:var(--bseas-text-muted);"></span>
                <span style="color: var(--bseas-text-muted);">|</span>
                <a href="javascript:void(0);" class="bseas-danger-link" id="bseas-clear-cache">清除所有储存</a>
                <span style="color: var(--bseas-text-muted);">|</span>
                <a href="javascript:void(0);" class="bseas-danger-link" id="bseas-factory-reset">清除所有储存并恢复出厂设置</a>
            </div>
            <div style="display:flex; align-items:center; justify-content:center; gap:12px; margin-top:8px; font-size:12px;">
                <a href="https://github.com/LiuMashiro/Bilibili-Subtitle-Extraction-AI-Summary-Ad-Skipping/blob/main/LEGAL.md" target="_blank" rel="noopener noreferrer" class="bseas-disclaimer-link" id="bseas-show-disclaimer">法律说明</a>
            </div>
    </div>

    <div class="bseas-settings-page" id="bseas-settings-advanced" style="display:none;">
        <div class="bseas-settings-back" id="bseas-back-to-main">
            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            <span>返回</span>
        </div>
        <section class="bseas-settings-section">
            <div class="bseas-settings-section-title">AI</div>
            <div class="bseas-settings-card">
                <div class="bseas-settings-row inline">
                    <div class="bseas-settings-row-content">
                        <div class="bseas-settings-row-label">省 Tokens 模式（不推荐）</div>
                        <div class="bseas-settings-row-desc">通过压缩提示词、提前检测常见广告、压缩结果实现，将降低生成质量和广告识别精度，不建议开启</div>
                    </div>
                    <div class="bseas-settings-row-action">
                        <label class="bseas-toggle">
                            <input type="checkbox" id="bseas-s-save-tokens" ${bseas_save_tokens ? 'checked' : ''}>
                            <span class="bseas-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="bseas-settings-row inline">
                    <div class="bseas-settings-row-content">
                        <div class="bseas-settings-row-label">AI 总结详细程度</div>
                    </div>
                    <div class="bseas-settings-row-action">
                        <select class="bseas-settings-input" id="bseas-s-detail">${detailOptions}</select>
                    </div>
                </div>
                <div class="bseas-settings-row inline">
                    <div class="bseas-settings-row-content">
                        <div class="bseas-settings-row-label">启用二次确认</div>
                        <div class="bseas-settings-row-desc">启用后，当字数超过限制时，AI 处理前将向您二次确认，以免浪费 Tokens。</div>
                    </div>
                    <div class="bseas-settings-row-action">
                        <label class="bseas-toggle">
                            <input type="checkbox" id="bseas-s-confirm-enable" ${bseas_confirm_enabled ? 'checked' : ''}>
                            <span class="bseas-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="bseas-settings-row">
                    <label class="bseas-settings-stack-label">二次确认字数阈值</label>
                    <input type="number" class="bseas-settings-input" id="bseas-s-confirm-chars" value="${bseas_confirm_chars}" min="1000" ${!bseas_confirm_enabled ? 'disabled' : ''}>
                    <div class="bseas-settings-hint">此处字数包括时间戳。</div>
                </div>
                <div class="bseas-settings-row inline">
                    <div class="bseas-settings-row-content">
                        <div class="bseas-settings-row-label">广告自动跳过</div>
                        <div class="bseas-settings-row-desc">开启后检测到广告时段将自动跳过。关闭后仅在进度条标黄提示，不自动跳转。</div>
                        <div class="bseas-settings-hint">广告跳过功能仅在 AI 分析后可用。</div>
                    </div>
                    <div class="bseas-settings-row-action">
                        <label class="bseas-toggle">
                            <input type="checkbox" id="bseas-s-auto-skip" ${bseas_auto_skip_ad ? 'checked' : ''}>
                            <span class="bseas-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="bseas-settings-row">
                    <label class="bseas-settings-stack-label">获取评论数上限</label>
                    <input type="number" class="bseas-settings-input" id="bseas-s-opinion-count" value="${bseas_opinion_comments_count}" min="0" max="100">
                    <div class="bseas-settings-hint">获取的评论数可能会小于但不会超过此限制</div>
                </div>
            </div>
        </section>
        <section class="bseas-settings-section">
            <div class="bseas-settings-section-title">面板</div>
            <div class="bseas-settings-card">
                <div class="bseas-settings-row">
                    <label class="bseas-settings-stack-label">自动打开面板时的标签页</label>
                    <select class="bseas-settings-input" id="bseas-s-auto-tab" ${!bseas_auto_open_panel ? 'disabled' : ''}>${tabOptions}</select>
                </div>
                <div class="bseas-settings-row inline">
                    <div class="bseas-settings-row-content">
                        <div class="bseas-settings-row-label">按钮默认位置</div>
                        <div class="bseas-settings-row-desc">拖动按钮和面板以改变位置</div>
                    </div>
                    <div class="bseas-settings-row-action">
                        <select class="bseas-settings-input" id="bseas-s-pos-preset"><option value="top-left" ${bseas_panel_pos_preset === 'top-left' ? 'selected' : ''}>左上</option><option value="top-right" ${bseas_panel_pos_preset === 'top-right' ? 'selected' : ''}>右上</option><option value="bottom-left" ${bseas_panel_pos_preset === 'bottom-left' ? 'selected' : ''}>左下</option><option value="bottom-right" ${bseas_panel_pos_preset === 'bottom-right' ? 'selected' : ''}>右下</option></select>
                    </div>
                </div>
                <div class="bseas-settings-row">
                    <label class="bseas-settings-stack-label">浏览页单次加载字幕数量上限</label>
                    <input type="number" class="bseas-settings-input" id="bseas-s-max-preview" value="${bseas_max_preview_subtitles}" min="1">
                    <div class="bseas-settings-hint">为避免页面卡顿，浏览页单次最多渲染此数量的字幕，点击继续加载可以加载更多字幕。</div>
                </div>
                <div class="bseas-settings-row">
                    <label class="bseas-settings-stack-label">自动更新提醒</label>
                    <select class="bseas-settings-input" id="bseas-s-update-mode">
                        <option value="always" ${bseas_update_mode === 'always' ? 'selected' : ''}>总是</option>
                        <option value="reduced" ${bseas_update_mode === 'reduced' ? 'selected' : ''}>弱化</option>
                        <option value="disabled" ${bseas_update_mode === 'disabled' ? 'selected' : ''}>禁用</option>
                    </select>
                    <div class="bseas-settings-hint">总是：检测到新版本即提醒；弱化：仅重大更新且间隔 7 天以上提醒；禁用：关闭所有更新提醒。</div>
                </div>
            </div>
        </section>
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
            safeSetInnerHTML(mSelect, models.map(m => `<option value="${m}">${m}</option>`).join(''));
            if (isInit) { if (models.includes(bseas_model)) mSelect.value = bseas_model; else { mSelect.value = '自定义'; mCustom.value = bseas_model; } }
            else mSelect.selectedIndex = 0;
            updateModelCustom();
        }
        function updateModelCustom() { mCustom.style.display = mSelect.value === '自定义' ? 'block' : 'none'; }
        autoOpenCheckbox.addEventListener('change', () => {
            autoTabSelect.disabled = !autoOpenCheckbox.checked;
            if (autoTabSelect.disabled) {
                autoTabSelect.classList.add('disabled-setting');
                autoTabSelect.title = '此选项在「自动打开面板」未启用时不可用';
            } else {
                autoTabSelect.classList.remove('disabled-setting');
                autoTabSelect.title = '';
            }
        });
        if (autoTabSelect.disabled) {
            autoTabSelect.classList.add('disabled-setting');
            autoTabSelect.title = '此选项在「自动打开面板」未启用时不可用';
        }
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
                    if (disabled) { el.classList.add('disabled-setting'); el.title = '此选项在「禁用 API」启用时不可用'; }
                    else { el.classList.remove('disabled-setting'); el.title = ''; }
                }
            });
            const autoSkipCheckbox = document.getElementById('bseas-s-auto-skip');
            if (autoSkipCheckbox) {
                autoSkipCheckbox.disabled = disabled;
                const autoSkipLabel = autoSkipCheckbox.closest('.bseas-toggle');
                const tipText = disabled ? '此选项在「禁用 API」启用时不可用' : '';
                if (autoSkipLabel) autoSkipLabel.title = tipText;
            }
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
            if (!enabled) { confirmCharsInput.classList.add('disabled-setting'); confirmCharsInput.title = '此选项在「启用二次确认」未启用时不可用'; }
            else { confirmCharsInput.classList.remove('disabled-setting'); confirmCharsInput.title = ''; }
        }
        if (confirmEnableCheckbox) {
            toggleConfirmThreshold(confirmEnableCheckbox.checked);
            confirmEnableCheckbox.addEventListener('change', () => toggleConfirmThreshold(confirmEnableCheckbox.checked));
        }
        const saveTokensCheckbox = document.getElementById('bseas-s-save-tokens');
        const detailSelect = document.getElementById('bseas-s-detail');
        const opinionCountInput = document.getElementById('bseas-s-opinion-count');
        // 舆论分析开关
        const opinionCheckbox = document.getElementById('bseas-s-opinion');
        function opinionCountShouldBeDisabled() {
            const saveTokensOn = saveTokensCheckbox && saveTokensCheckbox.checked;
            const opinionOff = !opinionCheckbox || !opinionCheckbox.checked;
            return saveTokensOn || opinionOff;
        }
        function opinionCountDisabledReason() {
            const saveTokensOn = saveTokensCheckbox && saveTokensCheckbox.checked;
            const opinionOff = !opinionCheckbox || !opinionCheckbox.checked;
            if (saveTokensOn) return '此选项在「省 Tokens 模式」启用时不可用';
            if (opinionOff) return '此选项在「舆论分析」未启用时不可用';
            return '';
        }
        function applyOpinionCountDisabled() {
            if (!opinionCountInput) return;
            const disabled = opinionCountShouldBeDisabled();
            opinionCountInput.disabled = disabled;
            if (disabled) { opinionCountInput.classList.add('disabled-setting'); opinionCountInput.title = opinionCountDisabledReason(); }
            else { opinionCountInput.classList.remove('disabled-setting'); opinionCountInput.title = ''; }
        }
        function toggleDetailForSaveTokens(saveTokens) {
            if (saveTokens) {
                if (detailSelect && !detailSelect.disabled) {
                    bseas_detail_level = detailSelect.value;
                }
                if (opinionCountInput && !opinionCountInput.disabled) {
                    bseas_opinion_comments_count = parseInt(opinionCountInput.value) || 30;
                }
            }
            if (detailSelect) {
                if (saveTokens) {
                    detailSelect.value = 'minimal';
                    detailSelect.disabled = true;
                    detailSelect.classList.add('disabled-setting');
                    detailSelect.title = '此选项在「省 Tokens 模式」启用时不可用';
                } else {
                    detailSelect.value = bseas_detail_level;
                    detailSelect.disabled = false;
                    detailSelect.classList.remove('disabled-setting');
                    detailSelect.title = '';
                }
            }
            if (opinionCountInput) {
                if (saveTokens) {
                    opinionCountInput.value = 10;
                    opinionCountInput.disabled = true;
                    opinionCountInput.classList.add('disabled-setting');
                    opinionCountInput.title = '此选项在「省 Tokens 模式」启用时不可用';
                } else {
                    opinionCountInput.value = bseas_opinion_comments_count;
                    applyOpinionCountDisabled();
                }
            }
        }
        if (saveTokensCheckbox) {
            toggleDetailForSaveTokens(saveTokensCheckbox.checked);
            saveTokensCheckbox.addEventListener('change', () => toggleDetailForSaveTokens(saveTokensCheckbox.checked));
        }
        if (opinionCheckbox) {
            opinionCheckbox.addEventListener('change', () => {
                if (!saveTokensCheckbox || !saveTokensCheckbox.checked) applyOpinionCountDisabled();
            });
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
            const collapse = document.getElementById('bseas-api-hint-collapse');
            const btn = document.getElementById('bseas-api-hint-btn');
            if (!collapse || !btn) return;
            const isOpen = collapse.classList.toggle('open');
            btn.textContent = isOpen ? '收起提示' : '查看使用提示';
        });
        document.getElementById('bseas-goto-advanced')?.addEventListener('click', () => {
            const main = document.getElementById('bseas-settings-main');
            const adv = document.getElementById('bseas-settings-advanced');
            if (!main || !adv) return;
            main.style.display = 'none';
            adv.style.display = 'block';
            adv.classList.remove('back');
            void adv.offsetWidth;
            const content = adv.closest('.bseas-content');
            if (content) content.scrollTop = 0;
        });
        document.getElementById('bseas-back-to-main')?.addEventListener('click', () => {
            const main = document.getElementById('bseas-settings-main');
            const adv = document.getElementById('bseas-settings-advanced');
            if (!main || !adv) return;
            adv.style.display = 'none';
            adv.classList.add('back');
            main.style.display = 'block';
            main.classList.remove('bseas-main-anim');
            void main.offsetWidth;
            main.classList.add('bseas-main-anim');
            const content = main.closest('.bseas-content');
            if (content) content.scrollTop = content.scrollHeight;
        });
        updateStorageUsageDisplay();
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
        startFollowCheck();
        setTimeout(() => { fetchAllSubtitles(); initAdSkipMonitor(); }, AUTO_FETCH_DELAY_MS);
        setTimeout(() => { if (bseas_update_mode !== 'disabled') checkForUpdates(); checkStorageSize(); }, 5000);
    }
    function resetState() {
        if (autoGenerateTimer) { clearTimeout(autoGenerateTimer); autoGenerateTimer = null; }
        if (adSkipInterval) { clearInterval(adSkipInterval); adSkipInterval = null; }
        if (progressMarkObserver) { progressMarkObserver.disconnect(); progressMarkObserver = null; }
        abortCurrentRequest();
        currentGenerationId++;
        isGeneratingAI = false;
        currentStreamText = '';
        currentFollowupQ = null;
        currentFollowupText = '';
        progressMarkInitialized = false;
        lastAdCheckResult = null; adDetectionNotified = false;
        if (playModeActive) stopPlayMode();
        if (followModeActive) stopFollowMode();
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
        currentPreviewLimit = 0;
        expandedSearch = false;
        const existingMark = document.getElementById('bseas-ad-progress-mark');
        if (existingMark) existingMark.remove();
        updateUI();
        setTimeout(() => fetchAllSubtitles(), AUTO_FETCH_DELAY_MS);
    }
    let lastUrl = location.href;
    new MutationObserver(() => { if (location.href !== lastUrl) { lastUrl = location.href; resetState(); } }).observe(document, { subtree: true, childList: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            compareVersions,
            versionDiffMeetsThreshold,
            shouldShowUpdateReminder,
            parseCorrectedSubtitleJSON,
            getCorrectedSubtitle,
            setCorrectedSubtitle,
            clearCorrectedSubtitle,
            buildFullPrompt,
            getAISummaryPrompt,
        };
    }
})();
