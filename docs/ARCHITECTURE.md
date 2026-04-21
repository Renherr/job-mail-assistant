# 模型与流程架构图

## 1. 总体架构

```mermaid
flowchart LR
    Mail["163 邮箱 IMAP"] --> Sync["mailSyncService"]
    Sync --> Decode["源码解码<br/>HTML / quoted-printable / base64"]
    Decode --> Classifier["jobClassifier"]
    Classifier --> EmailRepo["emailRepository"]
    Classifier --> AppRepo["applicationRepository"]
    Classifier --> TaskSvc["taskService"]
    TaskSvc --> TaskRepo["taskRepository"]
    EmailRepo --> MySQL["MySQL"]
    AppRepo --> MySQL
    TaskRepo --> MySQL
    MySQL --> Dashboard["dashboardRepository"]
    Dashboard --> IPC["Electron IPC"]
    IPC --> UI["Renderer UI"]
```

## 2. 同步与分类流程

```mermaid
flowchart TD
    A["点击同步邮件"] --> B["读取 sync_state"]
    B --> C["连接 IMAP"]
    C --> D["搜索邮件 UID"]
    D --> E["拉取 envelope"]
    E --> F{"像求职邮件吗？"}
    F -- 否 --> G["跳过"]
    F -- 是 --> H["拉取完整源码"]
    H --> I["解码邮件正文"]
    I --> J["提取公司 / 岗位 / 阶段 / 时间 / 链接"]
    J --> K["写入 emails"]
    K --> L["聚合到 applications"]
    L --> M["生成 / 更新 tasks"]
    M --> N["更新 sync_state"]
```

## 3. 数据聚合视图

```mermaid
flowchart TD
    E["emails"] --> A["applications"]
    E --> T["tasks"]
    A --> D["dashboardRepository"]
    T --> D
    D --> U["桌面摘要 / 申请卡片 / 待办清单"]
```

## 4. 模块职责

### `mailSyncService`

- 管理 IMAP 连接
- 执行首次同步与增量同步
- 预处理邮件源码
- 提取重要链接

### `jobClassifier`

- 判定是否属于求职邮件
- 识别邮件类型
- 提取公司名、岗位名、关键时间、摘要
- 生成建议动作

### `applicationRepository`

- 维护申请聚合记录
- 支持模糊归并同公司记录
- 支持手动修改

### `dashboardRepository`

- 为首页提供摘要统计
- 输出待办和申请卡片所需字段

### Renderer

- 展示今日摘要
- 展示待办清单
- 展示申请卡片
- 打开重要链接
- 手动修正申请信息

## 5. 未来 AI 兜底位置

推荐接入位置：

```mermaid
flowchart LR
    Decode["邮件解码后正文"] --> Rule["规则分类器"]
    Rule --> Check{"字段完整吗？"}
    Check -- 是 --> Output["直接入库"]
    Check -- 否 --> AI["AI 结构化提取"]
    AI --> Merge["结果合并与校验"]
    Merge --> Output
```

建议 AI 只做兜底，而不是替代全部规则逻辑。
