import {
	Users,
	Home,
	Plane,
	UtensilsCrossed,
	Car,
	ShoppingBag,
	PartyPopper,
	Heart,
	Briefcase,
	Gift
} from '@lucide/svelte';

export const ICON_NAMES = [
	'Users',
	'Home',
	'Plane',
	'UtensilsCrossed',
	'Car',
	'ShoppingBag',
	'PartyPopper',
	'Heart',
	'Briefcase',
	'Gift'
] as const;

export const GROUP_ICONS: Record<(typeof ICON_NAMES)[number], typeof Users> = {
	Users,
	Home,
	Plane,
	UtensilsCrossed,
	Car,
	ShoppingBag,
	PartyPopper,
	Heart,
	Briefcase,
	Gift
};
