export function unreadBadge(count: number): string {
	return count > 9 ? '9+' : String(count);
}
