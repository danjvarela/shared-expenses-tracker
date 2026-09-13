import { resolve } from '$app/paths';

export function getInitials(displayName: string): string {
	const parts = displayName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
	return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function avatarUrlFor(userId: string): string {
	return resolve('/(app)/avatars/[userId]', { userId });
}
