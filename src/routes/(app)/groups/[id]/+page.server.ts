import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const { group } = await parent();
	return { group };
};
