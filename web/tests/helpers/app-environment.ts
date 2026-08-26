import { readable } from 'svelte/store';

export const browser = true;
export const dev = true;
export const building = false;
export const version = 'test';
export const goto = async () => {};
export const invalidate = async () => {};
export const invalidateAll = async () => {};

export const page = readable({
	url: new URL('http://localhost/app'),
	params: { id: 'test-book-id', chapterId: '1' },
	route: { id: '/app' },
	status: 200,
	error: null,
	data: {},
	form: null,
});
export const navigating = readable(null);
export const updated = readable(false);

if (typeof window !== 'undefined') {
	window.scrollTo = () => {};
}
