// -- CONTEXT MENU REGISTRATION AND QUICK IMPORT HANDLERS -- //

// IMPORTED MODULES
import { XianScanClient } from '../api';
import { sanitizeFileName } from '../utils/sanitize';
import { getServerUrl } from '../core/storage';
import { fetchImageBlob, safeFetch } from './downloader';

// -- FUNCTIONS -- //

// INITIALIZE RIGHT-CLICK CONTEXT MENUS
export function initContextMenus(): void {
	if (typeof chrome === 'undefined' || !chrome.contextMenus?.create) return;

	chrome.runtime.onInstalled.addListener(() => {
		chrome.contextMenus.removeAll(() => {
			void chrome.runtime.lastError;
			chrome.contextMenus.create({
				id: 'xianscan-root',
				title: 'XianScan - Import Image',
				contexts: ['image']
			});

			chrome.contextMenus.create({
				parentId: 'xianscan-root',
				id: 'xianscan-recent-chapter',
				title: 'Send to Recent Chapter',
				contexts: ['image']
			});

			chrome.contextMenus.create({
				parentId: 'xianscan-root',
				id: 'xianscan-quick-inbox',
				title: 'Send to Quick Inbox',
				contexts: ['image']
			});
		});
	});

	chrome.contextMenus.onClicked.addListener((info, tab) => {
		if (!info.srcUrl) return;

		if (info.menuItemId === 'xianscan-recent-chapter') {
			void handleSingleImageUpload(info.srcUrl, 'recent', tab?.url);
		} else if (info.menuItemId === 'xianscan-quick-inbox') {
			void handleSingleImageUpload(info.srcUrl, 'inbox', tab?.url);
		}
	});
}

// UPLOAD A SINGLE IMAGE FROM RIGHT-CLICK CONTEXT MENU
export async function handleSingleImageUpload(srcUrl: string, targetType: 'recent' | 'inbox', pageUrl?: string): Promise<void> {
	try {
		const serverUrl = await getServerUrl();
		const client = new XianScanClient(serverUrl, safeFetch);

		const { blob, ext } = await fetchImageBlob(srcUrl, pageUrl);
		const filename = sanitizeFileName(`quick_import_${Date.now()}.${ext}`);

		let targetChapterId: number | null = null;
		let chapterName = '';

		if (targetType === 'recent') {
			const stored = await chrome.storage.local.get(['lastChapterId']);
			if (stored.lastChapterId) {
				targetChapterId = stored.lastChapterId;
			}
		}

		if (!targetChapterId) {
			targetChapterId = await getOrCreateQuickInboxChapter(client);
			chapterName = 'Quick Inbox';
		}

		try {
			await client.uploadPages(targetChapterId, [{ blob, filename }]);
		} catch (uploadErr: any) {
			if (uploadErr?.message?.includes('Chapter not found') || uploadErr?.message?.includes('404')) {
				console.warn(`Recent chapter #${targetChapterId} not found, falling back to Quick Inbox.`);
				targetChapterId = await getOrCreateQuickInboxChapter(client);
				await client.uploadPages(targetChapterId, [{ blob, filename }]);
				chapterName = 'Quick Inbox';
			} else {
				throw uploadErr;
			}
		}

		await chrome.storage.local.set({ lastChapterId: targetChapterId });

		const destLabel = chapterName ? `Quick Inbox (Chapter #${targetChapterId})` : `Chapter #${targetChapterId}`;
		chrome.notifications?.create({
			type: 'basic',
			iconUrl: 'icons/icon-128.png',
			title: 'XianScan Importer',
			message: `Added image to ${destLabel} successfully!`
		});
	} catch (e: any) {
		console.error('Failed single image import:', e);
		chrome.notifications?.create({
			type: 'basic',
			iconUrl: 'icons/icon-128.png',
			title: 'XianScan Import Failed',
			message: e.message || 'Could not connect to XianScan server.'
		});
	}
}

// FIND OR CREATE QUICK IMPORTS BOOK AND CHAPTER
async function getOrCreateQuickInboxChapter(client: XianScanClient): Promise<number> {
	const books = await client.getBooks();
	let inboxBook = books.find(b => b.title === 'Web Quick Imports');

	if (!inboxBook) {
		inboxBook = await client.createBook({
			title: 'Web Quick Imports',
			sourceLang: 'zh-Hans',
			targetLang: 'en'
		});
	}

	const chapters = await client.getChapters(inboxBook.id);
	let todayChapter = chapters.find(c => c.title.startsWith('Inbox'));

	if (!todayChapter) {
		const dateStr = new Date().toISOString().split('T')[0];
		todayChapter = await client.createChapter(inboxBook.id, {
			title: `Inbox ${dateStr}`,
			chapterNumber: chapters.length + 1
		});
	}

	return todayChapter.id;
}
