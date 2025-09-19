import { AppConfig, CommitStats, DataStore, FeedItem } from "../types.ts";

const ICONS: Record<string, string> = {
    PushEvent: "⬆️",
    PullRequestEvent: "🔀",
    IssuesEvent: "❗",
    IssueCommentEvent: "💬",
    CreateEvent: "🌱",
    DeleteEvent: "🗑️",
    ReleaseEvent: "🏷️",
    ForkEvent: "🍴",
    WatchEvent: "⭐",
    CommitCommentEvent: "📝",
    MemberEvent: "👥",
    public: "📣",
    default: "📌",
    Commit: "📝",
};

export function eventToFeedItems(ev: any): FeedItem[] {
    const type = ev.type ?? "default";
    const repo = ev.__repo as string;
    const actor = ev.actor?.display_login ?? ev.actor?.login;
    const urlBase = `https://github.com/${repo}`;
    try {
        const p = ev.payload ?? {};
        if (type === "PushEvent" && p.commits) {
            const branch = (p.ref ?? "").replace("refs/heads/", "");
            return p.commits.map((commit: any) => ({
                type: "Commit",
                icon: "📝",
                when: ev.created_at,
                repo,
                actor,
                title: `Commit to ${branch}: ${commit.message.split("\n")[0]}`,
                url: `${urlBase}/commit/${commit.sha}`,
                sha: commit.sha,
                extra: `by ${commit.author?.name ?? actor ?? ""}`,
            }));
        }
        let title = "", url = urlBase, extra = "";
        if (type === "PullRequestEvent") {
            const pr = p.pull_request ?? {};
            title = `PR ${p.action} #${pr.number}: ${pr.title ?? ""}`;
            url = pr.html_url ?? url;
            if (p.action === "closed" && pr.merged) extra = "已合并";
        } else if (type === "IssuesEvent") {
            const is = p.issue ?? {};
            title = `Issue ${p.action} #${is.number}: ${is.title ?? ""}`;
            url = is.html_url ?? url;
        } else if (type === "IssueCommentEvent") {
            const is = p.issue ?? {};
            title = `Issue 评论 #${is.number}: ${is.title ?? ""}`;
            url = p.comment?.html_url ?? is.html_url ?? url;
        } else if (type === "ReleaseEvent") {
            const rel = p.release ?? {};
            title = `发布 ${p.action}: ${rel.tag_name ?? ""}`;
            url = rel.html_url ?? url;
        } else if (type === "CreateEvent") {
            title = `创建 ${p.ref_type}: ${p.ref}`;
        } else if (type === "DeleteEvent") {
            title = `删除 ${p.ref_type}: ${p.ref}`;
        } else if (type === "ForkEvent") {
            title = "Fork 了仓库";
            url = p.forkee?.html_url ?? url;
        } else if (type === "WatchEvent") {
            title = "Star 了仓库";
        } else {
            title = type;
        }
        return [{
            type,
            icon: ICONS[type] ?? ICONS.default,
            when: ev.created_at,
            repo,
            actor,
            title,
            url,
            extra,
        }];
    } catch (e) {
        console.error(`Error parsing event type ${type} for repo ${repo}:`, e);
        return [];
    }
}

function byDescTime(a: FeedItem, b: FeedItem) {
    return new Date(b.when).getTime() - new Date(a.when).getTime();
}

export function rebuildGlobalFeed(cfg: AppConfig, store: DataStore) {
    const allEvents = Array.from(store.repoEvents.values()).flat();
    const nameMap = new Map<string, string>();
    for (const r of cfg.repos) nameMap.set(r.id, r.name);

    const withStats = (item: FeedItem): FeedItem => {
        if (item.type === "Commit" && item.sha) {
            const key = `${item.repo}@${item.sha}`;
            const cached = store.commitStats.get(key) as CommitStats | undefined;
            const review = store.commitReviews.get(key);
            return { ...(cached ? { ...item, stats: cached } : item), ...(review ? { review } : {}) };
        }
        return item;
    };

    store.feedItems = allEvents
        .flatMap(eventToFeedItems)
        .map((it) => ({ ...withStats(it), displayName: nameMap.get(it.repo) || it.repo }))
        .sort(byDescTime)
        .slice(0, cfg.feedLimit);
}