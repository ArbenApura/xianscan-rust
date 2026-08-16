// IMPORTED DEP-TYPES
import type { ClassValue } from 'clsx';
// IMPORTED DEP-MODULES
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// -- FUNCTIONS -- //

// COMPOSE TAILWIND CLASSES — THE ONLY ALLOWED WAY TO BUILD DYNAMIC CLASS STRINGS
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}
