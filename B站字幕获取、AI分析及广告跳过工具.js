// ==UserScript==
// @name         B站字幕获取、AI分析及广告跳过工具
// @namespace    http://tampermonkey.net/
// @version      1.5.0
// @description  自动提取B站视频字幕，支持AI生成的CC字幕，通过AI总结+广告识别，自动跳过广告。支持热门评论舆论分析。
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
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      api.deepseek.com
// @connect      open.bigmodel.cn
// @connect      ark.cn-beijing.volces.com
// @connect      api.openai.com
// @connect      api.anthropic.com
// @connect      generativelanguage.googleapis.com
// @connect      raw.githubusercontent.com
// @connect      scriptcat.org
// @connect      *
// @run-at       document-idle
// @downloadURL https://update.greasyfork.org/scripts/579482/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E3%80%81AI%E5%88%86%E6%9E%90%E5%8F%8A%E5%B9%BF%E5%91%8A%E8%B7%B3%E8%BF%87%E5%B7%A5%E5%85%B7.user.js
// @updateURL https://update.greasyfork.org/scripts/579482/B%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96%E3%80%81AI%E5%88%86%E6%9E%90%E5%8F%8A%E5%B9%BF%E5%91%8A%E8%B7%B3%E8%BF%87%E5%B7%A5%E5%85%B7.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ===================== 1. 全局配置 =====================
    const SCRIPT_VERSION = '1.5.0';
    const GITHUB_REPO_URL = 'https://github.com/LiuMashiro/Bilibili-Subtitle-Extraction-AI-Summary-Ad-Skipping/tree/main';
    const GREASYFORK_URL = 'https://greasyfork.org/zh-CN/scripts/579482-b%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96-ai%E5%88%86%E6%9E%90%E5%8F%8A%E5%B9%BF%E5%91%8A%E8%B7%B3%E8%BF%87%E5%B7%A5%E5%85%B7';
    const SCRIPTCAT_URL = 'https://scriptcat.org/zh-CN/script-show-page/6728';
    const CHANGELOG_RAW_URL = 'https://raw.githubusercontent.com/LiuMashiro/Bilibili-Subtitle-Extraction-AI-Summary-Ad-Skipping/main/CHANGELOG.md';
    const API_PLATFORMS = {
        'deepseek': {
            name: 'DeepSeek (性价比高)',
            url: 'https://api.deepseek.com/v1/chat/completions',
            models: ['deepseek-v4-flash', 'deepseek-v4-pro', '自定义'],
            link: 'https://platform.deepseek.com/'
        },
        'zlm': {
            name: '智谱ZLM (提供免费模型)',
            url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            models: ['GLM-4.7-Flash (免费)', 'GLM-5.2', 'GLM-5.1', 'GLM-5', 'GLM-5-Turbo', 'GLM-4.7', 'GLM-4.7-FlashX', 'GLM-4.6', 'GLM-4.5-Air', 'GLM-4.5-AirX', 'GLM-4-Long', 'GLM-4-FlashX-250414', 'GLM-4-Flash-250414', '自定义'],
            link: 'https://bigmodel.cn/'
        },
        'doubao': {
            name: '火山方舟 (豆包)',
            url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
            models: ['doubao-seed-2-0-lite-260428', 'doubao-seed-2-0-mini-260428', 'doubao-seed-2-0-pro-260215', '自定义'],
            link: 'https://www.volcengine.com/product/ark'
        },
        'chatgpt': {
            name: 'ChatGPT',
            url: 'https://api.openai.com/v1/chat/completions',
            models: ['gpt-5.5', 'gpt-5.5-pro', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4-pro', '自定义'],
            link: 'https://platform.openai.com/'
        },
        'claude': {
            name: 'Claude',
            url: 'https://api.anthropic.com/v1/messages',
            models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-fable-5', 'claude-mythos-5', 'claude-haiku-4-5-20251001', '自定义'],
            link: 'https://console.anthropic.com/'
        },
        'gemini': {
            name: 'Gemini',
            url: 'https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent',
            models: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.1-flash-lite-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro', '自定义'],
            link: 'https://aistudio.google.com/'
        },
        'custom': {
            name: '自定义',
            url: '',
            models: ['自定义'],
            link: ''
        }
    };
    const TAB_OPTIONS = {
        'preview': '浏览',
        'ai': 'AI分析',
        'text': '文本'
    };
    const DETAIL_LEVELS = {
        'very_detailed': '非常详细',
        'detailed': '详细',
        'concise': '简洁',
        'minimal': '极简'
    };
    // ===================== 2. 设置读取 =====================
    let bse_platform = GM_getValue('bse_platform', 'deepseek');

    const _oldGlobalKey = GM_getValue('bse_api_key', '');
    if (_oldGlobalKey && !GM_getValue('bse_api_key_' + bse_platform, '')) {
        GM_setValue('bse_api_key_' + bse_platform, _oldGlobalKey);
    }

    let API_KEY = GM_getValue('bse_api_key_' + bse_platform, '') || _oldGlobalKey;
    let API_URL = GM_getValue('bse_api_url', API_PLATFORMS['deepseek'].url);
    let bse_model = GM_getValue('bse_model', 'deepseek-v4-flash');
    let autoGenSummary = GM_getValue('bse_auto_summary', false);
    let autoOpenPanel = GM_getValue('bse_auto_open_panel', true);
    let autoOpenTab = GM_getValue('bse_auto_open_tab', 'preview');
    let enableOpinionAnalysis = GM_getValue('bse_opinion_analysis', true);
    let bse_detail_level = GM_getValue('bse_detail_level', 'concise');
    let bse_auto_skip_ad = GM_getValue('bse_auto_skip_ad', true);
    // ===================== 3. 常量与提示词 =====================
    const AD_BRAND_LIST = ["转转", "追觅", "神奇小鹿", "妙界", "拼多多", "加速器", "得物", "萌牙家"];
    const AD_MARK_COLOR = 'rgba(255, 193, 7, 0.6)';

    function getAISummaryPrompt() {
        let summaryWord, overviewWord, listWord;
        switch (bse_detail_level) {
            case 'very_detailed':
                summaryWord = '非常详细';
                overviewWord = '全面'; listWord = '详细地分点列出核心结论、关键信息和具体细节（包含论述过程和支撑论据）'; break;
            case 'detailed':
                summaryWord = '详细';
                overviewWord = '详细'; listWord = '详细地分点列出核心结论和关键信息'; break;
            case 'minimal':
                summaryWord = '极简';
                overviewWord = '极简'; listWord = '极简地分点列出核心要点（剔除一切修饰性废话）'; break;
            default:
                summaryWord = '简洁';
                overviewWord = '简明'; listWord = '精简地分点列出核心结论和关键信息（剔除修饰性废话）'; break;
        }
        return `注意：请不要在总结中提及视频中的任何广告植入、商业推广等内容，只聚焦核心内容。
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
如果没有提供评论数据，则跳过此部分，不输出"---"和"### 舆论分析"。

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
   - 超长视频允许分钟数值大于60，如[70:00 - 75:00]。禁止小时位。禁止分秒毫秒位。

使用清晰的Markdown格式进行排版，包括正确的分级标题、列表缩进等。`;
    }

    // ===================== 4. 安全策略 =====================
    let trustedPolicy = null;
    if (window.trustedTypes && window.trustedTypes.createPolicy) {
        try { trustedPolicy = window.trustedTypes.createPolicy('bsePolicy', { createHTML: s => s });
        } catch (e) {}
    }
    function safeSetInnerHTML(el, html) {
        if (trustedPolicy) el.innerHTML = trustedPolicy.createHTML(html);
        else el.innerHTML = html;
    }

    // ===================== 5. 样式 =====================
    GM_addStyle(`
        :root {
            --bse-primary: #00AEEC;
            --bse-primary-hover: #0098ce;
            --bse-bg-glass: rgba(255,255,255,0.98);
            --bse-bg-card: #f8fafc;
            --bse-border: #e2e8f0;
            --bse-text: #0f172a;
            --bse-text-dim: #64748b;
            --bse-text-muted: #94a3b8;
            --bse-shadow: 0 12px 40px -10px rgba(0,0,0,0.12), 0 4px 16px -4px rgba(0,0,0,0.06);
            --bse-radius-lg: 20px;
            --bse-radius-md: 14px;
            --bse-radius-sm: 10px;
            --bse-warning: #ffc107;
            --bse-warning-bg: #fff3cd;
            --bse-warning-border: #ffeeba;
            --bse-warning-text: #856404;
            --bse-ad-bg: #fffbeb;
            --bse-ad-border: #fbbf24;
            --bse-ad-text: #92400e;
            --bse-ad-button: #f59e0b;
            --bse-ad-button-hover: #FF8C00;
        }
        * { font-family: -apple-system,BlinkMacSystemFont,"Microsoft YaHei",sans-serif !important;
        }

        .bse-container { position:fixed; z-index:100000; right:24px; top:80px;
        }
        .bse-trigger-btn { width:52px; height:52px; border-radius:16px; background:var(--bse-primary); border:none; cursor:pointer; box-shadow:0 8px 24px rgba(0,174,236,0.3);
            display:flex; align-items:center; justify-content:center; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); position:relative; }
        .bse-trigger-btn:hover { transform:translateY(-2px) scale(1.04);
            box-shadow:0 12px 32px rgba(0,174,236,0.4); }
        .bse-trigger-btn:active { transform:translateY(0) scale(0.98);
        }
        .bse-trigger-btn svg { width:24px; height:24px; fill:white; transition:transform 0.3s ease;
        }
        .bse-trigger-btn:hover svg { transform:scale(1.1);
        }
        .bse-status-dot { position:absolute; top:-2px; right:-2px; width:12px; height:12px; border-radius:50%; border:2px solid white; transition:background 0.3s, transform 0.3s; display:none; }
        .bse-status-dot.state-yellow { display:block; background:#f59e0b; transform:scale(1.1); }
        .bse-status-dot.state-green { display:block; background:#10b981; transform:scale(1.1); }

        @keyframes bse-pulse { 0%,100%{opacity:1; transform:scale(1)}50%{opacity:0.4;
            transform:scale(1.2)} }
        @keyframes bse-spin { to{transform:rotate(360deg)} }
        @keyframes bse-fadein { from{opacity:0;transform:translateY(-10px) scale(0.98)}to{opacity:1;transform:none} }
        @keyframes bse-fadeout { from{opacity:1;transform:none}to{opacity:0;transform:translateY(-10px) scale(0.98)} }
        @keyframes bse-slideup { from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none} }
        @keyframes bse-shake { 0%,100%{transform:translateX(0)}10%,30%,50%,70%,90%{transform:translateX(-2px)}20%,40%,60%,80%{transform:translateX(2px)} }

        .bse-panel { position:absolute;
            top:66px; right:0;
            width:430px;
            max-height:min(calc(100vh - 120px), 66vh);
            background:var(--bse-bg-glass); backdrop-filter:blur(24px); border-radius:var(--bse-radius-lg); box-shadow:var(--bse-shadow); border:1px solid rgba(255,255,255,0.4); display:none; flex-direction:column; overflow:hidden; animation:bse-fadein 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        .bse-panel.show { display:flex;
        }
        .bse-panel.hiding { animation:bse-fadeout 0.2s ease forwards;
        }

        .bse-header { padding:18px 22px 14px; border-bottom:1px solid var(--bse-border); display:flex; align-items:center; justify-content:space-between; flex-shrink:0;
        }
        .bse-title { font-size:16px; font-weight:700; color:var(--bse-text); margin:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap;
        }
        .bse-platform-tag { display:inline-block; padding:3px 8px; background:rgba(0,174,236,0.1); color:var(--bse-primary); font-size:11px; font-weight:700; border-radius:6px;
        }
        .bse-subtitle-info { font-size:13px; color:var(--bse-text-dim); margin-top:4px; font-weight:500; transition:color 0.3s;
        }
        .bse-ad-hint { font-size:12px; color:var(--bse-warning-text); margin-top:2px; font-weight:500; display:flex; align-items:center; gap:4px; flex-wrap:wrap;
        }
        .bse-header-actions { display:flex; align-items:center; gap:8px; flex-shrink:0;
        }
        .bse-icon-btn { width:34px; height:34px; border-radius:var(--bse-radius-sm); background:var(--bse-bg-card); border:1px solid var(--bse-border); cursor:pointer; display:flex; align-items:center;
            justify-content:center; color:var(--bse-text-dim); transition:all 0.2s; text-decoration:none; }
        .bse-icon-btn:hover { background:#e2e8f0; color:var(--bse-text); transform:scale(1.05);
        }
        .bse-icon-btn:active { transform:scale(0.95);
        }
        .bse-icon-btn svg { width:18px; height:18px; fill:currentColor; transition:transform 0.4s ease;
        }
        .bse-icon-btn.spinning svg { animation:bse-spin 0.8s linear infinite;
        }
        .bse-icon-btn.settings-btn:hover svg { transform:rotate(90deg);
        }

        .bse-update-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; background:linear-gradient(135deg, #ef4444, #dc2626); color:white; font-size:11px;
            font-weight:700; border-radius:8px; cursor:pointer; text-decoration:none; transition:all 0.2s; margin-left:4px; vertical-align:middle; white-space:nowrap; }
        .bse-update-badge:hover { transform:scale(1.05);
            box-shadow:0 2px 8px rgba(220,38,38,0.4); color:white; text-decoration:none; }

        .bse-ext-links { display:flex; gap:8px; justify-content:center; align-items:center; flex-wrap: wrap;
            margin-bottom:14px; }
        .bse-ext-link { display:inline-flex; align-items:center; gap:5px; padding:5px 12px; border-radius:8px; text-decoration:none; font-size:12px; font-weight:500;
            transition:all 0.2s; color:var(--bse-text-dim); background:var(--bse-bg-card); border:1px solid var(--bse-border); }
        .bse-ext-link:hover { color:var(--bse-text); border-color:#cbd5e1; transform:translateY(-1px);
            box-shadow:0 2px 6px rgba(0,0,0,0.06); text-decoration:none; }
        .bse-ext-link svg { width:14px; height:14px; fill:currentColor; flex-shrink:0;
        }

        .bse-api-warning { background:var(--bse-warning-bg); border:1px solid var(--bse-warning-border); border-radius:var(--bse-radius-md); padding:12px 16px; margin:16px 22px 0;
            display:flex; align-items:center; gap:10px; animation:bse-shake 0.5s ease; }
        .bse-api-warning-icon { font-size:18px;
        }
        .bse-api-warning-text { flex:1; font-size:13px; color:var(--bse-warning-text); font-weight:600;
        }
        .bse-api-warning-btn { background:var(--bse-warning); color:white; border:none; border-radius:var(--bse-radius-sm); padding:6px 12px; font-size:12px; font-weight:600; cursor:pointer;
            transition:all 0.2s; }
        .bse-api-warning-btn:hover { background:#e0a800; transform:translateY(-1px);
        }
        .bse-api-warning-btn:active { transform:translateY(0);
        }

        .bse-source-section { border-bottom:1px solid var(--bse-border); flex-shrink:0;
        }
        .bse-source-header { display:flex; align-items:center; justify-content:space-between; padding:12px 22px; cursor:pointer; user-select:none; transition:background 0.2s;
        }
        .bse-source-header:hover { background:rgba(0,0,0,0.02);
        }
        .bse-source-label { font-size:13px; font-weight:600; color:var(--bse-text-dim);
        }
        .bse-source-arrow { width:20px; height:20px; display:flex; align-items:center; justify-content:center; transition:transform 0.3s cubic-bezier(0.4,0,0.2,1); color:var(--bse-text-dim);
        }
        .bse-source-arrow svg { width:16px; height:16px; fill:currentColor;
        }
        .bse-source-arrow.collapsed { transform:rotate(-90deg);
        }
        .bse-source-body { padding:0 22px 14px; display:flex; flex-wrap:wrap; gap:8px; animation:bse-slideup 0.3s ease;
        }
        .bse-source-body.hidden { display:none;
        }

        .bse-subtitle-option { padding:6px 14px; background:white; border:1px solid var(--bse-border); border-radius:20px; color:var(--bse-text); font-size:13px; font-weight:500;
            cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); display:flex; align-items:center; gap:6px; position:relative; overflow:hidden; }
        .bse-subtitle-option::before { content:'';
            position:absolute; top:0; left:0; width:0; height:100%; background:var(--bse-primary); opacity:0.1; transition:width 0.3s ease;
        }
        .bse-subtitle-option:hover { border-color:#cbd5e1; transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.06);
        }
        .bse-subtitle-option:hover::before { width:100%;
        }
        .bse-subtitle-option:active { transform:translateY(0);
        }
        .bse-subtitle-option.active { background:var(--bse-primary); border-color:var(--bse-primary); color:white; transform:scale(1.02); box-shadow:0 4px 12px rgba(0,174,236,0.25);
        }
        .bse-subtitle-option.active::before { display:none;
        }
        .bse-tag { font-size:10px; font-weight:700; padding:2px 6px; border-radius:6px; transition:all 0.2s;
        }
        .bse-subtitle-option:not(.active) .bse-tag.ai { background:rgba(0,174,236,0.1); color:var(--bse-primary);
        }
        .bse-subtitle-option:not(.active) .bse-tag.cc { background:rgba(16,185,129,0.1); color:#10b981;
        }
        .bse-subtitle-option.active .bse-tag { background:rgba(255,255,255,0.2); color:white;
        }

        .bse-tabs { display:flex; padding:5px; background:var(--bse-bg-card); border-radius:var(--bse-radius-md); margin:16px 22px 4px; gap:4px; flex-shrink:0;
        }
        .bse-tabs.hidden { display:none;
        }
        .bse-tab { flex:1; padding:8px 0; border:none; background:transparent; color:var(--bse-text-dim); font-size:13.5px; font-weight:600; cursor:pointer; border-radius:var(--bse-radius-sm);
            transition:all 0.25s cubic-bezier(0.4,0,0.2,1); text-align:center; position:relative; overflow:hidden; }
        .bse-tab::before { content:''; position:absolute; bottom:0; left:50%;
            width:0; height:2px; background:var(--bse-primary); transition:all 0.3s ease; transform:translateX(-50%); }
        .bse-tab:hover:not(.active) { color:var(--bse-text); background:rgba(255,255,255,0.5);
        }
        .bse-tab:hover:not(.active)::before { width:60%;
        }
        .bse-tab.active { background:white; color:var(--bse-primary); box-shadow:0 2px 8px rgba(0,0,0,0.06); transform:translateY(-1px);
        }
        .bse-tab.active::before { width:80%;
        }

        .bse-content { flex:1; min-height:0; overflow-y:auto; padding:14px 22px 20px;
        }
        .bse-content::-webkit-scrollbar { width:6px;
        }
        .bse-content::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:4px; transition:background 0.2s;
        }
        .bse-content::-webkit-scrollbar-thumb:hover { background:#94a3b8;
        }

        .bse-checkbox-label { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:500; color:var(--bse-text); cursor:pointer; user-select:none; transition:color 0.2s;
        }
        .bse-checkbox-label:hover { color:var(--bse-primary);
        }
        .bse-checkbox-label input[type="checkbox"] { width:16px; height:16px; accent-color:#7dd3fc; cursor:pointer; margin:0; flex-shrink:0; transition:transform 0.2s;
        }
        .bse-checkbox-label input[type="checkbox"]:hover { transform:scale(1.1);
        }

        .bse-text-controls { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; padding:10px 14px; background:white; border-radius:var(--bse-radius-sm);
            border:1px solid var(--bse-border); transition:box-shadow 0.2s; }
        .bse-text-controls:hover { box-shadow:0 2px 8px rgba(0,0,0,0.04);
        }
        .bse-text-area { width:100%; min-height:280px; background:white; border:1px solid var(--bse-border); border-radius:var(--bse-radius-md); padding:16px; color:var(--bse-text); font-size:14px;
            line-height:1.7; resize:vertical; box-sizing:border-box; transition:all 0.2s; }
        .bse-text-area:focus { outline:none; border-color:var(--bse-primary);
            box-shadow:0 0 0 3px rgba(0,174,236,0.1); transform:translateY(-1px); }

        .bse-loading, .bse-empty { display:flex; flex-direction:column; align-items:center;
            justify-content:center; padding:60px 20px; color:var(--bse-text-dim); font-size:15px; font-weight:500; gap:16px; animation:bse-slideup 0.3s ease;
        }
        .bse-spinner { width:32px; height:32px; border:3px solid rgba(0,174,236,0.15); border-top-color:var(--bse-primary); border-radius:50%;
            animation:bse-spin 0.8s linear infinite; }

        .bse-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px;
        }
        .bse-stat-item { background:white; border:1px solid var(--bse-border); border-radius:var(--bse-radius-md); padding:14px; text-align:center; transition:all 0.2s;
        }
        .bse-stat-item:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,0.06);
        }
        .bse-stat-label { font-size:12px; font-weight:600; color:var(--bse-text-dim); margin-bottom:6px;
        }
        .bse-stat-value { font-size:20px; font-weight:800; color:var(--bse-text); transition:color 0.2s;
        }
        .bse-stat-item:hover .bse-stat-value { color:var(--bse-primary);
        }

        .bse-subtitle-item { padding:14px 16px; margin-bottom:10px; background:white; border-radius:var(--bse-radius-md); border:1px solid var(--bse-border); cursor:pointer;
            transition:all 0.25s cubic-bezier(0.4,0,0.2,1); display:flex; flex-direction:column; gap:6px; position:relative; overflow:hidden; }
        .bse-subtitle-item::before { content:''; position:absolute;
            left:0; top:0; width:3px; height:0; background:var(--bse-primary); transition:height 0.3s ease; }
        .bse-subtitle-item:hover { border-color:#cbd5e1;
            box-shadow:0 4px 12px rgba(0,0,0,0.04); transform:translateY(-1px); }
        .bse-subtitle-item:hover::before { height:100%;
        }
        .bse-subtitle-item:active { transform:translateY(0);
        }
        .bse-ts { font-size:12px; color:var(--bse-primary); font-family:monospace; font-weight:700; background:rgba(0,174,236,0.06); align-self:flex-start; padding:2px 6px; border-radius:4px;
            transition:all 0.2s; }
        .bse-subtitle-item:hover .bse-ts { background:var(--bse-primary); color:white;
        }
        .bse-st { font-size:14.5px; color:var(--bse-text); line-height:1.6;
        }

        .bse-ai-big-btn { width:100%; padding:14px; background:var(--bse-primary); color:white; border:none; border-radius:var(--bse-radius-md); font-size:15px; font-weight:600; cursor:pointer; margin-bottom:16px;
            display:flex; align-items:center; justify-content:center; gap:8px; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); box-shadow:0 4px 16px rgba(0,174,236,0.25); position:relative; overflow:hidden;
        }
        .bse-ai-big-btn::before { content:''; position:absolute; top:0; left:-100%; width:100%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition:left 0.5s ease; }
        .bse-ai-big-btn:hover:not(:disabled) { background:var(--bse-primary-hover); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,174,236,0.35);
        }
        .bse-ai-big-btn:hover:not(:disabled)::before { left:100%;
        }
        .bse-ai-big-btn:active:not(:disabled) { transform:translateY(0);
        }
        .bse-ai-big-btn:disabled { opacity:0.5; cursor:not-allowed;
        }

        .bse-retry-btn { position:absolute; top:16px; right:16px; width:32px; height:32px; background:#f1f5f9; border:none; border-radius:8px; cursor:pointer; display:flex;
            align-items:center; justify-content:center; color:var(--bse-text-dim); z-index:10; transition:background 0.2s, color 0.2s; animation:bse-slideup 0.3s ease;
        }
        .bse-retry-btn:hover { background:var(--bse-primary); color:white;
        }
        .bse-retry-btn svg { width:16px; height:16px; fill:currentColor; transition:transform 0.4s ease;
        }
        .bse-retry-btn:hover svg { transform:rotate(180deg) scale(1.1);
        }

        .bse-ai-result { background:white; border-radius:var(--bse-radius-md); padding:24px; margin-bottom:16px; border:1px solid var(--bse-border); color:var(--bse-text); line-height:1.8; font-size:15px;
            transition:box-shadow 0.2s; animation:bse-slideup 0.3s ease; }
        .bse-ai-result:hover { box-shadow:0 4px 12px rgba(0,0,0,0.04);
        }
        .bse-markdown h1 { font-size:20px; font-weight:800; margin:24px 0 12px; padding-bottom:10px; border-bottom:1px solid var(--bse-border);
        }
        .bse-markdown h2 { font-size:18px; font-weight:700; margin:20px 0 10px;
        }
        .bse-markdown h3 { font-size:16px; font-weight:700; color:var(--bse-primary); margin:18px 0 8px;
        }
        .bse-markdown p { margin-bottom:14px; font-size:15px; color:#334155;
        }
        .bse-markdown ul,.bse-markdown ol { margin:10px 0 16px; padding-left:24px;
        }
        .bse-markdown ul { list-style-type:disc;
        }
        .bse-markdown li { margin-bottom:8px; font-size:15px; color:#334155; line-height:1.7;
        }
        .bse-markdown strong { color:var(--bse-text); font-weight:700;
        }
        .bse-markdown code { background:#f1f5f9; color:var(--bse-primary); padding:2px 6px; border-radius:4px; font-size:13.5px;
        }
        .bse-markdown blockquote { border-left:4px solid var(--bse-primary); margin:14px 0; padding:10px 16px; background:#f0f9ff;
            border-radius:0 var(--bse-radius-sm) var(--bse-radius-sm) 0; color:var(--bse-text-dim); }
        .bse-markdown hr { border:none; height:1px; background:var(--bse-border);
            margin:20px 0; }

        .bse-sp-box { border-radius:24px; padding:16px 20px; margin-bottom:16px; display:flex; flex-direction:column; gap:10px;
            animation:bse-slideup 0.3s ease; }
        .bse-sp-box.status-found { background:var(--bse-ad-bg); border:2px solid var(--bse-ad-border);
            box-shadow:0 4px 16px rgba(251,191,36,0.15); }
        .bse-sp-box.status-none { background:linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            border:1px solid #22c55e; box-shadow:0 4px 12px rgba(34,197,94,0.1); }
        .bse-sp-box.status-err { background:linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
            border:1px solid #ef4444; box-shadow:0 4px 12px rgba(239,68,68,0.1); }
        .bse-sp-header { display:flex; align-items:center; gap:10px;
            flex-wrap:wrap; }
        .bse-sp-icon { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:bold; flex-shrink:0;
        }
        .status-found .bse-sp-icon { background:#FF8C00; color:white; box-shadow:0 2px 8px rgba(217,119,6,0.4);
        }
        .status-none .bse-sp-icon { background:#22c55e; color:white; box-shadow:0 2px 8px rgba(34,197,94,0.3);
        }
        .status-err .bse-sp-icon { background:#ef4444; color:white; box-shadow:0 2px 8px rgba(239,68,68,0.3);
        }
        .bse-sp-title { font-size:14px; font-weight:700; flex:1;
        }
        .status-found .bse-sp-title { color:var(--bse-ad-text);
        }
        .status-none .bse-sp-title { color:#166534;
        }
        .status-err .bse-sp-title { color:#991b1b;
        }
        .bse-sp-badge { background:white; border:1px solid var(--bse-ad-border); border-radius:10px; padding:6px 12px; font-family:monospace; font-size:13px; font-weight:700;
            color:var(--bse-ad-text); box-shadow:0 2px 4px rgba(0,0,0,0.05); }
        .bse-sp-action-row { display:flex; align-items:center; gap:10px; margin-left:34px;
        }
        .bse-sp-action-row .bse-sp-badge { flex:1;
        }
        .bse-sp-skip { background:var(--bse-ad-button); color:white; border:none; border-radius:10px;
            padding:8px 16px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); box-shadow:0 2px 8px rgba(245,158,11,0.3); flex-shrink:0;
        }
        .bse-sp-skip:hover { background:var(--bse-ad-button-hover); transform:translateY(-2px) scale(1.02); box-shadow:0 4px 12px rgba(245,158,11,0.4);
        }
        .bse-sp-skip:active { transform:translateY(0) scale(0.98);
        }
        .bse-sp-hint { font-size:12px; color:#b45309; margin-left:34px;
        }

        .bse-followup-section { margin-top:4px; background:white; border:1px solid var(--bse-border); border-radius:var(--bse-radius-md); padding:16px; transition:box-shadow 0.2s;
            animation:bse-slideup 0.3s ease; }
        .bse-followup-section:hover { box-shadow:0 4px 12px rgba(0,0,0,0.04);
        }
        .bse-followup-label { font-size:13px; font-weight:700; color:var(--bse-primary); margin-bottom:10px; display:flex; align-items:center; gap:6px;
        }
        .bse-followup-input { width:100%; background:#f8fafc; border:1px solid var(--bse-border); border-radius:var(--bse-radius-sm); padding:12px 14px; color:var(--bse-text); font-size:14px;
            margin-bottom:12px; resize:none; height:72px; box-sizing:border-box; transition:all 0.2s; }
        .bse-followup-input:focus { outline:none; border-color:var(--bse-primary); background:white; transform:translateY(-1px);
            box-shadow:0 0 0 3px rgba(0,174,236,0.1); }
        .bse-followup-btn { width:100%; padding:12px; background:var(--bse-primary); color:white; border:none;
            border-radius:var(--bse-radius-sm); font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .bse-followup-btn:hover:not(:disabled) { background:var(--bse-primary-hover); transform:translateY(-1px);
        }
        .bse-followup-btn:disabled { opacity:0.5; cursor:not-allowed;
        }

        .bse-qa-item { margin-top:16px; padding-top:16px; border-top:1px solid var(--bse-border); animation:bse-slideup 0.3s ease;
        }
        .bse-qa-q { font-size:14px; font-weight:700; color:var(--bse-text); margin-bottom:10px; background:#f1f5f9; padding:10px 14px; border-radius:var(--bse-radius-sm); transition:background 0.2s;
        }
        .bse-qa-q:hover { background:#e2e8f0;
        }
        .bse-qa-a { font-size:14.5px; color:var(--bse-text); line-height:1.7; padding:0 4px;
        }

        .bse-settings-group { margin-bottom:8px;
        }
        .bse-settings-group + .bse-settings-group { margin-top:28px; padding-top:24px; border-top:1px solid var(--bse-border);
        }
        .bse-settings-group-title { font-size:15px; font-weight:800; color:var(--bse-text); margin-bottom:16px; display:flex; align-items:center; gap:8px;
        }
        .bse-settings-group-title-dot { width:7px; height:7px; border-radius:50%; background:var(--bse-primary); flex-shrink:0;
        }
        .bse-settings-subgroup { margin-bottom:22px;
        }
        .bse-settings-subgroup:last-child { margin-bottom:0;
        }
        .bse-settings-subgroup-title { font-size:13.5px; font-weight:700; color:var(--bse-text); margin-bottom:14px; letter-spacing:0.2px;
        }
        .bse-settings-subgroup + .bse-settings-subgroup { padding-top:18px; border-top:1px solid var(--bse-border);
        }
        .bse-settings-block { margin-bottom:16px;
        }
        .bse-settings-block:last-child { margin-bottom:0;
        }
        .bse-settings-block-label { display:block; font-size:13px; font-weight:600; color:var(--bse-text-dim); margin-bottom:8px;
        }
        .bse-settings-input { width:100%; padding:12px 14px; background:#f8fafc; border:1px solid var(--bse-border); border-radius:var(--bse-radius-sm); font-size:14px; color:var(--bse-text);
            box-sizing:border-box; transition:all 0.2s; }
        .bse-settings-input:focus { outline:none; border-color:var(--bse-primary); background:white;
            box-shadow:0 0 0 3px rgba(0,174,236,0.1); transform:translateY(-1px); }
        .bse-settings-check-row { display:flex; align-items:flex-start; gap:10px; cursor:pointer;
            user-select:none; transition:opacity 0.2s; }
        .bse-settings-check-row:hover { opacity:0.9;
        }
        .bse-settings-check-row input[type="checkbox"] { width:16px; height:16px; margin-top:3px; accent-color:#7dd3fc; cursor:pointer; flex-shrink:0; transition:transform 0.2s;
        }
        .bse-settings-check-row input[type="checkbox"]:hover { transform:scale(1.1);
        }
        .bse-settings-check-text { display:flex; flex-direction:column; gap:4px;
        }
        .bse-settings-check-title { font-size:14px; font-weight:500; color:var(--bse-text); line-height:1.4;
        }
        .bse-settings-check-desc { font-size:12px; color:var(--bse-text-muted); line-height:1.5;
        }
        .bse-author-info { margin-top:28px; padding-top:24px; border-top:1px solid var(--bse-border); text-align:center;
        }
        .bse-author-text { font-size:13px; color:var(--bse-text-muted);
        }
        .bse-author-link { color:var(--bse-primary); text-decoration:none; font-weight:400; transition:color 0.2s;
        }
        .bse-author-link:hover { color:var(--bse-primary-hover); text-decoration:underline;
        }

        .bse-footer { padding:16px 22px; border-top:1px solid var(--bse-border); display:flex; gap:12px; flex-shrink:0; flex-direction:column;
        }
        .bse-btn { flex:1; min-width:0; padding:12px 8px; border:none; border-radius:var(--bse-radius-md); font-size:13.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center;
            gap:6px; white-space:nowrap; transition:all 0.25s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; }
        .bse-btn::before { content:''; position:absolute; top:0; left:-100%;
            width:100%; height:100%; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); transition:left 0.5s ease; }
        .bse-btn:hover:not(:disabled)::before { left:100%;
        }
        .bse-btn-primary { background:var(--bse-primary); color:white;
        }
        .bse-btn-primary:hover:not(:disabled) { background:var(--bse-primary-hover); transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,174,236,0.2);
        }
        .bse-btn-primary:active:not(:disabled) { transform:translateY(0);
        }
        .bse-btn-primary:disabled { opacity:0.5; cursor:not-allowed;
        }
        .bse-btn-secondary { background:white; color:var(--bse-text); border:1px solid var(--bse-border);
        }
        .bse-btn-secondary:hover:not(:disabled) { background:#f8fafc; border-color:#cbd5e1; transform:translateY(-1px); box-shadow:0 2px 8px rgba(0,0,0,0.04);
        }
        .bse-btn-secondary:active:not(:disabled) { transform:translateY(0);
        }
        .bse-btn-secondary:disabled { opacity:0.5; cursor:not-allowed;
        }

        .bse-toast { position:fixed; bottom:80px; left:50%; transform:translateX(-50%) translateY(16px) scale(0.95); background:rgba(15,23,42,0.95); color:white; padding:12px 24px;
            border-radius:12px; font-size:14px; font-weight:500; opacity:0; transition:opacity 0.25s ease, transform 0.25s cubic-bezier(0.16,1,0.3,1); z-index:100001; pointer-events:none; white-space:nowrap;
        }
        .bse-toast.show { opacity:1; transform:translateX(-50%) translateY(0) scale(1);
        }
        .bse-toast.success { background:rgba(16,185,129,0.95);
        }
        .bse-toast.error { background:rgba(239,68,68,0.95);
        }
        .bse-toast.warning { background:rgba(255,193,7,0.95); }
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

    let _documentClickHandler = null;
    // ===================== 7. 日志工具 =====================
    function log(...args) { console.log('[BSE]', ...args);
    }
    function _ts() {
        const n = new Date();
        return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}:${String(n.getSeconds()).padStart(2, '0')}.${String(n.getMilliseconds()).padStart(3, '0')}`;
    }
    function logAPI(action, data) { console.log(`[BSE-API] [${_ts()}] ${action}`, data !== undefined ? data : '');
    }

    // ===================== 8. 缓存管理 =====================
    function loadCache() {
        const raw = GM_getValue('aiSummaryCache', {});
        const result = {};
        for (const key of Object.keys(raw)) {
            const val = raw[key];
            if (typeof val === 'string') result[key] = { summary: val, qa: [] };
            else if (val && typeof val === 'object' && typeof val.summary === 'string') result[key] = { summary: val.summary, qa: Array.isArray(val.qa) ?
            val.qa : [] };
        }
        return result;
    }
    function getCachedSummary(videoKey) {
        const entry = aiSummaryCache[videoKey];
        if (!entry) return null;
        return typeof entry === 'string' ? entry : entry.summary || null;
    }
    function getCachedQA(videoKey) {
        const entry = aiSummaryCache[videoKey];
        if (!entry || typeof entry === 'string') return [];
        return Array.isArray(entry.qa) ? entry.qa : [];
    }
    function setCachedSummary(videoKey, summary) {
        const existing = aiSummaryCache[videoKey];
        const qa = (existing && Array.isArray(existing.qa)) ? existing.qa : [];
        aiSummaryCache[videoKey] = { summary, qa };
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
    function formatTime(s) { const m = Math.floor(s / 60), sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`; }
    function formatTimeWithMs(s) { const m = Math.floor(s / 60), sec = Math.floor(s % 60), ms = Math.floor((s % 1) * 100);
        return `${m}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`; }
    function formatTimeForSRT(s) { const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 1000); return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    }
    function parseAdTime(str) { str = str.trim(); const m = str.match(/^(\d+):(\d{2})$/); return m ?
        parseInt(m[1]) * 60 + parseInt(m[2]) : null; }
    function escapeHtml(t) { if (!t) return '';
        return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function formatCommentsForAI() {
        if (!hotComments.length) return '';
        return hotComments.map(c => `${c.content.length > 200 ? c.content.slice(0, 200) + '...' : c.content} ${c.like}`).join('\n');
    }
    function showToast(msg, type = '') {
        let el = document.querySelector('.bse-toast');
        if (!el) { el = document.createElement('div'); el.className = 'bse-toast'; document.body.appendChild(el);
        }
        el.textContent = msg;
        el.className = 'bse-toast' + (type ? ' ' + type : '');
        void el.offsetWidth; el.classList.add('show');
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.remove('show'), 2500);
    }
    function seekToTime(sec) { const v = document.querySelector('video');
        if (v) { v.currentTime = sec; showToast(`跳转到 ${formatTime(sec)}`, 'success'); } }
    function setLoadingState(loading) { isLoading = loading;
        document.querySelector('#bse-refresh-btn')?.classList.toggle('spinning', loading); }
    function getVideoTitle() { const h1 = document.querySelector('h1.video-title'); if (!h1) return '';
        return h1.dataset.title || h1.getAttribute('title') || h1.textContent.trim(); }
    function getVideoDescription() { const descElement = document.querySelector('.desc-info-text');
        if (!descElement) return ''; return descElement.textContent.trim(); }
    function getVideoTags() { const tagElements = document.querySelectorAll('.tag-link .tag-name');
        if (!tagElements || tagElements.length === 0) return []; return Array.from(tagElements).map(tag => tag.textContent.trim());
    }

    function compareVersions(v1, v2) {
        const p1 = v1.split('.').map(Number), p2 = v2.split('.').map(Number);
        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const a = p1[i] || 0, b = p2[i] || 0;
            if (a > b) return 1; if (a < b) return -1;
        }
        return 0;
    }

    let scriptcatCheckResult = null; 
    let githubCheckResult = null;   
    let scriptcatCheckDone = false;
    let githubCheckDone = false;

    function resolveUpdateAfterChecks() {
        if (!scriptcatCheckDone || !githubCheckDone) return;

        let chosen = null;
        if (githubCheckResult) chosen = { source: 'Github', version: githubCheckResult.version, url: GITHUB_REPO_URL };
        else if (scriptcatCheckResult) chosen = { source: 'ScriptCat', version: scriptcatCheckResult.version, url: SCRIPTCAT_URL };

        if (!chosen) { log('更新检测: 两个来源均未检测成功'); return; }

        if (compareVersions(chosen.version, SCRIPT_VERSION) > 0) {
            latestVersion = chosen.version;
            updateLinkUrl = chosen.url;
            hasUpdate = true;
            log(`发现新版本(${chosen.source}):`, latestVersion);
            showUpdateBadgeInPanel();
        } else {
            log(`当前已是最新版本(${chosen.source}):`, SCRIPT_VERSION);
        }
    }

    function checkForUpdates() {
        checkForUpdatesScriptCat();
        checkForUpdatesGithub();
    }

    function checkForUpdatesScriptCat() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://scriptcat.org/zh-CN/script-show-page/6728/version',
            timeout: 8000,
            onload: function(response) {
                if (response.status === 200) {
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(response.responseText, 'text/html');
                        const labelXpath = "//*[normalize-space(text())='最新版本']";
                        const labelNode = doc.evaluate(labelXpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
                        if (labelNode) {
                            const itemContainer = labelNode.closest('div, li, section');
                            if (itemContainer) {
                                const versionMatch = itemContainer.textContent.match(/\d+\.\d+\.\d+/);
                                if (versionMatch) {
                                    scriptcatCheckResult = { version: versionMatch[0] };
                                }
                            }
                        }
                    } catch(e) { log('ScriptCat更新检测解析异常:', e); }
                }
                scriptcatCheckDone = true;
                resolveUpdateAfterChecks();
            },
            onerror: function () { scriptcatCheckDone = true; resolveUpdateAfterChecks(); },
            ontimeout: function () { scriptcatCheckDone = true; resolveUpdateAfterChecks(); }
        });
    }

    function checkForUpdatesGithub() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: CHANGELOG_RAW_URL,
            timeout: 8000,
            onload: function (response) {
                if (response.status === 200) {
                    const match = response.responseText.match(/##\s*\[([^\]]+)\]/);
                    if (match && match[1]) {
                        githubCheckResult = { version: match[1].trim() };
                    }
                }
                githubCheckDone = true;
                resolveUpdateAfterChecks();
            },
            onerror: function () { log('更新检测: 网络请求失败'); githubCheckDone = true; resolveUpdateAfterChecks(); },
            ontimeout: function () { log('更新检测: 请求超时'); githubCheckDone = true; resolveUpdateAfterChecks(); }
        });
    }

    function showUpdateBadgeInPanel() {
        const hint = document.getElementById('bse-ad-hint');
        if (hint && !hint.querySelector('.bse-update-badge')) {
            const badge = document.createElement('a');
            badge.href = updateLinkUrl || SCRIPTCAT_URL;
            badge.target = '_blank';
            badge.className = 'bse-update-badge';
            badge.textContent = '新版本 v' + latestVersion;
            hint.appendChild(badge);
        }
    }

    // ===================== 10. 进度条广告标记 =====================
    function waitForElement(selector, callback) { const element = document.querySelector(selector);
        if (element) callback(element); else setTimeout(() => waitForElement(selector, callback), 100); }
    function createProgressMark(video, progressArea) {
        const existingMark = document.getElementById('bse-ad-progress-mark');
        if (existingMark) existingMark.remove();
        if (!adSegments || adSegments.length === 0) return;
        const mark = document.createElement('div'); mark.id = 'bse-ad-progress-mark';
        mark.style.cssText = `position:absolute;height:100%;background:${AD_MARK_COLOR};z-index:1;pointer-events:none;border-radius:2px;`;
        progressArea.appendChild(mark);
        function updateMarkPosition() { const duration = video.duration; if (!duration || duration < adSegments[0].end) return;
            mark.style.left = `${(adSegments[0].start / duration) * 100}%`; mark.style.width = `${(adSegments[0].end / duration) * 100 - (adSegments[0].start / duration) * 100}%`;
        }
        updateMarkPosition(); video.addEventListener('durationchange', updateMarkPosition); video.addEventListener('loadedmetadata', updateMarkPosition);
    }
    function initProgressMark() {
        if (progressMarkInitialized) return; progressMarkInitialized = true;
        waitForElement('.bpx-player-video-wrap video', (video) => {
            waitForElement('.bpx-player-progress-area', (progressArea) => {
                createProgressMark(video, progressArea);
                if (progressMarkObserver) progressMarkObserver.disconnect();
                progressMarkObserver = new MutationObserver(() => { const newVideo = document.querySelector('.bpx-player-video-wrap video'); if (newVideo && newVideo !== video) { progressMarkInitialized = false; initProgressMark(); progressMarkObserver.disconnect(); } });
                progressMarkObserver.observe(document.body, { childList: true, subtree: true });
            });
        });
    }

    // ===================== 11. Markdown 渲染 =====================
    function processInline(text) { return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>');
    }
    function markdownToHtml(md) {
        if (!md) return '';
        md = md.replace(/\r\n/g, '\n'); const lines = md.split('\n');
        let out = [], stack = [], inCode = false, code = [];
        for (const line of lines) {
            if (line.trim().startsWith('```')) { if (inCode) { out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
                code = []; inCode = false; } else inCode = true; continue;
            }
            if (inCode) { code.push(line); continue;
            }
            const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
            const t = line.trim(); if (!t) continue;
            const ul = t.match(/^[-*][ \t]+(.*)$/), ol = t.match(/^\d+\.[ \t]+(.*)$/);
            if (ul || ol) {
                const type = ul ?
                'ul' : 'ol', cnt = processInline(ul ? ul[1] : ol[1]);
                if (!stack.length) { stack.push({ type, indent }); out.push(`<${type}>`);
                } else {
                    const top = stack[stack.length - 1];
                    if (indent > top.indent) { stack.push({ type, indent }); out.push(`<${type}>`);
                    }
                    else if (indent < top.indent) { while (stack.length && stack[stack.length - 1].indent > indent) out.push(`</${stack.pop().type}>`);
                        if (!stack.length || stack[stack.length - 1].indent < indent) { stack.push({ type, indent }); out.push(`<${type}>`);
                        } }
                    else if (top.type !== type) { out.push(`</${stack.pop().type}>`);
                        stack.push({ type, indent }); out.push(`<${type}>`); }
                } out.push(`<li>${cnt}</li>`);
                continue;
            } while (stack.length) out.push(`</${stack.pop().type}>`);
            if (/^---+$/.test(t)) { out.push('<hr>'); continue;
            }
            const h = t.match(/^(#{1,6})[ \t]+(.*)$/);
            if (h) { out.push(`<h${h[1].length}>${processInline(h[2])}</h${h[1].length}>`); continue; }
            const bq = t.match(/^>[ \t]*(.*)$/);
            if (bq) { out.push(`<blockquote>${processInline(bq[1])}</blockquote>`); continue; }
            out.push(`<p>${processInline(t)}</p>`);
        } while (stack.length) out.push(`</${stack.pop().type}>`); return out.join('\n');
    }

    // ===================== 12. 广告解析与跳过 =====================
    function extractAdSegments(rawSummary) {
        const text = rawSummary.replace(/\*/g, '').replace(/`/g, '').replace(/#/g, ' ');
        const timeRe = /广告时间[\s\S]{0,80}?\[(\d+:\d{2})\s*[-–—~至]\s*(\d+:\d{2})\]/g;
        const timeMatches = [...text.matchAll(timeRe)];
        if (timeMatches.length > 0) { const last = timeMatches[timeMatches.length - 1];
            const start = parseAdTime(last[1]), end = parseAdTime(last[2]); if (start !== null && end !== null && end > start) return { type: 'has_ad', segments: [{ start, end, startStr: last[1], endStr: last[2] }] };
        }
        const noRe = /广告时间[\s\S]{0,80}?\[\s*无[^\]]*\]/g;
        if ([...text.matchAll(noRe)].length > 0) return { type: 'none', segments: [] };
        return { type: 'error', segments: [] };
    }
    function stripAdLine(summary) {
        const lines = summary.split('\n');
        let cutIndex = lines.length;
        for (let i = 0; i < lines.length; i++) { if (lines[i].replace(/[#\s*`]/g, '').includes('广告时间')) { cutIndex = i;
            while (cutIndex > 0 && /^[#\s]/.test(lines[cutIndex - 1]) && lines[cutIndex - 1].trim() === '') cutIndex--; break;
        } }
        return lines.slice(0, cutIndex).join('\n').trim();
    }
    function initAdSkipMonitor() {
        if (adSkipInterval) clearInterval(adSkipInterval);
        adSkipInterval = setInterval(() => {
            if (!bse_auto_skip_ad) return;
            if (!adSegments?.length) return; const video = document.querySelector('video'); if (!video || video.readyState === 0) return; const ct = video.currentTime; adSegments.forEach((ad, i) => { if (ct >= ad.start && ct < ad.end - 0.3) { video.currentTime = ad.end; const key = `${currentVideoKey}-${i}`; if (Date.now() - (hasJumpedAds[key] || 0) > 3000) { showToast('✓ 已自动跳过广告', 'success'); hasJumpedAds[key] = Date.now(); } } }); }, 1000);
    }

    // ===================== 13. B站 API =====================
    async function fetchBilibiliSubtitles() {
        const url = window.location.href;
        const bvid = (url.match(/(BV[\w]+)/) || [])[1]; const page = parseInt((url.match(/[?&]p=(\d+)/) || [, 1])[1]);
        if (!bvid) return [];
        try {
            const vr = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { credentials: 'include' });
            const vd = await vr.json();
            if (vd.code !== 0 || !vd.data) return [];
            const aid = vd.data.aid, pages = vd.data.pages || []; let cid = vd.data.cid;
            if (pages.length >= page) cid = pages[page - 1].cid;
            currentAid = aid;
            const pr = await fetch(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}`, { credentials: 'include' }); const pd = await pr.json();
            if (pd.code !== 0 || !pd.data?.subtitle?.subtitles) return [];
            return pd.data.subtitle.subtitles.filter(s => s.lan === 'zh-CN' || s.lan === 'zh' || s.lan.startsWith('ai-zh')).map((s, i) => ({ id: s.id || i, lan: s.lan, lan_doc: s.lan_doc, subtitle_url: s.subtitle_url, isAI: s.lan.startsWith('ai-'), body: null }));
        } catch (e) { return []; }
    }
    async function fetchSubtitleContent(url) { try { if (url.startsWith('//')) url = 'https:' + url;
        const r = await fetch(url); const d = await r.json(); return d.body || []; } catch (e) { return [];
    } }
    async function fetchHotComments() {
        let aid = currentAid;
        if (!aid) { try { aid = unsafeWindow.__INITIAL_STATE__?.aid; } catch {} } if (!aid) return [];
        try { const r = await fetch(`https://api.bilibili.com/x/v2/reply/main?type=1&oid=${aid}&mode=3&next=0&ps=30`, { credentials: 'include' }); const d = await r.json();
        if (d.code !== 0 || !d.data?.replies) return []; return d.data.replies.map(r => ({ content: r.content.message, like: r.like }));
        } catch (e) { return []; }
    }

    // ===================== 14. AI API 调用 =====================
    async function callAPIStream(messages, onChunk) {
        let isGemini = API_URL.includes('generativelanguage.googleapis.com');
        let isClaude = API_URL.includes('anthropic.com');
        let actualModel = bse_model.replace(' (免费)', '');
        let fetchUrl = API_URL;
        let headers = { 'Content-Type': 'application/json' }; let bodyData = {};
        if (isClaude) {
            headers['x-api-key'] = API_KEY;
            headers['anthropic-version'] = '2023-06-01';
            headers['Accept'] = 'text/event-stream';
            bodyData = { model: actualModel, max_tokens: 8192, stream: true, messages: messages };
        } else if (isGemini) {
            fetchUrl = fetchUrl.replace('{model_name}', actualModel);
            if (fetchUrl.includes(':generateContent')) fetchUrl = fetchUrl.replace(':generateContent', ':streamGenerateContent'); fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `key=${API_KEY}&alt=sse`;
            bodyData = { contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) };
        } else {
            headers['Authorization'] = `Bearer ${API_KEY}`;
            headers['Accept'] = 'text/event-stream'; bodyData = { model: actualModel, messages: messages, stream: true };
        }
        const startTime = Date.now();
        const resp = await fetch(fetchUrl, { method: 'POST', headers, body: JSON.stringify(bodyData) });
        if (!resp.ok) {
            if (resp.status === 429) throw new Error('HTTP 429 (请求频率过高，请稍后再试或更换限额更大的模型)');
            throw new Error(`HTTP ${resp.status}`);
        }
        if (!resp.body) throw new Error('不支持流式响应');
        const reader = resp.body.getReader(), dec = new TextDecoder('utf-8'); let buf = '', full = '';
        while (true) { const { done, value } = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream: true }); const lines = buf.split(/\r?\n/); buf = lines.pop() || '';
            for (const line of lines) { const t = line.trim(); if (!t || t.startsWith(':')) continue; if (isClaude && t.startsWith('event:')) continue;
                if (t.startsWith('data:')) { const ds = t.slice(5).trim(); if (!isClaude && ds === '[DONE]') return full;
                    try { const d = JSON.parse(ds); let chunk = ''; if (isGemini) chunk = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        else if (isClaude) { if (d.type === 'content_block_delta') chunk = d.delta?.text || ''; else if (d.type === 'message_stop') return full;
                        } else chunk = d.choices?.[0]?.delta?.content || ''; if (chunk) { full += chunk; onChunk(full);
                        } } catch {} } } } return full;
    }
    function callAPINoStream(messages) {
        return new Promise((resolve, reject) => {
            let isGemini = API_URL.includes('generativelanguage.googleapis.com');
            let isClaude = API_URL.includes('anthropic.com');
            let actualModel = bse_model.replace(' (免费)', '');
            let fetchUrl = API_URL; let headers = { 'Content-Type': 'application/json' }; let bodyData = {};
            if (isClaude) {
                headers['x-api-key'] = API_KEY;
                headers['anthropic-version'] = '2023-06-01';
                bodyData = { model: actualModel, max_tokens: 8192, messages: messages };
            } else if (isGemini) {
                fetchUrl = fetchUrl.replace('{model_name}', actualModel); fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `key=${API_KEY}`; bodyData = { contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) };
            } else {
                headers['Authorization'] = `Bearer ${API_KEY}`;
                bodyData = { model: actualModel, messages: messages };
            }
            GM_xmlhttpRequest({ method: 'POST', url: fetchUrl, headers, data: JSON.stringify(bodyData), timeout: 60000,
                onload(r) {
                    if (r.status === 429) return reject(new Error('HTTP 429 (请求频率过高，请稍后再试或更换限额更大的模型)'));
                    try { const d = JSON.parse(r.responseText); if (d.error) return reject(new Error(d.error.message || JSON.stringify(d.error))); let result; if (isClaude) result = d.content?.[0]?.text; else if (isGemini) result = d.candidates?.[0]?.content?.parts?.[0]?.text; else result = d.choices?.[0]?.message?.content; if (!result) return reject(new Error('API返回异常')); resolve(result); } catch (e) { reject(new Error('解析失败')); } },
                onerror() { reject(new Error('网络错误')); }, ontimeout() { reject(new Error('请求超时')); }
            });
        });
    }
    async function generateAISummaryStream(subtitleText, streamEl) {
        let contextInfo = '';
        const videoTitle = getVideoTitle(); const videoDesc = getVideoDescription(); const videoTags = getVideoTags();
        if (videoTitle) contextInfo += `视频标题：${videoTitle}\n`;
        if (videoDesc) contextInfo += `视频简介：${videoDesc}\n`; if (videoTags.length > 0) contextInfo += `视频标签：${videoTags.join(', ')}\n`; if (contextInfo) contextInfo += '\n';
        const commentsText = (enableOpinionAnalysis && hotComments.length > 0) ? formatCommentsForAI() : '';
        if (commentsText) contextInfo += `===== 热门评论（按热度排序）=====\n${commentsText}\n\n`;
        const messages = [{ role: 'user', content: `${getAISummaryPrompt()}\n\n${contextInfo}${subtitleText}` }];
        let summary = await callAPIStream(messages, text => { safeSetInnerHTML(streamEl, markdownToHtml(text)); streamEl.scrollTop = streamEl.scrollHeight; });
        let adCheck = extractAdSegments(summary); lastAdCheckResult = adCheck;
        if (adCheck.type === 'error') {
            safeSetInnerHTML(streamEl, markdownToHtml(summary) + '<div style="margin-top:14px;color:#f59e0b;font-size:13px;display:flex;align-items:center;gap:6px;"><div class="bse-spinner" style="width:14px;height:14px;border-width:2px;"></div>格式校验修正中...</div>');
            messages.push({ role: 'assistant', content: summary }); messages.push({ role: 'user', content: '你没有正确输出广告时间。请输出一行：有广告输出"广告时间[MM:SS - MM:SS]"，没广告输出"广告时间[无]"。只输出这一行，不含其他任何内容。必须在同一行。' });
            try { const fix = await callAPINoStream(messages); summary = summary + '\n' + fix.trim(); adCheck = extractAdSegments(summary); lastAdCheckResult = adCheck;
            safeSetInnerHTML(streamEl, markdownToHtml(summary)); } catch (e) {}
        }
        setCachedSummary(currentVideoKey, summary);
        aiConversationHistory = [{ role: 'user', content: getAISummaryPrompt() }, { role: 'assistant', content: summary }];
        adSegments = adCheck.segments;
        if (adSegments.length > 0) { initProgressMark(); initAdSkipMonitor(); } return summary;
    }

    // ===================== 15. 核心工作流 =====================
    async function fetchAllSubtitles(force = false) {
        const vk = window.location.href;
        if (!force && vk === currentVideoKey && allSubtitles.length > 0) return;
        currentVideoKey = vk; allSubtitles = []; currentSubtitleData = null;
        selectedSubtitleId = null; adSegments = []; hasJumpedAds = {}; lastAdCheckResult = null; progressMarkInitialized = false; hotComments = [];
        const existingMark = document.getElementById('bse-ad-progress-mark'); if (existingMark) existingMark.remove();
        setLoadingState(true);
        try { allSubtitles = await fetchBilibiliSubtitles(); const commentPromise = fetchHotComments();
            if (allSubtitles.length > 0) await loadSubtitle(allSubtitles[0]); hotComments = await commentPromise;
        } catch (e) {}
        setLoadingState(false);
        updateUI(); updateContent();
    }
    async function loadSubtitle(sub) {
        if (!sub) return;
        if (selectedSubtitleId === sub.id && currentSubtitleData?.body?.length > 0) return; selectedSubtitleId = sub.id; if (autoGenerateTimer) { clearTimeout(autoGenerateTimer); autoGenerateTimer = null;
        }
        const afterLoad = () => { if (autoOpenPanel && !panelVisible) { panelVisible = true;
            document.querySelector('.bse-panel').classList.add('show'); switchTab(autoOpenTab); } if (autoGenSummary && currentSubtitleData?.body?.length && !getCachedSummary(currentVideoKey) && API_KEY && !isGeneratingAI) { autoGenerateTimer = setTimeout(() => { autoGenerateTimer = null; if (isGeneratingAI) return; switchTab('ai'); setTimeout(() => { const btn = document.getElementById('bse-generate-btn'); if (btn && !isGeneratingAI) btn.click(); }, 50); }, 400);
        } };
        if (sub.body?.length > 0) { currentSubtitleData = sub; updateUI(); updateContent(); afterLoad(); return;
        }
        setLoadingState(true); sub.body = await fetchSubtitleContent(sub.subtitle_url); currentSubtitleData = sub; setLoadingState(false); updateUI(); updateContent(); afterLoad();
    }
    function switchTab(tab) {
        currentTab = tab;
        const tabsEl = document.querySelector('.bse-tabs');
        if (tabsEl) tabsEl.classList.toggle('hidden', tab === 'settings');
        document.querySelectorAll('.bse-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

        const fNormal = document.getElementById('bse-footer-normal');
        const fSettings = document.getElementById('bse-footer-settings');
        if (fNormal && fSettings) {
            fNormal.style.display = tab === 'settings' ? 'none' : 'flex';
            fSettings.style.display = tab === 'settings' ? 'flex' : 'none';
        }

        updateContent();
    }

    // ===================== 16. UI 创建与事件 =====================
    function createUI() {
        if (document.querySelector('.bse-container')) return;
        const c = document.createElement('div'); c.className = 'bse-container';
        safeSetInnerHTML(c, `
            <button class="bse-trigger-btn" title="B站字幕AI工具"><svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 10h2v2H6zm0 4h8v2H6zm10 0h2v2h-2zm-6-4h8v2h-8z"/></svg><span class="bse-status-dot"></span></button>
            <div class="bse-panel">
                <div class="bse-header"><div><div class="bse-title">B站字幕获取、AI分析及广告跳过 <span class="bse-platform-tag">BiliBili</span></div><div class="bse-subtitle-info">点击刷新</div><div class="bse-ad-hint" id="bse-ad-hint">广告跳过功能仅在进行AI分析后可用</div></div><div class="bse-header-actions"><button class="bse-icon-btn" id="bse-refresh-btn" title="刷新"><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button><button class="bse-icon-btn settings-btn" id="bse-settings-btn" title="设置"><svg viewBox="0 0 24 24"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.06-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.73,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.06,0.94l-2.03,1.58c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.49-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg></button></div></div>
                <div class="bse-api-warning-container">${!API_KEY ?
                `<div class="bse-api-warning"><span class="bse-api-warning-icon">⚠</span><span class="bse-api-warning-text">未设置API密钥，AI分析功能将无法使用</span><button class="bse-api-warning-btn" id="bse-go-settings">去设置</button></div>` : ''}</div>
                <div class="bse-source-section"><div class="bse-source-header" id="bse-source-toggle"><span class="bse-source-label">选择字幕</span><span class="bse-source-arrow collapsed" id="bse-source-arrow"><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></span></div><div class="bse-source-body hidden" id="bse-source-body"><div style="color:var(--bse-text-dim);font-size:13px;">暂无数据</div></div></div>
                <div class="bse-tabs"><button class="bse-tab active" data-tab="preview">浏览</button><button class="bse-tab" data-tab="ai">AI 分析</button><button class="bse-tab" data-tab="text">文本</button></div>
                <div class="bse-content"><div class="bse-empty">正在初始化...</div></div>
                <div class="bse-footer">
                    <div id="bse-footer-normal" style="display:flex; gap:12px; width:100%;">
                        <button class="bse-btn bse-btn-secondary" id="bse-download-txt-btn" disabled><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>TXT</button>
                        <button class="bse-btn bse-btn-secondary" id="bse-download-srt-btn" disabled><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>SRT</button>
                        <button class="bse-btn bse-btn-primary" id="bse-copy-btn" disabled><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>复制全部</button>
                    </div>
                    <div id="bse-footer-settings" style="display:none; gap:12px; width:100%;">
                        <button class="bse-btn bse-btn-secondary" id="bse-s-cancel">取消</button>
                        <button class="bse-btn bse-btn-primary" id="bse-s-save">保存设置</button>
                    </div>
                </div>
            </div>
        `);
        document.body.appendChild(c); bindEvents(c);
        if (hasUpdate) showUpdateBadgeInPanel();
    }
    function bindEvents(c) {
        const panel = c.querySelector('.bse-panel');
        panel.addEventListener('click', e => e.stopPropagation());
        c.querySelector('.bse-trigger-btn').addEventListener('click', (e) => { e.stopPropagation(); panelVisible = !panelVisible; panel.classList.toggle('show', panelVisible); if (panelVisible && allSubtitles.length === 0) fetchAllSubtitles(); });
        if (_documentClickHandler) { document.removeEventListener('click', _documentClickHandler); }
        _documentClickHandler = e => { if (!panelVisible) return;
            if (!c.contains(e.target)) { panelVisible = false; panel.classList.remove('show'); } };
        document.addEventListener('click', _documentClickHandler);
        c.querySelector('#bse-source-toggle').addEventListener('click', (e) => { e.stopPropagation(); sourceCollapsed = !sourceCollapsed; c.querySelector('#bse-source-body').classList.toggle('hidden', sourceCollapsed); c.querySelector('#bse-source-arrow').classList.toggle('collapsed', sourceCollapsed); });
        c.querySelectorAll('.bse-tab').forEach(tab => tab.addEventListener('click', (e) => { e.stopPropagation(); switchTab(tab.dataset.tab); }));
        c.querySelector('#bse-refresh-btn').addEventListener('click', e => { e.stopPropagation(); if (!isLoading) fetchAllSubtitles(true); });
        c.querySelector('#bse-settings-btn').addEventListener('click', e => { e.stopPropagation(); switchTab(currentTab === 'settings' ? 'preview' : 'settings'); });
        c.querySelector('#bse-go-settings')?.addEventListener('click', e => { e.stopPropagation(); switchTab('settings'); });
        c.querySelector('#bse-copy-btn').addEventListener('click', () => { const t = getFormattedText(); if (t) { GM_setClipboard(t); showToast('✓ 已复制', 'success'); } });
        c.querySelector('#bse-download-txt-btn').addEventListener('click', () => { const t = getFormattedText(); if (t) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' })); a.download = `Subtitle_${Date.now()}.txt`; a.click(); showToast('✓ TXT下载成功', 'success'); } });
        c.querySelector('#bse-download-srt-btn').addEventListener('click', () => { const t = getSRTText(); if (t) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' })); a.download = `Subtitle_${Date.now()}.srt`; a.click(); showToast('✓ SRT下载成功', 'success'); } });

        c.querySelector('#bse-s-cancel')?.addEventListener('click', (e) => { e.stopPropagation(); switchTab('preview'); });
        c.querySelector('#bse-s-save')?.addEventListener('click', (e) => {
            e.stopPropagation();
            bse_platform = document.getElementById('bse-s-platform').value; API_URL = document.getElementById('bse-s-url').value.trim(); API_KEY = document.getElementById('bse-s-key').value.trim();
            const selectedModel = document.getElementById('bse-s-model-select').value; bse_model = selectedModel === '自定义' ? document.getElementById('bse-s-model-custom').value.trim() : selectedModel;
            autoGenSummary = document.getElementById('bse-s-auto').checked; enableOpinionAnalysis = document.getElementById('bse-s-opinion').checked; bse_auto_skip_ad = document.getElementById('bse-s-auto-skip').checked; autoOpenPanel = document.getElementById('bse-s-auto-open').checked; autoOpenTab = document.getElementById('bse-s-auto-tab').value; bse_detail_level = document.getElementById('bse-s-detail').value;
            GM_setValue('bse_platform', bse_platform); GM_setValue('bse_api_url', API_URL); GM_setValue('bse_api_key_'
+ bse_platform, API_KEY); GM_setValue('bse_model', bse_model); GM_setValue('bse_auto_summary', autoGenSummary); GM_setValue('bse_opinion_analysis', enableOpinionAnalysis); GM_setValue('bse_auto_skip_ad', bse_auto_skip_ad); GM_setValue('bse_auto_open_panel', autoOpenPanel); GM_setValue('bse_auto_open_tab', autoOpenTab); GM_setValue('bse_detail_level', bse_detail_level);
            showToast('✓ 设置已保存', 'success');
            switchTab('preview'); panelVisible = false; const container = document.querySelector('.bse-container'); if (container) container.remove(); createUI(); setTimeout(() => fetchAllSubtitles(true), 200);
        });
    }

    // ===================== 17. 文本格式化 =====================
    function getFormattedText() { if (!currentSubtitleData?.body) return '';
        return currentSubtitleData.body.map(it => showTimestamps ? `[${formatTimeWithMs(it.from)} - ${formatTimeWithMs(it.to)}] ${it.content}` : it.content).join('\n');
    }
    function getSRTText() { if (!currentSubtitleData?.body) return ''; return currentSubtitleData.body.map((it, index) => `${index + 1}\n${formatTimeForSRT(it.from)} --> ${formatTimeForSRT(it.to)}\n${it.content}\n`).join('\n');
    }
    function getTimestampedTextForAI() { if (!currentSubtitleData?.body) return ''; return currentSubtitleData.body.map(it => `[${formatTime(it.from)} - ${formatTime(it.to)}] ${it.content}`).join('\n');
    }

    // ===================== 18. UI 状态更新 =====================
    function updateDotState() {
        const dot = document.querySelector('.bse-status-dot');
        if (!dot) return;
        const hasSubtitle = !!(currentSubtitleData?.body?.length);
        const hasSummary = !!getCachedSummary(currentVideoKey);
        if (!hasSubtitle) {
            dot.className = 'bse-status-dot';
        } else if (hasSummary) {
            dot.className = 'bse-status-dot state-green';
        } else {
            dot.className = 'bse-status-dot state-yellow';
        }
    }

    function updateUI() {
        const info = document.querySelector('.bse-subtitle-info'); const copyBtn = document.querySelector('#bse-copy-btn'); const dlTxtBtn = document.querySelector('#bse-download-txt-btn'); const dlSrtBtn = document.querySelector('#bse-download-srt-btn'); const sb = document.querySelector('#bse-source-body');
        if (sb) { if (allSubtitles.length > 0) { safeSetInnerHTML(sb, allSubtitles.map(s => `<div class="bse-subtitle-option ${s.id === selectedSubtitleId ? 'active' : ''}" data-id="${s.id}">${s.lan_doc}<span class="bse-tag ${s.isAI ? 'ai' : 'cc'}">${s.isAI ? 'AI' : 'CC'}</span></div>`).join(''));
            sb.querySelectorAll('.bse-subtitle-option').forEach(o => o.addEventListener('click', (e) => { e.stopPropagation(); const s = allSubtitles.find(x => x.id == o.dataset.id); if (s) loadSubtitle(s); }));
        } else { safeSetInnerHTML(sb, '<div style="color:var(--bse-text-dim);font-size:13px;padding-bottom:4px;">未检测到可用的中文字幕</div>'); } }

        if (currentSubtitleData?.body) {
            if (info) info.textContent = `成功解析 ${currentSubtitleData.body.length} 条字幕 ${hotComments.length} 条评论`; if (copyBtn) copyBtn.disabled = false; if (dlTxtBtn) dlTxtBtn.disabled = false;
            if (dlSrtBtn) dlSrtBtn.disabled = false; } else if (!isLoading) { if (info) info.textContent = allSubtitles.length === 0 ?
            '此视频暂无字幕' : '准备就绪';
        }
        updateDotState();
    }
    function updateContent() { const el = document.querySelector('.bse-content');
        if (!el) return; if (isLoading) { safeSetInnerHTML(el, '<div class="bse-loading"><div class="bse-spinner"></div><div>数据加载中...</div></div>'); return; } switch (currentTab) { case 'preview': renderPreviewTab(el); break;
        case 'ai': renderAITab(el); break; case 'text': renderTextTab(el); break; case 'settings': renderSettingsTab(el); break;
        } }

    // ===================== 19. 浏览页渲染 =====================
    function renderPreviewTab(el) {
        if (!currentSubtitleData?.body?.length) { safeSetInnerHTML(el, '<div class="bse-empty">未获取到字幕，点击刷新以重试</div>');
            return; }
        const body = currentSubtitleData.body, cnt = body.length, dur = body[cnt - 1].to;
        const chars = body.reduce((s, i) => s + i.content.length, 0);
        safeSetInnerHTML(el, `<div class="bse-stats"><div class="bse-stat-item"><div class="bse-stat-label">总条数</div><div class="bse-stat-value">${cnt}</div></div><div class="bse-stat-item"><div class="bse-stat-label">总时长</div><div class="bse-stat-value">${formatTime(dur)}</div></div><div class="bse-stat-item"><div class="bse-stat-label">总字数</div><div class="bse-stat-value">${chars}</div></div></div>${body.slice(0, 1000).map(it => `<div class="bse-subtitle-item" data-time="${it.from}"><div class="bse-ts">${formatTime(it.from)} → ${formatTime(it.to)}</div><div class="bse-st">${it.content}</div></div>`).join('')}${body.length > 1000 ? '<div style="text-align:center;color:var(--bse-text-muted);padding:14px;font-size:13px;">仅展示前1000条</div>' : ''}`);
        el.querySelectorAll('.bse-subtitle-item').forEach(item => item.addEventListener('click', (e) => { e.stopPropagation(); seekToTime(parseFloat(item.dataset.time)); }));
    }

    // ===================== 20. AI 分析页渲染 =====================
    function renderAITab(el) {
        const hasSubtitle = !!(currentSubtitleData?.body?.length);
        const cachedSummary = getCachedSummary(currentVideoKey); const cachedQA = getCachedQA(currentVideoKey);
        if (cachedSummary && cachedQA.length && aiConversationHistory.length < 2) aiConversationHistory = [{ role: 'user', content: getAISummaryPrompt() }, { role: 'assistant', content: cachedSummary }, ...cachedQA.flatMap(qa => [{ role: 'user', content: qa.q }, { role: 'assistant', content: qa.a }])];
        let html = '';
        if (!cachedSummary) {
            html += `<button class="bse-ai-big-btn" id="bse-generate-btn" ${!hasSubtitle ||
            !API_KEY || isGeneratingAI ? 'disabled' : ''}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)"><path d="M4 8L12 16L20 8" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg> ${isGeneratingAI ?
            '生成中...' : 'AI分析'}</button>`;
            if (!hasSubtitle) html += '<div class="bse-empty" style="padding:40px 20px;">请先获取字幕数据</div>'; else if (!API_KEY) html += '<div class="bse-empty" style="padding:40px 20px;">请先在设置中配置API密钥</div>';
        } else {
            const retryHtml = `<button class="bse-retry-btn" id="bse-retry-btn" title="重新生成" ${isGeneratingAI ?
            'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg></button>`;
            if (showRawAIText) { html += `<div style="position:relative;">${retryHtml}<textarea class="bse-text-area" readonly style="min-height:380px;font-family:monospace;font-size:13px;padding-top:20px;">${escapeHtml(cachedSummary)}</textarea></div>`;
            }
            else {
                const adData = lastAdCheckResult ||
                extractAdSegments(cachedSummary); if (!lastAdCheckResult) lastAdCheckResult = adData; adSegments = adData.segments; if (adSegments.length > 0) initProgressMark();
                if (adData.type === 'has_ad' && adSegments.length > 0) html += `<div class="bse-sp-box status-found"><div class="bse-sp-header"><span class="bse-sp-icon">!</span><span class="bse-sp-title">检测到视频植入广告</span></div><div class="bse-sp-hint">${bse_auto_skip_ad ?
                '进度条已标黄提示，将自动跳过' : '进度条已标黄提示，自动跳过已关闭'}</div><div class="bse-sp-action-row"><span class="bse-sp-badge">${adSegments[0].startStr} - ${adSegments[0].endStr}</span><button class="bse-sp-skip" data-end="${adSegments[0].end}">立即跳过</button></div></div>`;
                else if (adData.type === 'none') html += `<div class="bse-sp-box status-none"><div class="bse-sp-header"><span class="bse-sp-icon">✓</span><span class="bse-sp-title">未检测到视频植入广告</span></div></div>`;
                else html += `<div class="bse-sp-box status-err"><div class="bse-sp-header"><span class="bse-sp-icon">⚠</span><span class="bse-sp-title">广告时间段格式解析异常</span></div></div>`;
                const displaySummary = stripAdLine(cachedSummary);
                html += `<div style="position:relative;">${retryHtml}<div class="bse-ai-result bse-markdown" id="bse-ai-result">${markdownToHtml(displaySummary)}</div></div>`;
                if (cachedQA.length) html += cachedQA.map(qa => `<div class="bse-qa-item"><div class="bse-qa-q">💭 ${escapeHtml(qa.q)}</div><div class="bse-qa-a bse-markdown">${markdownToHtml(qa.a)}</div></div>`).join('');
                html += `<div class="bse-followup-section"><div class="bse-followup-label"><svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>追问</div><textarea class="bse-followup-input" id="bse-followup-input" placeholder="就视频内容提问" ${isGeneratingAI ?
                'disabled' : ''}></textarea><button class="bse-followup-btn" id="bse-followup-btn" ${isGeneratingAI ? 'disabled' : ''}>${isGeneratingAI ? '生成中...' : '发送追问'}</button></div>`;
            }
            html += `<div style="display:flex;justify-content:flex-end;margin-top:16px;"><label class="bse-checkbox-label" style="font-size:13px;color:var(--bse-text-muted);"><input type="checkbox" id="bse-raw-toggle" ${showRawAIText ?
            'checked' : ''}>显示原始返回文本</label></div>`;
        }
        safeSetInnerHTML(el, html);
        async function doGenerate(e) { if (e) e.stopPropagation();
            if (isGeneratingAI) return; if (!hasSubtitle || !API_KEY) return; if (aiSummaryCache[currentVideoKey]) { delete aiSummaryCache[currentVideoKey]; aiConversationHistory = []; GM_setValue('aiSummaryCache', aiSummaryCache);
            } lastAdCheckResult = null; isGeneratingAI = true; const myGenerationId = ++currentGenerationId; const genBtn = document.getElementById('bse-generate-btn'); const retryBtn = document.getElementById('bse-retry-btn');
            if (genBtn) genBtn.disabled = true; if (retryBtn) retryBtn.disabled = true; safeSetInnerHTML(el, `<div class="bse-ai-result bse-markdown" id="bse-stream-body" style="min-height:400px;overflow-y:auto;"><div class="bse-loading"><div class="bse-spinner"></div><div>生成中...</div></div></div>`);
            const streamEl = document.getElementById('bse-stream-body'); try { await generateAISummaryStream(getTimestampedTextForAI(), streamEl); if (myGenerationId !== currentGenerationId) return; if (currentTab === 'ai') { renderAITab(el);
            el.scrollTop = 0; } showToast('✓ 解析完成', 'success'); updateDotState(); } catch (e) { if (myGenerationId !== currentGenerationId) return; showToast(`✗ 失败: ${e.message}`, 'error');
            delete aiSummaryCache[currentVideoKey]; GM_setValue('aiSummaryCache', aiSummaryCache); if (currentTab === 'ai') renderAITab(el); } finally { if (myGenerationId === currentGenerationId) isGeneratingAI = false;
            } }
        document.getElementById('bse-generate-btn')?.addEventListener('click', doGenerate); document.getElementById('bse-retry-btn')?.addEventListener('click', doGenerate);
        document.getElementById('bse-raw-toggle')?.addEventListener('change', e => { showRawAIText = e.target.checked; renderAITab(el); });
        el.querySelector('.bse-sp-skip')?.addEventListener('click', e => { e.stopPropagation(); seekToTime(parseFloat(e.currentTarget.dataset.end)); });
        const fBtn = document.getElementById('bse-followup-btn'), fInput = document.getElementById('bse-followup-input');
        if (fBtn && fInput) { const send = async () => { const q = fInput.value.trim();
            if (!q) return; if (isGeneratingAI) { showToast('请等待当前生成完成', 'warning'); return; } isGeneratingAI = true; const myGenerationId = ++currentGenerationId; fBtn.disabled = true;
            fBtn.textContent = '思考中...'; fInput.disabled = true; const followupSection = el.querySelector('.bse-followup-section'); const answerId = 'bse-ans-' + Date.now(); const qaEl = document.createElement('div');
            qaEl.className = 'bse-qa-item'; safeSetInnerHTML(qaEl, `<div class="bse-qa-q">💭 ${escapeHtml(q)}</div><div class="bse-qa-a bse-markdown" id="${answerId}"><div style="display:flex;align-items:center;gap:8px;color:var(--bse-text-muted);"><span class="bse-spinner" style="width:16px;height:16px;border-width:2px;"></span>正在解答...</div></div>`); followupSection.insertAdjacentElement('beforebegin', qaEl); const ansEl = document.getElementById(answerId);
            aiConversationHistory.push({ role: 'user', content: q }); try { const a = await callAPIStream(aiConversationHistory, text => { if (myGenerationId !== currentGenerationId) return; safeSetInnerHTML(ansEl, markdownToHtml(text)); });
            if (myGenerationId !== currentGenerationId) return; aiConversationHistory.push({ role: 'assistant', content: a }); appendCachedQA(currentVideoKey, q, a); fInput.value = ''; showToast('✓ 回复完成', 'success');
            } catch (e) { if (myGenerationId !== currentGenerationId) return; safeSetInnerHTML(ansEl, `<span style="color:#ef4444;">❌ 追问失败: ${e.message}</span>`); aiConversationHistory.pop(); showToast(`✗ 出错: ${e.message}`, 'error');
            } finally { if (myGenerationId === currentGenerationId) { isGeneratingAI = false; fBtn.disabled = false; fBtn.textContent = '发送追问'; fInput.disabled = false;
            fInput.focus(); } } }; fBtn.addEventListener('click', e => { e.stopPropagation(); send(); });
            fInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); send(); } });
        }
    }

    // ===================== 21. 文本页渲染 =====================
    function renderTextTab(el) { if (!currentSubtitleData?.body?.length) { safeSetInnerHTML(el, '<div class="bse-empty">暂无数据</div>');
        return; } safeSetInnerHTML(el, `<div class="bse-text-controls"><label class="bse-checkbox-label"><input type="checkbox" id="bse-ts-toggle" ${showTimestamps ? 'checked' : ''}>显示时间戳</label><span style="font-size:12px;color:var(--bse-text-muted);">${showTimestamps ? '格式:[MM:SS.ms]' : '纯文本'}</span></div><textarea class="bse-text-area" id="bse-text-out" readonly>${getFormattedText()}</textarea>`);
        document.getElementById('bse-ts-toggle')?.addEventListener('change', e => { showTimestamps = e.target.checked; document.getElementById('bse-text-out').value = getFormattedText(); });
    }

    // ===================== 22. 设置页渲染 =====================
    function renderSettingsTab(el) {
        const pOptions = Object.keys(API_PLATFORMS).map(k => `<option value="${k}" ${bse_platform === k ? 'selected' : ''}>${API_PLATFORMS[k].name}</option>`).join('');
        const tabOptions = Object.keys(TAB_OPTIONS).map(k => `<option value="${k}" ${autoOpenTab === k ? 'selected' : ''}>${TAB_OPTIONS[k]}</option>`).join('');
        const detailOptions = Object.keys(DETAIL_LEVELS).map(k => `<option value="${k}" ${bse_detail_level === k ? 'selected' : ''}>${DETAIL_LEVELS[k]}</option>`).join('');
        const currentPlatformKey = GM_getValue('bse_api_key_' + bse_platform, '');
        const updateBadgeHtml = hasUpdate ? ` <a href="${updateLinkUrl || SCRIPTCAT_URL}" target="_blank" class="bse-update-badge">新版本 v${latestVersion}</a>` : '';
        safeSetInnerHTML(el, `<div style="padding:10px 0;">

            <div class="bse-settings-group">
                <div class="bse-settings-group-title"><span class="bse-settings-group-title-dot"></span>AI 设置</div>

                <div class="bse-settings-subgroup">
                    <div class="bse-settings-subgroup-title">API</div>
                    <div class="bse-settings-block"><label class="bse-settings-block-label">API 平台</label><select class="bse-settings-input" id="bse-s-platform">${pOptions}</select><div style="margin-top:8px;"><a id="bse-s-link" href="#" target="_blank" style="font-size:12px;color:var(--bse-primary);text-decoration:none;">获取 API Key →</a></div></div>
                    <div class="bse-settings-block" id="bse-url-wrapper" style="display: ${bse_platform === 'custom' ? 'block' : 'none'};"><label class="bse-settings-block-label">API URL Endpoint</label><input type="text" class="bse-settings-input" id="bse-s-url" value="${escapeHtml(API_URL)}"></div>
                    <div class="bse-settings-block"><label class="bse-settings-block-label">模型 (Model)</label><select class="bse-settings-input" id="bse-s-model-select"></select><input type="text" class="bse-settings-input" id="bse-s-model-custom" style="margin-top:8px;display:none;" placeholder="输入自定义模型名..." value="${escapeHtml(bse_model)}"></div>
                    <div class="bse-settings-block"><label class="bse-settings-block-label">API Key</label><input type="password" class="bse-settings-input" id="bse-s-key" value="${escapeHtml(currentPlatformKey)}" placeholder="输入API Key.."></div>
                </div>

                <div class="bse-settings-subgroup">
                    <div class="bse-settings-subgroup-title">AI 总结</div>
                    <div class="bse-settings-block"><label class="bse-settings-block-label">AI 总结详细度</label><select class="bse-settings-input" id="bse-s-detail">${detailOptions}</select></div>
                    <div class="bse-settings-block"><label class="bse-settings-check-row"><input type="checkbox" id="bse-s-auto" ${autoGenSummary ? 'checked' : ''}><div class="bse-settings-check-text"><span class="bse-settings-check-title">自动 AI 分析</span><span class="bse-settings-check-desc">开启后每次打开带字幕的视频将自动进行AI分析，可能消耗较多 Tokens。</span></div></label></div>
                </div>

                <div class="bse-settings-subgroup">
                    <div class="bse-settings-subgroup-title">拓展功能</div>
                    <div class="bse-settings-block"><label class="bse-settings-check-row"><input type="checkbox" id="bse-s-auto-skip" ${bse_auto_skip_ad ? 'checked' : ''}><div class="bse-settings-check-text"><span class="bse-settings-check-title">广告自动跳过</span><span class="bse-settings-check-desc">开启后检测到广告时段将自动跳过。关闭后仅在进度条标黄提示，不自动跳转。</span></div></label></div>
                    <div class="bse-settings-block"><label class="bse-settings-check-row"><input type="checkbox" id="bse-s-opinion" ${enableOpinionAnalysis ? 'checked' : ''}><div class="bse-settings-check-text"><span class="bse-settings-check-title">舆论分析（热门评论）</span><span class="bse-settings-check-desc">开启后AI分析将获取前30条热门评论并包含对评论的舆论倾向分析。</span></div></label></div>
                </div>
            </div>

            <div class="bse-settings-group">
                <div class="bse-settings-group-title"><span class="bse-settings-group-title-dot"></span>面板设置</div>
                <div class="bse-settings-subgroup">
                    <div class="bse-settings-block"><label class="bse-settings-check-row"><input type="checkbox" id="bse-s-auto-open" ${autoOpenPanel ? 'checked' : ''}><div class="bse-settings-check-text"><span class="bse-settings-check-title">自动打开面板</span><span class="bse-settings-check-desc">开启后自动打开面板。仅在有字幕的视频中生效。</span></div></label></div>
                    <div class="bse-settings-block"><label class="bse-settings-block-label">自动打开面板时显示的标签页</label><select class="bse-settings-input" id="bse-s-auto-tab" ${!autoOpenPanel ? 'disabled' : ''}>${tabOptions}</select></div>
                </div>
            </div>

            <div class="bse-author-info"><div class="bse-ext-links"><a href="${GITHUB_REPO_URL}" target="_blank" class="bse-ext-link"><svg viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>GitHub</a><a href="${GREASYFORK_URL}" target="_blank" class="bse-ext-link"><svg viewBox="0 0 1024 1024"><path d="M514.56 514.56m-486.4 0a486.4 486.4 0 1 0 972.8 0 486.4 486.4 0 1 0-972.8 0Z"/><path d="M389.376 249.856c102.0416 103.0144 103.9872 105.8816 99.1744 141.5168-3.84 37.5296-3.84 37.5296 172.3392 216.576 97.2288 98.2016 177.152 183.8592 177.152 190.6176 0 26.9312-21.1968 49.1008-45.2608 49.1008-20.224 0-62.5664-36.5568-204.0832-177.152-153.088-152.1152-181.9648-176.1792-196.4032-168.448-31.744 18.2784-57.7536 0.9728-159.7952-101.0688-76.0832-76.0832-98.2016-103.9872-93.3888-117.4528 5.7856-14.4384 19.2512-3.84 82.7904 58.7264L298.9056 418.304l21.1968-21.1968 21.1968-21.1968-75.1104-75.9808c-50.0736-51.0464-71.2192-77.9776-63.5392-82.7904 7.68-4.8128 38.5024 20.224 85.6576 66.4064L361.472 356.7104l22.1184-21.1968 21.1968-22.1184-73.1648-73.1648C268.0832 175.7184 250.7776 144.896 277.7088 144.896c3.84 0 53.9136 47.2064 111.6672 104.96z" fill="#FFFFFF"/></svg>Greasy Fork</a><a href="${SCRIPTCAT_URL}" target="_blank" class="bse-ext-link"><svg t="1781970584196" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" width="14" height="14"><path fill="currentColor" d="M501.333333 273.322667c-63.146667 0-69.461333 6.698667-102.144 6.698666C371.968 280.021333 290.218667 213.333333 249.386667 213.333333c-40.874667 0-88.533333 24.021333-88.533334 93.354667v80c0.085333 20.992 7.68 85.333333 37.546667 68.138667-35.285333 41.728-38.826667 90.410667-38.357333 137.514666-9.514667 2.730667-19.2 5.845333-28.629334 9.045334-29.184 9.984-60.16 22.698667-74.112 31.744a32 32 0 0 0 34.730667 53.76c6.656-4.309333 30.762667-14.933333 60.074667-24.96l9.728-3.2c1.962667 18.474667 6.869333 35.413333 14.165333 50.773333l-1.024 0.554667c-17.493333 9.216-33.706667 19.84-44.032 26.581333l-4.821333 3.157333a32 32 0 1 0 34.730666 53.76l5.589334-3.669333c10.453333-6.826667 23.850667-15.573333 38.442666-23.253333 3.413333-1.834667 6.698667-3.456 9.856-4.949334C288.554667 830.933333 421.12 853.333333 501.333333 853.333333s212.778667-22.4 286.592-91.648c3.157333 1.493333 6.4 3.114667 9.856 4.949334 14.592 7.68 27.989333 16.426667 38.442667 23.253333l5.589333 3.669333a32 32 0 0 0 34.730667-53.76l-4.821333-3.157333a555.008 555.008 0 0 0-44.032-26.581333l-1.024-0.554667c7.296-15.36 12.202667-32.298667 14.165333-50.773333l9.728 3.2c29.312 10.026667 53.418667 20.650667 60.117333 24.96a32 32 0 0 0 34.688-53.76c-13.952-9.045333-44.928-21.76-74.069333-31.744-9.429333-3.2-19.157333-6.314667-28.672-9.088 0.512-47.104-3.072-95.744-38.4-137.472 29.866667 17.194667 37.546667-47.146667 37.589333-68.181334V306.688C841.813333 237.354667 794.154667 213.333333 753.28 213.333333c-40.832 0-122.581333 66.688-149.76 66.688-32.725333 0-39.04-6.698667-102.186667-6.698666z"/></svg>脚本猫(支持直连)</a></div><p class="bse-author-text">作者: <a href="[https://github.com/LiuMashiro](https://github.com/LiuMashiro)" target="_blank" class="bse-author-link">LiuMashiro</a></p><p class="bse-author-text" style="margin-top:8px;">字幕获取模块部分使用了M0M Chen的 视频字幕提取器Pro 代码（MIT）</p><p class="bse-author-text" style="margin-top:12px;font-size:12px;">当前版本: v${SCRIPT_VERSION}${updateBadgeHtml}</p></div>
        </div>`);
        const pSelect = document.getElementById('bse-s-platform'); const urlWrapper = document.getElementById('bse-url-wrapper'); const urlInput = document.getElementById('bse-s-url'); const mSelect = document.getElementById('bse-s-model-select'); const mCustom = document.getElementById('bse-s-model-custom');
        const pLink = document.getElementById('bse-s-link'); const autoOpenCheckbox = document.getElementById('bse-s-auto-open'); const autoTabSelect = document.getElementById('bse-s-auto-tab');

        let previousPlatform = bse_platform;
        function updateUIForPlatform(isInit = false) { const plat = pSelect.value; const pData = API_PLATFORMS[plat]; pLink.href = pData.link; pLink.style.display = pData.link ?
        'inline-block' : 'none'; urlWrapper.style.display = plat === 'custom' ? 'block' : 'none';
        if (!isInit || plat !== 'custom') { if (plat !== 'custom') urlInput.value = pData.url; } urlInput.disabled = plat !== 'custom';
        const models = pData.models; mSelect.innerHTML = models.map(m => `<option value="${m}">${m}</option>`).join(''); if (isInit) { if (models.includes(bse_model)) mSelect.value = bse_model;
        else { mSelect.value = '自定义'; mCustom.value = bse_model; } } else mSelect.selectedIndex = 0; updateModelCustom();
        }
        function updateModelCustom() { mCustom.style.display = mSelect.value === '自定义' ? 'block' : 'none';
        }
        autoOpenCheckbox.addEventListener('change', () => { autoTabSelect.disabled = !autoOpenCheckbox.checked; });
        pSelect.addEventListener('change', () => {
            const currentKeyInput = document.getElementById('bse-s-key');
            GM_setValue('bse_api_key_' + previousPlatform, currentKeyInput.value);
            previousPlatform = pSelect.value;
            updateUIForPlatform(false);
            const newPlatformKey = GM_getValue('bse_api_key_' + pSelect.value, '');
            currentKeyInput.value = newPlatformKey;
        });
        mSelect.addEventListener('change', updateModelCustom); updateUIForPlatform(true);
    }

    // ===================== 23. 初始化与路由监听 =====================
    function init() { log('B站字幕获取、AI分析及广告跳过工具 v' + SCRIPT_VERSION + ' 已加载。作者：LiuMashiro');
        aiSummaryCache = loadCache(); createUI(); setTimeout(() => { fetchAllSubtitles(); initAdSkipMonitor(); }, 1500); setTimeout(() => { checkForUpdates(); }, 5000);
    }
    function resetState() { if (autoGenerateTimer) { clearTimeout(autoGenerateTimer); autoGenerateTimer = null; } currentGenerationId++; isGeneratingAI = false;
        progressMarkInitialized = false; lastAdCheckResult = null; currentVideoKey = null; currentAid = null; hotComments = []; allSubtitles = [];
        currentSubtitleData = null; selectedSubtitleId = null; aiConversationHistory = []; adSegments = []; hasJumpedAds = {}; showRawAIText = false;
        const existingMark = document.getElementById('bse-ad-progress-mark'); if (existingMark) existingMark.remove(); updateUI(); setTimeout(() => fetchAllSubtitles(), 1500); }
    let lastUrl = location.href;
    new MutationObserver(() => { if (location.href !== lastUrl) { lastUrl = location.href; resetState(); } }).observe(document, { subtree: true, childList: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
