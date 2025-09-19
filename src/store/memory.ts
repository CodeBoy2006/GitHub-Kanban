import { CommitStats, DataStore, FeedItem, QualityReport, RepoInfo, CommitReview } from "../types.ts";

export class MemoryStore implements DataStore {
    repoInfos = new Map<string, RepoInfo>();
    repoEvents = new Map<string, any[]>();
    feedItems: FeedItem[] = [];
    commitStats = new Map<string, CommitStats>();
    qualityReports = new Map<string, QualityReport>();
    commitReviews = new Map<string, CommitReview>(); // 新增
}