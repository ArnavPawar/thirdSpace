import type { Profile } from '@/types/space';

export function formatTimeAgo(dateString: string) {
  const diffInMinutes = Math.floor((Date.now() - new Date(dateString).getTime()) / (1000 * 60));

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`;
  if (diffInDays < 365) return `${Math.floor(diffInDays / 30)}mo ago`;
  return `${Math.floor(diffInDays / 365)}y ago`;
}

export function formatDistance(distanceMiles?: number) {
  if (distanceMiles === undefined || !Number.isFinite(distanceMiles)) return null;
  if (distanceMiles < 0.1) return `${Math.round(distanceMiles * 5280)} ft`;
  return `${distanceMiles.toFixed(1)} mi`;
}

export function getDisplayName(profile?: Pick<Profile, 'full_name' | 'username'>) {
  return profile?.full_name || profile?.username || 'Community member';
}

export function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}
