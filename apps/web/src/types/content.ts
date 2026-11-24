export type ChannelId = 'instagram' | 'youtube' | 'tiktok' | 'threads';

export type ConnectionStatus = 'connected' | 'public-only' | 'disconnected';

/**
 * 게시물 성과 판정.
 * - pending: 게시 후 3일이 지나지 않아 판정을 미룸
 * - insufficient: 비교할 같은 유형 게시물이 5개 미만
 */
export type Verdict = 'excellent' | 'average' | 'watch' | 'needs-work' | 'pending' | 'insufficient';

export interface Brand {
  id: string;
  name: string;
}

export interface ChannelSummary {
  channel: ChannelId;
  handle: string;
  status: ConnectionStatus;
  followers: number | null;
  posts: number;
  views: number | null;
  engagements: number | null;
  needsWork: number;
  syncedAt: string | null;
}

export interface TrackedContent {
  id: string;
  title: string;
  brandId: Brand['id'];
  channel: ChannelId;
  format: 'reels' | 'carousel' | 'feed' | 'shorts' | 'text';
  publishedAt: string;
  views: number | null;
  engagements: number | null;
  verdict: Verdict;
  syncedAt: string;
}

export interface DashboardOverview {
  trackedCount: number;
  publishedToday: number;
  needsWorkCount: number;
  pendingCount: number;
  channels: ChannelSummary[];
}
