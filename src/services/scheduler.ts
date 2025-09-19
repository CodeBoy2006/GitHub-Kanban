import { AppConfig, ConfigRepo, DataStore } from "../types.ts";
import { GitHubClient } from "../github/client.ts";
import { rebuildGlobalFeed } from "./feed.ts";
import { AIReviewer } from "./ai_review.ts"; // 新增

export class UpdateScheduler {
    private queue: ConfigRepo[] = [];
    private timer: number | null = null;

    constructor(
        private cfg: AppConfig,
        private store: DataStore,
        private gh: GitHubClient,
        private reviewer?: AIReviewer, // 新增
    ) { }

    async initialLoad() {
        console.log(`[Scheduler] 🚀 Initial load for ${this.cfg.repos.length} repos...`);
        const t0 = Date.now();
        await Promise.allSettled(this.cfg.repos.map((r) => this.updateRepo(r)));
        rebuildGlobalFeed(this.cfg, this.store);
        console.log(
            `[Scheduler] ✅ Initial load in ${Date.now() - t0}ms. Rate limit: ${this.gh.rateLimit.remaining}/${this.gh.rateLimit.limit}`,
        );
        this.start();
    }

    start() {
        if (this.timer) clearInterval(this.timer);
        this.buildQueue();
        const interval = this.cfg.repoUpdateIntervalSeconds * 1000;
        console.log(`[Scheduler] 🕒 Periodic updates every ${this.cfg.repoUpdateIntervalSeconds}s per repo.`);
        this.timer = setInterval(() => this.tick(), interval);
    }

    private buildQueue() {
        const sorted = [...this.cfg.repos].sort((a, b) => {
            const ia = this.store.repoInfos.get(a.id);
            const ib = this.store.repoInfos.get(b.id);
            if (!ia || !ib) return 0;
            return new Date(ib.pushed_at).getTime() - new Date(ia.pushed_at).getTime();
        });
        this.queue = sorted;
        console.log(
            `[Scheduler] 🔄 Queue rebuilt. Top: ${this.queue.map((r) => r.name).slice(0, 3).join(", ")}...`,
        );
    }

    private async tick() {
        if (this.queue.length === 0) this.buildQueue();
        const repo = this.queue.shift();
        if (repo) {
            await this.updateRepo(repo);
            rebuildGlobalFeed(this.cfg, this.store);
        }
    }

    private async updateRepo(repo: ConfigRepo) {
        const t0 = Date.now();
        console.log(`[Update] ⏳ Updating ${repo.name} (${repo.id})...`);
        try {
            const [infoRes, eventsRes] = await Promise.allSettled([
                this.gh.getRepoInfo(repo.id),
                this.gh.getRepoEvents(repo.id),
            ]);

            if (infoRes.status === "fulfilled" && infoRes.value) {
                const info = infoRes.value;
                this.store.repoInfos.set(repo.id, { ...info, displayName: repo.name });
            } else if (infoRes.status === "rejected") {
                console.error(`[Update] ❌ Info failed for ${repo.name}:`, infoRes.reason);
            }

            if (eventsRes.status === "fulfilled") {
                const events = eventsRes.value;
                if (events.length > 0 || !this.store.repoEvents.has(repo.id)) {
                    this.store.repoEvents.set(repo.id, events);
                }

                // 预取最近 commit 的统计 & 提取 message
                const commits: string[] = [];
                const msgMap = new Map<string, string>();
                for (const ev of events) {
                    if (ev.type === "PushEvent" && ev.payload?.commits) {
                        for (const c of ev.payload.commits) {
                            commits.push(c.sha);
                            if (c.sha && c.message) msgMap.set(c.sha, c.message);
                        }
                    }
                }
                const toFetch = commits
                    .filter((sha) => !this.store.commitStats.has(`${repo.id}@${sha}`))
                    .slice(0, 5);

                const stats = await Promise.allSettled(
                    toFetch.map((sha) => this.gh.getCommitStats(repo.id, sha)),
                );
                stats.forEach((s, i) => {
                    if (s.status === "fulfilled" && s.value) {
                        const v = s.value;
                        this.store.commitStats.set(`${repo.id}@${v.sha}`, v);
                    } else if (s.status === "rejected") {
                        console.warn(`[Update] ⚠️ Commit stat failed (${repo.id}@${toFetch[i]}):`, s.reason);
                    }
                });

                // 触发 AI 评审（仅小提交）
                if (this.reviewer) {
                    const reviewable = toFetch.slice(0, 2); // 每轮最多评审 2 个，避免成本陡增
                    await Promise.allSettled(reviewable.map((sha) =>
                        this.reviewer!.reviewCommit(repo.id, sha, msgMap.get(sha) ?? undefined)
                    ));
                }
            } else if (eventsRes.status === "rejected") {
                console.error(`[Update] ❌ Events failed for ${repo.name}:`, eventsRes.reason);
            }

            const resetTime = new Date(this.gh.rateLimit.reset * 1000).toLocaleTimeString();
            console.log(
                `[Update] ✅ Finished ${repo.name} in ${Date.now() - t0}ms. RL: ${this.gh.rateLimit.remaining}/${this.gh.rateLimit.limit} (reset ${resetTime})`,
            );
        } catch (e) {
            console.error(`[Update] 💥 Unhandled for ${repo.name}:`, e);
        }
    }
}