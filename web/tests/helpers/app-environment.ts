export const browser = true;
export const dev = true;
export const building = false;
export const version = 'test';
export const goto = async () => {};
export const invalidate = async () => {};
export const invalidateAll = async () => {};

if (typeof window !== 'undefined') {
	window.scrollTo = () => {};
}
