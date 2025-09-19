import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { AppConfig, ConfigRepo } from "../types.ts";

async function fileExists(p: string) {
    try {
        const st = await Deno.stat(p);
        return st.isFile || st.isDirectory;
    } catch {
        return false;
    }
}

function envNum(key: string): number | undefined {
    const raw = Deno.env.get(key);
    if (raw == null) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
}

function envBool(key: string, def = false): boolean | undefined {
    const raw = Deno.env.get(key);
    if (raw == null) return undefined;
    return (raw ?? String(def)).toLowerCase() === "true";
}

function parseRepos(input?: string): ConfigRepo[] | undefined {
    if (!input) return undefined;
    return input.split(",").map((s) => {
        const parts = s.trim().split(":");
        const id = parts[0];
        const name = parts.slice(1).join(":") || id;
        return { id, name };
    });
}

export async function loadConfig(): Promise<AppConfig> {
    const configPath = Deno.env.get("CONFIG_PATH") ?? "./config.json";
    let fileCfg: Record<string, unknown> = {};
    if (await fileExists(configPath)) {
        try {
            fileCfg = JSON.parse(await Deno.readTextFile(configPath));
        } catch (e) {
            console.error(`[Config] Failed to parse ${configPath}:`, e);
        }
    }

    const envRepos = parseRepos(Deno.env.get("REPOS"));

    const cfg: AppConfig = {
        repos: (envRepos ?? (fileCfg.repos as ConfigRepo[] | undefined) ?? [])
            .filter((r) => r && r.id),
        githubToken:
            Deno.env.get("GITHUB_TOKEN") ??
            (fileCfg.githubToken as string | undefined) ??
            undefined,

        globalRefreshSeconds:
            envNum("REFRESH_SECONDS") ??
            (fileCfg.refreshSeconds as number | undefined) ??
            60,

        repoUpdateIntervalSeconds:
            envNum("REPO_UPDATE_INTERVAL_SECONDS") ??
            (fileCfg.repoUpdateIntervalSeconds as number | undefined) ??
            10,

        feedLimit:
            envNum("FEED_LIMIT") ??
            (fileCfg.feedLimit as number | undefined) ??
            120,

        port:
            envNum("PORT") ??
            (fileCfg.port as number | undefined) ??
            8000,

        // Code Audit
        codeAuditEnabled: envBool("CODE_AUDIT_ENABLED") ?? false,
        codeAuditIntervalHours:
            envNum("CODE_AUDIT_INTERVAL_HOURS") ?? 4,
        codeAuditTmpDir:
            Deno.env.get("CODE_AUDIT_TMP") ??
            (fileCfg.codeAuditTmpDir as string | undefined) ??
            path.join(".audit", "repos"),
        codeAuditLang:
            Deno.env.get("CODE_AUDIT_LANG") ??
            (fileCfg.codeAuditLang as string | undefined) ??
            "zh-CN",
        codeAuditArgs:
            Deno.env.get("CODE_AUDIT_ARGS") ??
            (fileCfg.codeAuditArgs as string | undefined) ??
            "--verbose --top 10 --issues 5",
        codeAuditMaxReports:
            envNum("CODE_AUDIT_MAX_REPORTS") ??
            (fileCfg.codeAuditMaxReports as number | undefined) ??
            200,

        codeAuditCli:
            Deno.env.get("CODE_AUDIT_CLI") ??
            (fileCfg.codeAuditCli as string | undefined) ??
            "fuck-u-code", // 与原实现保持一致

        // ---- AI Review ----
        aiReviewEnabled: (Deno.env.get("AI_REVIEW_ENABLED") ?? (fileCfg.aiReviewEnabled as string | undefined) ?? "false").toString().toLowerCase() === "true",
        aiReviewApiUrl: Deno.env.get("AI_REVIEW_API_URL") ?? (fileCfg.aiReviewApiUrl as string | undefined),
        aiReviewApiKey: Deno.env.get("AI_REVIEW_API_KEY") ?? (fileCfg.aiReviewApiKey as string | undefined),
        aiReviewModel: Deno.env.get("AI_REVIEW_MODEL") ?? (fileCfg.aiReviewModel as string | undefined) ?? "gpt-4o-mini",
        aiReviewMaxFiles: Number(Deno.env.get("AI_REVIEW_MAX_FILES") ?? (fileCfg.aiReviewMaxFiles as number | undefined) ?? 20),
        aiReviewMaxChanges: Number(Deno.env.get("AI_REVIEW_MAX_CHANGES") ?? (fileCfg.aiReviewMaxChanges as number | undefined) ?? 800),
        aiReviewDiffMaxChars: Number(Deno.env.get("AI_REVIEW_DIFF_MAX_CHARS") ?? (fileCfg.aiReviewDiffMaxChars as number | undefined) ?? 12000),
        aiReviewTimeoutMs: Number(Deno.env.get("AI_REVIEW_TIMEOUT_MS") ?? (fileCfg.aiReviewTimeoutMs as number | undefined) ?? 20000),
    };

    if (!cfg.repos.length) {
        console.warn("[Config] No repos configured. Using demo repos.");
        cfg.repos = [
            { id: "vercel/next.js", name: "🚀 Next.js" },
            { id: "apache/superset", name: "📊 Superset" },
        ];
    }

    return cfg;
}