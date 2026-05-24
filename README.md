# B站字幕获取、AI分析及广告跳过工具
**Bilibili-Subtitle-Extraction-AI-Summary-Ad-Skipping**

实现字幕提取、AI内容总结（并可追问）、**植入广告自动识别自动跳过**。

<div style="display: flex; flex-wrap: nowrap; gap: 4px; max-width: 90%; margin: 0 auto;">
  <img src="https://github.com/user-attachments/assets/0b342f2a-b0c4-488d-9ca3-a878bf20b9cc" alt="图片1" style="width: 32%; height: auto;">
  <img src="https://github.com/user-attachments/assets/52ebf52a-03ab-4462-a528-72b80b8a826c" alt="图片2" style="width: 32%; height: auto;">
  <img src="https://github.com/user-attachments/assets/366c6eb0-dbdc-412e-84c7-58c0f13f5327" alt="图片3" style="width: 32%; height: auto;">
</div>



## 主要功能
- 自动获取视频CC字幕、AI字幕
- AI总结视频内容，基于视频内容AI问答
- **识别内嵌植入广告，自动跳过广告片段**
- 进度条上标注广告区间
- 字幕复制、文本下载、时间戳切换
- 自定义大模型API接口与密钥
- 视频内容本地缓存，避免重复请求
- 适配普通视频、番剧、稍后再看播放页
- 点击字幕跳转到指定时间

## 快速使用
- 安装脚本
  - [在GreasyFork下载](https://greasyfork.org/zh-CN/scripts/579482-b%E7%AB%99%E5%AD%97%E5%B9%95%E8%8E%B7%E5%8F%96-ai%E5%88%86%E6%9E%90%E5%8F%8A%E5%B9%BF%E5%91%8A%E8%B7%B3%E8%BF%87%E5%B7%A5%E5%85%B7)
  - 或者，下载/复制脚本文件，在篡改猴/油猴中导入
- 打开哔哩哔哩视频播放页，点击右侧悬浮按钮唤起功能面板

## API配置
- 支持用户自定义API。
<img src="https://github.com/user-attachments/assets/597447dd-2082-49de-88d7-dba6e368c418" style="width:40%; height:auto;">


## 使用须知
- 本脚本为个人编程学习、技术研究、代码练习用途开源免费分享，仅用于学习前端交互、网页脚本逻辑等，不用于任何商业盈利。
- 所有下载、复制、运行、修改本脚本的使用者，均为自愿自主使用。使用者需事先自行查阅并遵守哔哩哔哩平台用户协议、网络服务规则、国家相关法律法规，自行判断使用行为是否合规。因私自运行、滥用脚本所产生的账号封禁、权限限制、民事纠纷、行政处罚等一切后果，均由使用者本人独立承担，开发者不承担任何连带、补充赔偿与相关责任。若发生侵权行为，责任由实际操作人承担。
- 脚本仅模拟常规页面进度拖拽操作，不破解任何内容。
- 本脚本按现有代码现状开源交付，不提供保证。
- 严禁将本脚本用于恶意营销、外挂售卖、批量骚扰、不正当竞争、违反公序良俗等行为，否则后果自负。
- 任何个人或机构若认为本项目侵害自身合法权益，可提交正规权属证明发起合规投诉，开发者收到有效通知后，将第一时间下架项目、停止相关代码公开。
- 只要您下载、查看、运行、引用本项目任意代码片段，即表示您已完整阅读、理解并自愿接受本全部免责条款，放弃向项目开发者追责、索赔的相关权利。
- 本项目与哔哩哔哩无隶属关系。
- 字幕获取模块部分使用了M0M Chen的 视频字幕提取器Pro 代码（MIT）。
