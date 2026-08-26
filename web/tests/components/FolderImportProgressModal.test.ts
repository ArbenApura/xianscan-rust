/**
 * @vitest-environment jsdom
 */
// IMPORTED DEP-MODULES
import { render, fireEvent, screen, cleanup } from '@testing-library/svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';

// IMPORTED COMPONENTS
import FolderImportProgressModal from '$lib/components/book/FolderImportProgressModal.svelte';

// IMPORTED MODULES
import * as uploadUtils from '$lib/utils/upload';

describe('FolderImportProgressModal Component UI', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it('renders confirmation phase and allows cancelling before upload starts', async () => {
		const { component } = render(FolderImportProgressModal, {
			props: {
				bookId: 'book-123',
			},
		});

		// CREATE DUMMY MULTI-CHAPTER FILES
		const file1 = new File(['image-1'], '01.png', { type: 'image/png' });
		Object.defineProperty(file1, 'webkitRelativePath', { value: 'Ch 01/01.png' });

		const file2 = new File(['image-2'], '01.png', { type: 'image/png' });
		Object.defineProperty(file2, 'webkitRelativePath', { value: 'Ch 02/01.png' });

		await component.startImport([file1, file2]);
		await tick();

		// CONFIRMATION DIALOG SHOULD DISPLAY
		expect(screen.getByText('Multi-Chapter Folders Detected')).toBeTruthy();
		expect(screen.getByText('Import as 2 Chapters')).toBeTruthy();

		// CANCEL BUTTON IS PRESENT IN CONFIRM PHASE
		const cancelBtn = screen.getByText('Cancel').closest('button');
		expect(cancelBtn).toBeTruthy();

		await fireEvent.click(cancelBtn!);
		await tick();
	});

	it('allows cancelling an in-flight upload and aborts network requests', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => {
			return {
				ok: true,
				json: async () => ({ id: 101, title: 'Ch 01' }),
			};
		});
		global.fetch = fetchMock;

		// MOCK uploadSingleFile WITH A DELAY TO TEST CANCELLATION
		const uploadSpy = vi.spyOn(uploadUtils, 'uploadSingleFile').mockImplementation(
			(_file, _url, _onProgress, signal) =>
				new Promise((resolve, reject) => {
					const timer = setTimeout(() => resolve({ added: 1 }), 500);
					if (signal) {
						signal.addEventListener('abort', () => {
							clearTimeout(timer);
							reject(new Error('Upload cancelled'));
						});
					}
				}),
		);

		const { component } = render(FolderImportProgressModal, {
			props: {
				bookId: 'book-123',
			},
		});

		const file1 = new File(['image-1'], '01.png', { type: 'image/png' });
		Object.defineProperty(file1, 'webkitRelativePath', { value: 'Ch 01/01.png' });

		const file2 = new File(['image-2'], '01.png', { type: 'image/png' });
		Object.defineProperty(file2, 'webkitRelativePath', { value: 'Ch 02/01.png' });

		await component.startImport([file1, file2]);
		await tick();

		// START UPLOAD
		const importBtn = screen.getByText('Import as 2 Chapters').closest('button');
		await fireEvent.click(importBtn!);
		await tick();

		// SHOULD BE IN UPLOADING PHASE WITH CANCEL BUTTON VISIBLE
		expect(screen.getByText('Importing Chapters')).toBeTruthy();
		const cancelUploadBtn = screen.getByText('Cancel').closest('button');
		expect(cancelUploadBtn).toBeTruthy();

		// CLICK CANCEL DURING UPLOADING
		await fireEvent.click(cancelUploadBtn!);
		await tick();

		// SHOULD TRANSITION TO CANCELLED / ERROR STATE
		await vi.waitFor(() => {
			expect(screen.getByText('Import cancelled')).toBeTruthy();
			expect(screen.getByText('Import cancelled by user.')).toBeTruthy();
		});

		uploadSpy.mockRestore();
	});

	it('completes multi-chapter import successfully when not cancelled', async () => {
		const fetchMock = vi.fn().mockImplementation(async () => {
			return {
				ok: true,
				json: async () => ({ id: 101, title: 'Ch 01' }),
			};
		});
		global.fetch = fetchMock;

		const uploadSpy = vi.spyOn(uploadUtils, 'uploadSingleFile').mockResolvedValue({ added: 1 });

		const { component } = render(FolderImportProgressModal, {
			props: {
				bookId: 'book-123',
			},
		});

		const file1 = new File(['image-1'], '01.png', { type: 'image/png' });
		Object.defineProperty(file1, 'webkitRelativePath', { value: 'Ch 01/01.png' });

		await component.startImport([file1]);
		await tick();

		// CONFIRM IMPORT PROMPT
		const importBtn = screen.getByText(/Import 1 Page/i).closest('button');
		expect(importBtn).toBeTruthy();
		await fireEvent.click(importBtn!);
		await tick();

		// UPLOAD COMPLETES
		await vi.waitFor(() => {
			expect(screen.getByText('Import complete!')).toBeTruthy();
		});

		uploadSpy.mockRestore();
	});
});
