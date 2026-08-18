import type { ZodSchema, ZodTypeDef } from 'zod';

export type FormValidationResult<T> =
	| { success: true; data: T; errors: null }
	| { success: false; data: null; errors: Record<string, string> };

/**
 * Validates form data against a Zod schema and returns clean field-level errors.
 */
export function validateForm<TOutput, TInput = unknown>(
	schema: ZodSchema<TOutput, ZodTypeDef, TInput>,
	data: TInput,
): FormValidationResult<TOutput> {
	const result = schema.safeParse(data);
	if (result.success) {
		return { success: true, data: result.data, errors: null };
	}

	const errors: Record<string, string> = {};
	for (const issue of result.error.issues) {
		const key = issue.path.join('.') || '_form';
		if (!errors[key]) {
			errors[key] = issue.message;
		}
	}

	return { success: false, data: null, errors };
}
