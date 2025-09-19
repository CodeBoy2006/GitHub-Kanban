// src/services/ai_review.ts
import { AppConfig, CommitReview, DataStore } from "../types.ts";
import { GitHubClient } from "../github/client.ts";

function nowISO() {
    return new Date().toISOString();
}

function safeJsonPick(s: string) {
    // 尝试从大段文本中抠出 JSON
    const m = s.match(/\{[\s\S]*\}$/m) || s.match(/\{[\s\S]*\}/m);
    const raw = m ? m[0] : s;
    try { return JSON.parse(raw); } catch { return null; }
}

function toScore3(grade: string | number): 1 | 2 | 3 {
    if (typeof grade === "number") {
        if (grade >= 3) return 3;
        if (grade >= 2) return 2;
        return 1;
    }
    const g = String(grade).toLowerCase();
    if (g.includes("good") || g.includes("pass") || g.includes("a") || g.includes("green") || g.includes("🟢")) return 3;
    if (g.includes("mix") || g.includes("b") || g.includes("yellow") || g.includes("🟡")) return 2;
    return 1;
}

export class AIReviewer {
    constructor(
        private cfg: AppConfig,
        private store: DataStore,
        private gh: GitHubClient,
    ) { }

    private get enabled() {
        return !!this.cfg.aiReviewEnabled
            && !!this.cfg.aiReviewApiUrl
            && !!this.cfg.aiReviewApiKey
            && !!this.cfg.aiReviewModel;
    }

    private withinHeuristics(key: string) {
        const stats = this.store.commitStats.get(key);
        if (!stats) return false;
        if (stats.filesChanged > this.cfg.aiReviewMaxFiles) return false;
        if ((stats.additions + stats.deletions) > this.cfg.aiReviewMaxChanges) return false;
        return true;
    }

    async reviewCommit(repoId: string, sha: string, messageHint?: string) {
        if (!this.enabled) return null;

        const key = `${repoId}@${sha}`;
        if (!this.withinHeuristics(key)) return null;
        if (this.store.commitReviews.has(key)) return this.store.commitReviews.get(key)!;

        // 拉 diff（有 ETag）
        const diff = await this.gh.getCommitDiff(repoId, sha);
        if (!diff) return null;

        const header = `Commit: ${repoId}@${sha}\nMessage: ${messageHint ?? ""}\n\n`;
        const payload = (header + diff).slice(0, this.cfg.aiReviewDiffMaxChars);

        const body = {
            model: this.cfg.aiReviewModel,
            temperature: 0.2,
            messages: [
                {
                    role: "system",
                    content:
                        `你是一名严格的代码评审机器人。请基于用户提供的 commit message + 统一 diff 对变更进行审查，指出风险点、可读性/复杂度问题、可测试性问题、安全与性能隐患，并给出简明改善建议。输出必须是 JSON：{
  "grade": "good|mixed|bad",
  "score": 1|2|3, // 三档制，3=良好，2=一般，1=存疑
  "summary": "一句话整体评价",
  "risks": ["..."],
  "suggestions": ["..."]
}
请务必输出严格的 JSON，不要添加多余解释。`
                },
                { role: "user", content: payload }
            ]
        };

        const ctrl = AbortSignal.timeout(this.cfg.aiReviewTimeoutMs);
        const res = await fetch(`${this.cfg.aiReviewApiUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.cfg.aiReviewApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: ctrl,
        });

        if (!res.ok) {
            const err = await res.text().catch(() => "");
            console.warn(`[AIReview] HTTP ${res.status} ${res.statusText} :: ${err}`);
            return null;
        }

        const j = await res.json().catch(() => null);
        const content: string = j?.choices?.[0]?.message?.content ?? "";
        const parsed = safeJsonPick(content);
        if (!parsed) return null;

        const review: CommitReview = {
            repo: repoId,
            sha,
            createdAt: nowISO(),
            model: this.cfg.aiReviewModel!,
            grade: (parsed.grade ?? "mixed").toLowerCase(),
            score: toScore3(parsed.score ?? parsed.grade),
            summary: String(parsed.summary ?? "").slice(0, 280),
            risks: Array.isArray(parsed.risks) ? parsed.risks.slice(0, 8) : [],
            suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 8) : [],
        };

        this.store.commitReviews.set(key, review);
        return review;
    }
}