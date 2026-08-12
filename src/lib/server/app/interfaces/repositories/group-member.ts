export interface GroupMemberWithUser {
	userId: string;
	displayName: string;
	defaultSplitPercent: number | null;
}

export interface IGroupMemberRepository {
	getAllForGroupWithUser(groupId: string): Promise<Array<GroupMemberWithUser>>;

	create(groupId: string, userId: string): Promise<void>;

	updateDefaultSplitPercents(
		groupId: string,
		entries: Array<{ userId: string; defaultSplitPercent: number | null }>
	): Promise<void>;

	isMember(groupId: string, userId: string): Promise<boolean>;

	countByGroup(groupId: string): Promise<number>;

	remove(groupId: string, userId: string): Promise<void>;
}
