# GitHub 多仓实时看板

一个轻量级、自托管的仪表盘，用于实时监控多个 GitHub 仓库的动态（Commits, PRs, Issues 等），并将它们聚合到一个统一的视图中。

---

## ✨ 功能特性

- **多仓聚合**：在一个统一的仪表盘中跟踪多个 GitHub 仓库。
- **实时动态流**：近实时展示 Commits、Pull Requests、Issues、Releases 等事件，并将 Push 事件中的多个 Commit 展开。
- **自定义显示名称**：为仓库设置易于辨识的别名。
- **智能 API 策略**：采用交错更新和 ETag 缓存，有效避免 API 速率限制，并提供详细的调试日志。
- **Docker 就绪**：使用 Docker Compose 实现一键启动和部署。
- **零配置前端**：所有配置均通过后端的 `.env` 文件管理，前端开箱即用。
- **智能排序**：仓库概览和后端更新队列均按最近活动 (`updated_at`) 自动排序。
- **亮/暗模式**：自动适配你的系统主题。
- **AI 监工**：自动对小型提交进行代码评审，提供三档评分（良好/一般/存疑）和改进建议。

## 🚀 快速开始 (Docker)

### 部署步骤
1.  **克隆仓库**
    ```bash
    git clone https://github.com/CodeBoy2006/Github-Kanban
    cd Github-Kanban
    ```

2.  **创建配置文件**
    从模板复制 `.env` 文件。
    ```bash
    cp .env.example .env
    ```

3.  **编辑配置**
    打开 `.env` 文件并填入你的配置，特别是 `REPOS` 和 `GITHUB_TOKEN`。
    ```env
    # .env

    # 仓库列表，格式为: owner/repo:显示名称,owner2/repo2:显示名称2
    REPOS=vercel/next.js:🚀 Next.js,apache/superset:📊 Superset

    # 你的 GitHub Personal Access Token
    # 用于访问私有仓库或提高 API 速率限制
    GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

    # 其他配置...
    HOST_PORT=8080
    ```

4.  **启动服务**
    使用 Docker Compose 在后台构建并启动服务。
    ```bash
    docker-compose up -d --build
    ```

5.  **访问看板**
    打开浏览器，访问 `http://localhost:8080` (或你在 `.env` 中设置的 `HOST_PORT`)。

## ⚙️ 配置

所有配置均通过项目根目录下的 `.env` 文件完成。

| 变量                           | 说明                                                                  | 示例                                                |
| ------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------- |
| `REPOS`                        | **必填**。要监控的仓库列表，用逗号分隔。格式：`id:显示名称`。            | `denoland/deno:🦕 Deno,torvalds/linux:🐧 Linux`         |
| `GITHUB_TOKEN`                 | **强烈推荐**。你的 GitHub PAT。公开仓库可不填，私有仓库必须。             | `ghp_...`                                           |
| `REFRESH_SECONDS`              | 整个更新队列重新排序的全局周期（秒）。                                  | `300`                                               |
| `REPO_UPDATE_INTERVAL_SECONDS` | 更新队列中单个仓库的间隔时间（秒）。                                    | `10`                                                |
| `HOST_PORT`                    | 映射到主机的端口号。                                                  | `8080`                                              |
| `CONTAINER_PORT`               | 容器内部应用监听的端口，应与 `PORT` 环境变量保持一致。                  | `8000`                                              |
| `TZ`                           | （可选）设置容器的显示时区。                                            | `Asia/Shanghai`                                     |

### AI 监工配置

| 变量 | 说明 | 示例 |
|---|---|---|
| `AI_REVIEW_ENABLED` | 开启 AI 监工 | `true` |
| `AI_REVIEW_API_URL` | OpenAI 兼容服务根地址 | `https://api.openai.com` |
| `AI_REVIEW_API_KEY` | 访问密钥 | `sk-...` |
| `AI_REVIEW_MODEL` | 模型名 | `gpt-4o-mini` |
| `AI_REVIEW_MAX_FILES` | 触发评审的最大文件数 | `20` |
| `AI_REVIEW_MAX_CHANGES` | 触发评审的最大变更行（加删总数） | `800` |
| `AI_REVIEW_DIFF_MAX_CHARS` | 发送给模型的 diff 最大字符数 | `12000` |
| `AI_REVIEW_TIMEOUT_MS` | 请求超时 | `20000` |
