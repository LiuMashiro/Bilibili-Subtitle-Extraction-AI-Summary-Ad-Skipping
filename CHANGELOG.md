# Changelog
All notable changes to this project will be documented in this file.

## [1.3.2]
### Added
- 热门评论舆情分析功能。

## [1.2.3]

### Added
- 支持更多主流 AI 平台：DeepSeek、智谱、豆包、ChatGPT、Gemini 及自定义 API 接口，且各平台预置主流模型列表
- 新增 SRT 字幕导出格式
- 新增面板自动弹出、默认标签页设置选项
- 新增请求 ID 与并发锁机制，避免 AI 请求重复冲突
- 新增 TrustedTypes 安全渲染策略，防范 XSS 风险

### Changed
- 整体代码调整，增强性能、安全性和稳定性。
- 优化本地保存系统
- 细化日志
- 优化 AI 系统
- 缩短广告跳过轮询间隔，提升跳广告响应速度
- 视觉优化

### Fixed
- 缓解可能误识别广告的问题
- 缓解可能的状态残留问题
- 修复重复触发、解析、调用的问题
