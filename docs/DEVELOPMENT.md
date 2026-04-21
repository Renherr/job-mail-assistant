# 开发手册

## 1. 项目目标

这个项目是一个个人使用的本地求职邮件助手，目标是：

- 尽量少依赖
- 先能用，再逐步增强
- 不拆独立后端
- 保持数据结构清晰，后续便于接入 AI

## 2. 本地运行环境

建议环境：

- Node.js 18+
- MySQL 8.x
- Windows 桌面环境

安装依赖：

```bash
npm install
```

启动：

```bash
npm start
```

## 3. 配置文件

本地配置文件为：

- `config.local.json`

示例模板：

- `config.example.json`

注意：

- `config.local.json` 含本地数据库和邮箱配置，不应提交到 Git
- 163 邮箱应填写 IMAP 授权密码

## 4. 模块分层

### Electron 层

- `src/main.js`
  - 创建桌面窗口
  - 暴露 IPC 接口
  - 串联数据库读取、邮件同步、手动修改、待办更新

- `src/preload.js`
  - 向前端暴露安全的 API

### 数据层

- `src/db/mysql.js`
  - MySQL 连接池与查询封装

- `src/db/schema.js`
  - 启动时自动补齐表结构和列

### Repository 层

- `applicationRepository.js`
  - 应用进度的聚合、查找、更新、手动修改

- `emailRepository.js`
  - 邮件入库、邮件详情更新、挂接 application

- `taskRepository.js`
  - 待办创建与状态更新

- `dashboardRepository.js`
  - 首页摘要、待办、申请卡片读取

- `syncStateRepository.js`
  - 增量同步时间记录

### Service 层

- `mailSyncService.js`
  - IMAP 连接
  - 增量同步
  - 邮件源码解码
  - 重要链接提取

- `jobClassifier.js`
  - 求职相关性判断
  - 邮件类型分类
  - 公司名 / 岗位名 / 时间 / 摘要提取

- `taskService.js`
  - 根据分类结果生成待办

### Renderer 层

- `src/renderer/index.html`
- `src/renderer/app.js`
- `src/renderer/styles.css`

负责桌面界面展示和交互。

## 5. 数据模型

### applications

表示一条申请进度聚合记录。

核心字段：

- `company_name`
- `role_name`
- `current_stage`
- `summary`
- `important_link`
- `last_activity_at`
- `latest_email_id`

### emails

表示一封原始邮件的结构化入库结果。

核心字段：

- `message_id`
- `subject`
- `from_address`
- `body_text`
- `mail_type`
- `needs_action`
- `action_deadline`
- `suggested_action`
- `application_id`
- `raw_ai_result`

### tasks

表示从邮件中提取出的待办。

核心字段：

- `title`
- `description`
- `due_at`
- `priority`
- `status`
- `completed_at`

## 6. 邮件同步逻辑

同步入口：

- Renderer 点击“同步邮件”
- 主进程调用 `mailSyncService.syncRecentEmails`

主要步骤：

1. 读取 `sync_state`，确定增量起点
2. 连接 163 IMAP
3. 搜索时间范围内邮件 UID
4. 先取 envelope 预判是否可能为求职邮件
5. 若疑似求职邮件，再拉取详细源码
6. 解码正文
7. 做结构化分类
8. 写入 `emails`
9. 聚合到 `applications`
10. 生成或更新 `tasks`

## 7. 当前分类策略

当前主要走规则引擎，覆盖：

- 投递成功
- 在线笔试邀请
- 在线测评邀请
- 面试邀请
- 信息补充 / 登记
- 校招活动通知

规则还会尝试提取：

- 公司名
- 岗位名
- 开始时间
- 截止时间
- 时长
- 重要链接

## 8. AI 扩展建议

当前项目已经预留 `ai.enabled` 配置位。

推荐的 AI 接入策略不是“所有邮件都发给大模型”，而是：

1. 先走本地规则
2. 只有在规则结果缺失或置信度低时才调用 AI
3. AI 必须输出固定 JSON 结构

建议输出字段：

- `company_name`
- `role_name`
- `mail_type`
- `current_stage`
- `summary`
- `needs_action`
- `action_deadline`
- `important_link`
- `task_title`

## 9. 常见开发注意事项

- 不要提交 `config.local.json`
- 不要把真实邮箱授权码写入仓库
- PowerShell 终端可能显示中文乱码，但不代表文件本身编码错误
- Electron 启动在沙箱环境下可能需要提权
- 回填脚本务必显式关闭 MySQL 连接，否则 `node` 进程会长时间挂住

## 10. 后续建议迭代

### 优先级高

- 强化阿里、海康、拼多多等常见模板的时间 / 链接提取
- 加强历史申请归并逻辑
- 提高岗位名抽取准确率

### 优先级中

- 增加邮件详情页
- 增加定时同步
- 增加导出 / 备份

### 优先级低

- 增加 AI 兜底
- 增加多邮箱支持
- 增加系统通知
