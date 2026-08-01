import type { Session } from '$lib/server/domain/session';
import type { User } from '$lib/server/domain/user';

export interface ISessionRepository {
	create(input: { id: string; userId: string; expiresAt: Date }): Promise<Session>;
	findWithUser(id: string): Promise<{ session: Session; user: User } | null>;
	updateExpiresAt(id: string, expiresAt: Date): Promise<void>;
	delete(id: string): Promise<void>;
}
