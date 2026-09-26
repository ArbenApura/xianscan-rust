declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			// SET BY accessHandle: HOW THIS REQUEST WAS ALLOWED IN
			access?: { via: 'public' | 'local' | 'token' | 'cookie' };
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
