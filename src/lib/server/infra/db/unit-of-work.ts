import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { Database } from '$lib/server/infra/db/types';
import { db } from '$lib/server/infra/db';

export function createUnitOfWork<TRepos>(
	buildRepos: (tx: Database) => TRepos
): IUnitOfWork<TRepos> {
	return {
		run<T>(fn: (repos: TRepos) => Promise<T>): Promise<T> {
			return db.transaction((tx) => fn(buildRepos(tx)));
		}
	};
}
