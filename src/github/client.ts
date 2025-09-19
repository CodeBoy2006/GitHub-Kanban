import { ETagCache, RateLimitInfo, CommitStats } from "../types.ts";

function ghHeaders(token?: string, extra?: HeadersInit): Headers {
    const h = new Headers({
        Accept: "application/vnd.github+json",
        "User-Agent": "deno-github-dashboard",
    });
    if (token) h.set("Authorization", `Bearer ${token}`);
    if (extra) for (const [k, v] of Object.entries(extra)) h.set(k, v as string);
    return h;
}

export class GitHubClient {
    private etags: ETagCache = {
        info: new Map(),
        events: new Map(),
        commits: new Map(),
        diffs: new Map(), // 新增
    };
    private rate: RateLimitInfo = { limit: 5000, remaining: 5000, reset: 0 };

    constructor(private token?: string) { }

    get rateLimit(): RateLimitInfo {
        return this.rate;
    }

    private updateRateLimit(res: Response) {
        this.rate = {
            limit: parseInt(res.headers.get("x-ratelimit-limit") || "0", 10),
            remaining: parseInt(res.headers.get("x-ratelimit-remaining") || "0", 10),
            reset: parseInt(res.headers.get("x-ratelimit-reset") || "0", 10),
        };
    }

    private async fetchJsonWithEtag<T>(
        url: string,
        etagKey?: { map: Map<string, string>; key: string },
    ): Promise<{ status: 200; data: T } | { status: 304 }> {
        const hdrs: HeadersInit = {};
        if (etagKey) {
            const tag = etagKey.map.get(etagKey.key);
            if (tag) (hdrs as Record<string, string>)["If-None-Match"] = tag;
        }
        const res = await fetch(url, { headers: ghHeaders(this.token, hdrs) });
        this.updateRateLimit(res);
        if (res.status === 304) return { status: 304 as const };
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`${res.status} ${res.statusText} for ${url} :: ${text}`);
        }
        const data = (await res.json()) as T;
        const etag = res.headers.get("etag") ?? undefined;
        if (etag && etagKey) etagKey.map.set(etagKey.key, etag);
        return { status: 200 as const, data };
    }

    private async fetchTextWithEtag(
        url: string,
        etagKey?: { map: Map<string, string>; key: string },
        accept?: string,
    ): Promise<{ status: 200; data: string } | { status: 304 }> {
        const hdrs: HeadersInit = {};
        if (accept) (hdrs as Record<string, string>)["Accept"] = accept;
        if (etagKey) {
            const tag = etagKey.map.get(etagKey.key);
            if (tag) (hdrs as Record<string, string>)["If-None-Match"] = tag;
        }
        const res = await fetch(url, { headers: ghHeaders(this.token, hdrs) });
        this.updateRateLimit(res);
        if (res.status === 304) return { status: 304 as const };
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`${res.status} ${res.statusText} for ${url} :: ${text}`);
        }
        const data = await res.text();
        const etag = res.headers.get("etag") ?? undefined;
        if (etag && etagKey) etagKey.map.set(etagKey.key, etag);
        return { status: 200 as const, data };
    }

    async getCommitDiff(repoId: string, sha: string): Promise<string | null> {
        const key = `${repoId}@${sha}`;
        const url = `https://api.github.com/repos/${repoId}/commits/${sha}`;
        const out = await this.fetchTextWithEtag(
            url,
            { map: this.etags.diffs!, key },
            "application/vnd.github.v3.diff",
        );
        if (out.status === 304) return null; // 已缓存，无需再次评审
        return out.data;
    }

    async getRepoInfo(repoId: string) {
        type R = {
            html_url: string;
            description: string | null;
            stargazers_count: number;
            forks_count: number;
            open_issues_count: number;
            updated_at: string;
            default_branch: string;
        };
        const url = `https://api.github.com/repos/${repoId}`;
        const out = await this.fetchJsonWithEtag<R>(url, {
            map: this.etags.info,
            key: repoId,
        });
        if (out.status === 304) return null;
        const info = out.data;
        return {
            repo: repoId,
            html_url: info.html_url,
            description: info.description,
            stargazers_count: info.stargazers_count,
            forks_count: info.forks_count,
            open_issues_count: info.open_issues_count,
            pushed_at: info.updated_at,
            default_branch: info.default_branch,
        };
    }

    async getRepoEvents(repoId: string) {
        const url = `https://api.github.com/networks/${repoId}/events?per_page=30`;
        const out = await this.fetchJsonWithEtag<any[]>(url, {
            map: this.etags.events,
            key: repoId,
        });
        if (out.status === 304) return [];
        return out.data.map((ev) => ({ ...ev, __repo: repoId }));
    }

    async getCommitStats(repoId: string, sha: string): Promise<CommitStats | null> {
        const key = `${repoId}@${sha}`;
        const url = `https://api.github.com/repos/${repoId}/commits/${sha}`;
        const out = await this.fetchJsonWithEtag<any>(url, {
            map: this.etags.commits,
            key,
        });
        if (out.status === 304) return null;
        const data = out.data;
        const additions = data?.stats?.additions ?? 0;
        const deletions = data?.stats?.deletions ?? 0;
        const filesChanged = Array.isArray(data?.files)
            ? data.files.length
            : (data?.stats?.total ?? 0);
        return { sha, additions, deletions, filesChanged };
    }
}