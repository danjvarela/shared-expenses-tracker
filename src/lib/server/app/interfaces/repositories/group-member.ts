export interface GroupMemberWithUser {
	userId: string;
	displayName: string;
	defaultSplitPercent: number | null;
}

export interface IGroupMemberRepository {
	getAllForGroupWithUser(groupId: string): Promise<Array<GroupMemberWithUser>>;

	updateDefaultSplitPercents(
		groupId: string,
		entries: Array<{ userId: string; defaultSplitPercent: number | null }>
	): Promise<void>;
}
