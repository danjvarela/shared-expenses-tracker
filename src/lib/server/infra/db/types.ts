import type { db } from '$lib/server/infra/db';

export type Database = typeof db | Parameters<Parameters<(typeof db)['transaction']>[0]>[0];
