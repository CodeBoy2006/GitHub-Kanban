import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { AppConfig, DataStore } from "../types.ts";

function json(data: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json; charset=utf-8" },
        ...init,
    });
}

export function makeHandler(cfg: AppConfig, store: DataStore) {
    return (req: Request) => {
        const url = new URL(req.url);
        const pathname = url.pathname;

        if (pathname === "/healthz") return new Response("ok");

        if (pathname === "/api/summary") {
            return json({ repos: Array.from(store.repoInfos.values()) });
        }

        if (pathname === "/api/feed") {
            const items = store.feedItems.map((it) => {
                if (it.type === "Commit" && it.sha) {
                    const cached = store.commitStats.get(`${it.repo}@${it.sha}`);
                    const review = store.commitReviews.get(`${it.repo}@${it.sha}`);
                    return {
                        ...(cached ? { ...it, stats: cached } : it),
                        ...(review ? { review } : {}),
                    };
                }
                return it;
            });
            return json({ items });
        }

        if (pathname === "/api/quality") {
            const repoQuery = url.searchParams.get("repo");
            if (repoQuery) {
                const rep = store.qualityReports.get(repoQuery);
                if (!rep) return json({ error: "not_found" }, { status: 404 });
                return json(rep);
            }
            const list = Array.from(store.qualityReports.values())
                .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
                .map(({ markdown, ...rest }) => rest);
            return json({ items: list });
        }

        // 静态资源
        return serveDir(req, { fsRoot: "public", urlRoot: "" });
    };
}