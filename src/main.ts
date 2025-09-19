import { loadConfig } from "./config/load.ts";
import { MemoryStore } from "./store/memory.ts";
import { GitHubClient } from "./github/client.ts";
import { UpdateScheduler } from "./services/scheduler.ts";
import { CodeAuditScheduler } from "./services/code_audit.ts";
import { rebuildGlobalFeed } from "./services/feed.ts";
import { makeHandler } from "./web/routes.ts";
import { AIReviewer } from "./services/ai_review.ts"; // 新增

async function main() {
    const cfg = await loadConfig();
    const store = new MemoryStore();
    const gh = new GitHubClient(cfg.githubToken);

    const reviewer = new AIReviewer(cfg, store, gh); // 新增

    const scheduler = new UpdateScheduler(cfg, store, gh, reviewer); // 传入 reviewer
    await scheduler.initialLoad();

    // 周期性重建队列（根据活跃度动态排序）
    setInterval(() => scheduler.start(), cfg.globalRefreshSeconds * 1000);

    // 启动代码质量巡检
    new CodeAuditScheduler(cfg, store).start();

    // 暴露 HTTP 服务
    Deno.serve({ port: cfg.port }, makeHandler(cfg, store));

    // 启动日志
    rebuildGlobalFeed(cfg, store);
    console.log(`\n🚀 GitHub Dashboard running at http://localhost:${cfg.port}`);
    console.log(`   Watching ${cfg.repos.length} repos: ${cfg.repos.map((r) => r.name).join(", ")}`);
    console.log(`   Per-repo update interval: ${cfg.repoUpdateIntervalSeconds}s`);
    console.log(`   Queue re-sort interval: ${cfg.globalRefreshSeconds}s`);
}

await main();