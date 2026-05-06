# 部署说明

本文说明平台、MySQL、Redis、弹性工作服务器、3D-Model-Optimizer 和 Area-Target-Scanner 应该如何部署在一起。

## 部署目标

平台分成两层：

- 控制层：对外 API、MySQL 任务数据库、Redis 队列、COS 存储桶，以及前端查询任务状态所需的接口。
- 处理层：弹性的复合工作节点。每个节点都可以处理 `model-optimization` 和 `area-target-processing` 两类任务。

队列就是负载均衡器。如果所有工作节点都在忙，任务继续停留在队列中，直到有节点释放处理能力。

## 生产拓扑

```mermaid
flowchart TB
  Frontend["前端"]
  ApiLb["API 负载均衡"]
  Api["平台 API<br/>apps/api"]
  Db["MySQL<br/>任务数据库"]
  Queue["Redis + BullMQ<br/>任务队列"]
  Cos["COS 存储桶<br/>uploads/ 和 results/"]

  subgraph Asg["弹性工作服务器组"]
    Node1["复合工作节点 1"]
    Node2["复合工作节点 2"]
    NodeN["复合工作节点 N"]
  end

  Frontend -->|"创建任务 / 查询状态"| ApiLb
  ApiLb --> Api
  Api -->|"创建和更新任务"| Db
  Api -->|"发布任务消息"| Queue
  Api -->|"签发上传 / 下载 URL"| Cos
  Frontend -->|"直传源资产"| Cos

  Queue -->|"有容量时领取"| Node1
  Queue -->|"有容量时领取"| Node2
  Queue -->|"有容量时领取"| NodeN

  Node1 -->|"下载源文件 / 上传结果"| Cos
  Node2 -->|"下载源文件 / 上传结果"| Cos
  NodeN -->|"下载源文件 / 上传结果"| Cos

  Node1 -->|"更新任务状态"| Db
  Node2 -->|"更新任务状态"| Db
  NodeN -->|"更新任务状态"| Db
```

## 复合工作节点

每台弹性服务器都应该运行 worker agent 所需的本地处理依赖。

```mermaid
flowchart TB
  subgraph Node["弹性工作服务器"]
    Worker["平台 Worker Agent<br/>apps/worker"]
    Ats["Area-Target-Scanner<br/>处理服务"]
    Optimizer["3D-Model-Optimizer<br/>优化服务"]
    Temp["本地临时工作目录"]
  end

  Queue["任务队列"] -->|"租约 / ACK 消息"| Worker
  Worker -->|"下载源文件"| Cos["COS 存储桶"]
  Worker -->|"pipelineType=model-optimization"| Optimizer
  Worker -->|"pipelineType=area-target-processing"| Ats
  Ats -->|"本机模型优化依赖"| Optimizer
  Worker --> Temp
  Ats --> Temp
  Optimizer --> Temp
  Worker -->|"上传结果产物"| Cos
```

第一版生产环境建议：

```text
WORKER_CONCURRENCY=1
```

也就是每台服务器同一时间只处理一个重任务。这样更稳，因为 Area-Target-Scanner 和 3D-Model-Optimizer 都可能大量消耗 CPU、内存、磁盘和临时工作空间。

## 任务流：普通模型优化

```mermaid
sequenceDiagram
  participant User as 前端
  participant API as 平台 API
  participant COS as COS
  participant Q as 队列
  participant W as 工作节点
  participant O as 3D-Model-Optimizer
  participant DB as 任务数据库

  User->>API: 创建 model-optimization 任务
  API->>DB: 创建任务：created
  API-->>User: 返回签名上传 URL
  User->>COS: 上传源模型或压缩包
  API->>DB: 标记任务为 queued
  API->>Q: 发布任务消息
  W->>Q: 有容量时领取消息
  W->>DB: 标记任务为 processing
  W->>COS: 下载源文件
  W->>O: 本机优化模型
  O-->>W: optimized.glb
  W->>COS: 上传 results/{jobId}/optimized.glb
  W->>DB: 标记任务为 completed
  W->>Q: ACK 消息
  User->>API: 查询任务状态和结果 URL
```

## 任务流：Area Target 处理

```mermaid
sequenceDiagram
  participant User as 前端
  participant API as 平台 API
  participant COS as COS
  participant Q as 队列
  participant W as 工作节点
  participant ATS as Area-Target-Scanner
  participant O as 3D-Model-Optimizer
  participant DB as 任务数据库

  User->>API: 创建 area-target-processing 任务
  API->>DB: 创建任务：created
  API-->>User: 返回签名上传 URL
  User->>COS: 上传 iOS LiDAR 扫描 ZIP
  API->>DB: 标记任务为 queued
  API->>Q: 发布任务消息
  W->>Q: 有容量时领取消息
  W->>DB: 标记任务为 processing
  W->>COS: 下载扫描 ZIP
  W->>ATS: 本机处理扫描数据
  ATS->>O: 需要时本机优化模型
  O-->>ATS: 优化后的模型
  ATS-->>W: Area Target 资产包
  W->>COS: 上传 results/{jobId}/asset-bundle.zip
  W->>DB: 标记任务为 completed
  W->>Q: ACK 消息
  User->>API: 查询任务状态和结果 URL
```

## 当前仓库可以部署什么

当前仓库已经包含第一版 MySQL + Redis/BullMQ 任务主链路。COS 签名和真实 3D-Model-Optimizer 调用仍是占位实现，但任务创建、上传完成入队、worker 领取、MySQL 状态更新和本地 smoke 验证已经可以跑通。

| 路径 | 当前作用 |
| --- | --- |
| `apps/api` | API 服务，提供 `GET /health`、`POST /v1/jobs`、`POST /v1/jobs/{jobId}/complete-upload`、`GET /v1/jobs/{jobId}` 和 `GET /v1/jobs/{jobId}/result-url`。 |
| `apps/worker` | BullMQ worker，消费 `model-processing-jobs` 队列，从 MySQL 读取 job、条件领取并运行 deterministic model optimization wrapper。 |
| `packages/shared` | 共享任务状态和 pipeline 常量。 |
| `infra/docker-compose.yml` | 本地开发示例，包含 API、worker、MySQL、Redis、MinIO 和 3D-Model-Optimizer。 |
| `docs/architecture.md` | 产品架构和复合工作节点模型。 |

Area-Target-Scanner 已在架构中预留，但还没有接入 `infra/docker-compose.yml`。

## 本地开发部署

在仓库根目录执行：

```bash
docker compose -f infra/docker-compose.yml up --build
```

本地服务表：

| 服务 | URL | 说明 |
| --- | --- | --- |
| API | `http://localhost:8080/health` | API 健康检查和任务接口。 |
| 3D-Model-Optimizer | `http://localhost:3000` | 本地开发用优化器 sidecar。 |
| Redis | `localhost:6379` | BullMQ 队列。 |
| MySQL | `localhost:3306` | 任务事实表和状态存储。 |
| MinIO API | `http://localhost:9000` | COS 兼容的本地对象存储。 |
| MinIO Console | `http://localhost:9001` | 本地对象存储管理界面。 |

如果本机已有服务占用默认端口，可以覆盖 host 端口，不影响容器内部连接：

```bash
API_HOST_PORT=8085 REDIS_HOST_PORT=6381 MYSQL_HOST_PORT=3310 \
docker compose -f infra/docker-compose.yml up --build
```

本地 smoke 验证：

```bash
API_HOST_PORT=8085 npm run smoke:mysql-redis
```

第一版 worker wrapper 会写入确定性的 `results/{jobId}/optimized.glb`，真实 COS 下载、优化器调用和结果上传由后续 pipeline 任务替换。

## 生产部署顺序

1. 创建 COS 存储桶，并确定对象 key 规范。
2. 部署 MySQL 任务数据库。
3. 部署 Redis + BullMQ 队列服务。
4. 将 Platform API 部署到公网或内网负载均衡后面。
5. 构建弹性工作服务器镜像或启动模板。
6. 每台工作服务器运行 worker agent、Area-Target-Scanner、3D-Model-Optimizer 和本地临时卷。
7. 根据队列和节点指标配置弹性扩缩容。
8. 保持 Area-Target-Scanner 和 3D-Model-Optimizer 只在工作节点私有网络内可访问。

## 建议的 COS 对象 Key

```text
uploads/{jobId}/source.{ext}
results/{jobId}/optimized.glb
results/{jobId}/asset-bundle.zip
logs/{jobId}/worker.log
```

API 应该把准确的 source key 和 result key 存到任务数据库里。Worker 不应该根据用户上传的原始文件名推断 key。

## 环境变量

Platform API：

```text
API_PORT=8080
API_HOST_PORT=8080
QUEUE_URL=...
DATABASE_URL=...
COS_BUCKET=...
COS_REGION=...
COS_SECRET_ID=...
COS_SECRET_KEY=...
```

Worker 节点：

```text
WORKER_CONCURRENCY=1
QUEUE_URL=...
REDIS_HOST_PORT=6379
DATABASE_URL=...
COS_BUCKET=...
COS_REGION=...
COS_SECRET_ID=...
COS_SECRET_KEY=...
OPTIMIZER_URL=http://optimizer:3000
OPTIMIZER_HOST_PORT=3000
AREA_TARGET_SCANNER_URL=http://area-target-scanner:8080
WORKER_TEMP_DIR=/work/temp
```

3D-Model-Optimizer：

```text
PORT=3000
NODE_ENV=production
```

Area-Target-Scanner：

```text
PORT=8080
OPTIMIZER_URL=http://optimizer:3000
WORK_DIR=/work/temp/area-target-scanner
```

## 弹性扩缩容规则

满足一个或多个条件时扩容：

- 排队任务总数超过活跃 worker 数量。
- 最老排队任务等待时间超过目标等待时间。
- `model-optimization` 或 `area-target-processing` 的单独 backlog 增长。
- 活跃节点出现 CPU、内存或磁盘压力。

只有满足这些条件时才缩容：

- 队列为空，或低于空闲阈值。
- 节点没有正在处理的任务。
- worker 已进入 draining 状态，并停止领取新消息。

不要终止正在处理任务的节点，除非已经确认队列租约超时和重试机制可以安全恢复任务。

## 网络与安全

- 只有 Platform API 应该被前端访问。
- Worker 节点上的处理服务应该运行在私有网络内。
- 3D-Model-Optimizer 和 Area-Target-Scanner 不应该暴露公网端口。
- COS 凭证应该以 secret 注入，不能写进镜像。
- Worker 应该为每个任务创建独立临时目录，并在任务结束后删除。
- 队列消息应包含 `jobId`、`pipelineType`、source key、output prefix、preset/options 和重试元数据。

## 失败处理

如果所有 worker 节点都在忙，任务保持 `queued`。

如果 worker 崩溃，队列租约过期后，其他 worker 可以重试该任务。

如果 pipeline 失败，worker 记录错误、重试次数和失败阶段。仍有重试预算的任务进入 `retrying`；重试耗尽的任务进入 `failed`。

如果 COS 上传成功但数据库更新失败，worker 应该先重试数据库更新，再 ACK 队列消息。结果 key 应保持确定性，这样重复重试仍然是幂等的。
