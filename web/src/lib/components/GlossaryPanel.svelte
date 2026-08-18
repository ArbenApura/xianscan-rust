<script lang="ts">
	// IMPORTED TYPES
	import type { Gender, GlossaryRow, GlossaryScope, TermCategory, TermStatus } from '$lib/types';
	// IMPORTED DEP-MODULES
	import { toast } from 'svelte-sonner';
	import { onMount, onDestroy } from 'svelte';
	// IMPORTED MODULES
	import { apiFetch } from '$lib/api';
	import { cn } from '$lib/utils/cn';
	import { ripple } from '$lib/actions/ripple';
	import { TERM_CATEGORIES } from '$lib/types';
	import { chapterLabel } from '$lib/chapter-label';
	import { DEFAULT_SOURCE_LANG, DEFAULT_TARGET_LANG } from '$lib/languages';
	import { settings, THEME_CLASS } from '$lib/stores/settings';
	import { validateForm } from '$lib/utils/form';
	import { createGlossaryTermSchema, updateGlossaryTermSchema } from '$lib/schemas';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	// IMPORTED DEP-COMPONENTS
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import ChevronsLeft from 'lucide-svelte/icons/chevrons-left';
	import ChevronsRight from 'lucide-svelte/icons/chevrons-right';
	import Download from 'lucide-svelte/icons/download';
	import Languages from 'lucide-svelte/icons/languages';
	import Plus from 'lucide-svelte/icons/plus';
	import Search from 'lucide-svelte/icons/search';
	import Star from 'lucide-svelte/icons/star';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import Upload from 'lucide-svelte/icons/upload';
	import Check from 'lucide-svelte/icons/check';
	import CheckSquare from 'lucide-svelte/icons/check-square';
	import Square from 'lucide-svelte/icons/square';
	import Pin from 'lucide-svelte/icons/pin';
	import PinOff from 'lucide-svelte/icons/pin-off';
	import X from 'lucide-svelte/icons/x';
	// IMPORTED COMPONENTS
	import Button from '$lib/components/ui/Button.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Select from '$lib/components/ui/Select.svelte';

	// -- REQUIRED PROPS -- //

	export let scope: GlossaryScope;

	// -- OPTIONAL PROPS -- //

	export let bookId: string | null = null;
	export let bookTitle = '';
	// WHEN THE PANEL IS OPEN INSIDE A CHAPTER READING CONTEXT (THE READER), THE CHAPTER A ONE-OFF "Translate"
	// IS BILLED AGAINST — SO ITS TERM-TRANSLATE SPEND LANDS ON THAT CHAPTER'S STATS. null OUTSIDE A READER.
	export let chapterId: number | null = null;
	// SURFACE THE STICKY SEARCH BAR PAINTS OVER. DEFAULTS TO THE THEMED PAGE BG; THE DIALOG OVERRIDES
	// IT WITH THE MODAL'S OWN SURFACE SO THE PINNED BAR ALWAYS MATCHES WHAT'S BEHIND IT.
	export let surface = '';
	// FOR GLOBAL SCOPE: WHICH LANGUAGE PAIR'S GLOSSARY TO SHOW/EDIT. BOOK SCOPE INHERITS THE BOOK'S PAIR
	// SERVER-SIDE, SO THESE ARE ONLY MEANINGFUL (AND ONLY SENT) WHEN scope === 'global'.
	export let sourceLang: string = DEFAULT_SOURCE_LANG;
	export let targetLang: string = DEFAULT_TARGET_LANG;
	// OPTIONAL SSR PRELOADED DATA
	export let initialRows: GlossaryRow[] | null = null;
	export let initialTotal: number | null = null;

	// -- TYPES -- //

	type Entry = {
		id: number;
		source: string;
		target: string;
		gender: Gender;
		context: string | null;
		tags: string | null;
		category: TermCategory | null;
		pinned: boolean;
		status: TermStatus;
		aliases: string[];
		// THE first-appearance CHAPTER — seq IS ONLY A FALLBACK POSITION; THE REAL STORY NUMBER IS PARSED
		// FROM THE TITLE (chapterLabel), SO A WEB BOOK STARTED AT Ch. 562 SHOWS 562, NOT ITS ROW INDEX.
		firstSeq: number | null;
		firstChapterTitle: string | null;
		firstChapterTitleTarget: string | null;
	};

	// -- CONSTANTS -- //

	const GENDERS: Gender[] = ['neuter', 'masculine', 'feminine'];
	// TITLE-CASE LABELS FOR THE gender Select / DISPLAY CHIPS — THE STORED value STAYS LOWERCASE.
	const GENDER_LABELS: Record<Gender, string> = {
		neuter: 'Neuter',
		masculine: 'Masculine',
		feminine: 'Feminine',
	};
	const GENDER_ITEMS = GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] }));
	// HUMAN LABELS FOR THE category Select / DISPLAY CHIP; THE EMPTY value CLEARS IT (UNCATEGORISED).
	const CATEGORY_LABELS: Record<TermCategory, string> = {
		character: 'Character',
		location: 'Location',
		organization: 'Organization',
		technique: 'Technique',
		item: 'Item',
		realm: 'Realm',
		creature: 'Creature',
		title: 'Title',
		concept: 'Concept',
		other: 'Other',
	};
	// PER-CATEGORY ACCENT (ARBITRARY HEX — NON-STANDARD PALETTE) FOR THE TINTED CHIP ON EACH CARD.
	const CATEGORY_COLOR: Record<TermCategory, string> = {
		character: '#e0567a',
		location: '#3aa17e',
		organization: '#a4793a',
		technique: '#6d6fe0',
		item: '#c9913a',
		realm: '#9a59c9',
		creature: '#c75b3a',
		title: '#3a8fc9',
		concept: '#5a8a3a',
		other: '#8a8f99',
	};
	const CATEGORY_ITEMS = [
		{ value: '', label: 'Uncategorized' },
		...TERM_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
	];
	const PAGE_SIZE_ITEMS = [10, 25, 50, 100, 200].map((n) => ({ value: String(n), label: `${n} / page` }));

	// -- STATES -- //

	let rows: Entry[] = initialRows
		? initialRows.map((r) => ({
				id: r.id,
				source: r.source,
				target: r.target,
				gender: r.gender,
				context: r.context,
				tags: r.tags,
				category: r.category,
				pinned: r.pinned,
				status: r.status,
				aliases: r.aliases ?? [],
				firstSeq: r.firstSeq,
				firstChapterTitle: r.firstChapterTitle,
				firstChapterTitleTarget: r.firstChapterTitleTarget,
			}))
		: [];
	let total = initialTotal ?? 0;
	let page = 1;
	let pageSize = 10;
	let jumpValue: number | string = 1;
	let query = '';
	let loading = initialRows === null;
	let busy = false;
	// ONE UNIFIED ADD / EDIT DIALOG — THE LIST ITSELF IS READ-ONLY; ALL EDITING HAPPENS HERE.
	let formOpen = false;
	let formMode: 'add' | 'edit' = 'add';
	let formId: number | null = null;
	let fSource = '';
	let fTarget = '';
	let fGender: Gender = 'neuter';
	let fCategory: TermCategory | null = null;
	let fPinned = false;
	let fContext = '';
	let fAliases = '';
	let fStatus: TermStatus = 'ai';
	let fFirstLabel: string | null = null;
	let translating = false;
	let fileInput: HTMLInputElement;
	let debounce: ReturnType<typeof setTimeout>;
	let loadToken = 0; // GUARDS AGAINST OUT-OF-ORDER load() RESPONSES PAINTING STALE ROWS

	// MULTI-SELECTION & BATCH ACTIONS STATES
	let selectedTermIds = new Set<number>();
	let batchDeleteConfirmOpen = false;

	// DANGEROUS CLEAR SCOPE CONFIRMATION STATES
	let clearScopeConfirmOpen = false;
	let clearingScope = false;

	// -- REACTIVE STATES -- //

	$: allVisibleSelected = rows.length > 0 && rows.every((r) => selectedTermIds.has(r.id));
	$: someVisibleSelected = rows.some((r) => selectedTermIds.has(r.id)) && !allVisibleSelected;
	$: selectedTermsList = rows.filter((r) => selectedTermIds.has(r.id));
	$: anySelectedPinned = selectedTermsList.some((r) => r.pinned);
	$: allSelectedPinned = selectedTermsList.length > 0 && selectedTermsList.every((r) => r.pinned);

	$: scopeQs =
		scope === 'book' && bookId
			? `scope=book&bookId=${encodeURIComponent(bookId)}`
			: `scope=global&sourceLang=${encodeURIComponent(sourceLang)}&targetLang=${encodeURIComponent(targetLang)}`;
	$: pageCount = Math.max(1, Math.ceil(total / pageSize));
	// 1-BASED RANGE OF ROWS SHOWN ON THE CURRENT PAGE ("1–10 of 7,403")
	$: rangeFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
	$: rangeTo = Math.min(page * pageSize, total);
	$: pageSurface = THEME_CLASS[$settings.theme] || 'bg-white dark:bg-slate-900';
	// IN A DIALOG (surface SET) THE PANEL IS A FLEX COLUMN THAT FILLS THE MODAL BODY: THE HEADER AND THE
	// PAGINATION FOOTER ARE FIXED FLEX ITEMS (shrink-0) AND ONLY THE LIST AREA BETWEEN THEM SCROLLS — SO
	// THE SCROLLBAR LIVES ON THE LIST, NOT THE WHOLE DIALOG. ON A STANDALONE PAGE THE PANEL FLOWS NORMALLY
	// AND THE HEADER STICKS TO THE DOCUMENT TOP.
	$: rootClass = surface ? 'flex min-h-0 flex-1 flex-col' : 'flex flex-col gap-4';
	$: headerClass = cn(
		'flex flex-col gap-3 border-b border-black/[0.06] pb-3 dark:border-white/[0.045]',
		surface ? `shrink-0 pt-5 ${surface}` : '',
	);
	// THE LIST SCROLL AREA — THE ONLY SCROLLER IN DIALOG MODE; A TRANSPARENT PASS-THROUGH STANDALONE.
	$: scrollClass = surface ? 'min-h-0 flex-1 overflow-y-auto py-4' : '';
	$: footerClass = cn(
		'flex flex-col gap-3 border-t border-black/[0.06] pt-3 text-sm dark:border-white/[0.045] sm:flex-row sm:items-center sm:justify-between',
		surface ? `shrink-0 pb-5 ${surface}` : '',
	);
	// KEEP THE JUMP FIELD IN SYNC WITH THE CURRENT PAGE (USER EDITS IT THEN SUBMITS TO JUMP)
	$: jumpValue = page;

	// -- FUNCTIONS -- //

	function toggleSelectTerm(id: number, e?: MouseEvent | KeyboardEvent) {
		if (e) e.stopPropagation();
		const next = new Set(selectedTermIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedTermIds = next;
	}

	function toggleSelectAllVisible() {
		if (allVisibleSelected) {
			const next = new Set(selectedTermIds);
			for (const r of rows) next.delete(r.id);
			selectedTermIds = next;
		} else {
			const next = new Set(selectedTermIds);
			for (const r of rows) next.add(r.id);
			selectedTermIds = next;
		}
	}

	function clearSelection() {
		selectedTermIds = new Set();
	}

	function promptBatchDelete() {
		if (selectedTermIds.size === 0) return;
		batchDeleteConfirmOpen = true;
	}

	async function confirmBatchDelete() {
		if (selectedTermIds.size === 0) return;
		const count = selectedTermIds.size;
		busy = true;
		try {
			const res = await apiFetch('/api/glossary', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids: [...selectedTermIds], scope, bookId }),
			});
			if (!res.ok) throw new Error('Batch delete failed');
			toast.success(`Deleted ${count} term${count === 1 ? '' : 's'}.`);
			clearSelection();
			await load();
		} catch {
			toast.error('Could not delete selected terms.');
		} finally {
			busy = false;
			batchDeleteConfirmOpen = false;
		}
	}

	async function batchTogglePin(targetPinState: boolean) {
		if (selectedTermIds.size === 0) return;
		busy = true;
		try {
			const res = await apiFetch('/api/glossary', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids: [...selectedTermIds], pinned: targetPinState, scope, bookId }),
			});
			if (!res.ok) throw new Error('Batch pin update failed');
			toast.success(`${targetPinState ? 'Pinned' : 'Unpinned'} ${selectedTermIds.size} term${selectedTermIds.size === 1 ? '' : 's'}.`);
			clearSelection();
			await load();
		} catch {
			toast.error('Could not update pin state.');
		} finally {
			busy = false;
		}
	}

	function openClearScopeModal() {
		clearScopeConfirmOpen = true;
	}

	async function confirmClearScope() {
		clearingScope = true;
		try {
			const res = await apiFetch('/api/glossary', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					clearScope: true,
					scope,
					bookId: scope === 'book' ? bookId : undefined,
					sourceLang: scope === 'global' ? sourceLang : undefined,
					targetLang: scope === 'global' ? targetLang : undefined,
				}),
			});
			if (!res.ok) throw new Error('Clear scope failed');
			const data = await res.json();
			const count = data.count ?? total;
			toast.success(`Cleared ${count} term${count === 1 ? '' : 's'} from ${scope === 'book' ? (bookTitle || 'book') : 'global'} glossary.`);
			clearScopeConfirmOpen = false;
			clearSelection();
			page = 1;
			await load();
		} catch {
			toast.error('Could not clear glossary scope.');
		} finally {
			clearingScope = false;
		}
	}

	async function load() {
		const token = ++loadToken;
		loading = true;
		try {
			const res = await apiFetch(
				`/api/glossary?${scopeQs}&page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(query)}`,
			);
			const data = await res.json();
			// IGNORE A RESPONSE THAT A NEWER load() (FROM RAPID PAGINATION/SEARCH) HAS ALREADY SUPERSEDED,
			// SO AN OLDER, SLOWER RESPONSE CAN'T OVERWRITE THE FRESH ROWS.
			if (token !== loadToken) return;
			rows = ((data.rows ?? []) as GlossaryRow[]).map((r) => ({
				id: r.id,
				source: r.source,
				target: r.target,
				gender: r.gender,
				context: r.context,
				tags: r.tags,
				category: r.category,
				pinned: r.pinned,
				status: r.status,
				aliases: r.aliases ?? [],
				firstSeq: r.firstSeq,
				firstChapterTitle: r.firstChapterTitle,
				firstChapterTitleTarget: r.firstChapterTitleTarget,
			}));
			total = data.total ?? 0;
		} catch {
			if (token !== loadToken) return;
			toast.error('Could not load the glossary.');
		} finally {
			if (token === loadToken) loading = false;
		}
	}

	// LOAD THE FIRST PAGE ON MOUNT ONLY IF NOT SSR-PRELOADED.
	onMount(() => {
		if (initialRows === null) {
			load();
		}
	});

	function onSearch() {
		clearTimeout(debounce);
		debounce = setTimeout(() => {
			page = 1;
			load();
		}, 300);
	}

	function gotoPage(p: number) {
		page = Math.min(pageCount, Math.max(1, p));
		load();
	}

	// CHANGE HOW MANY ROWS SHOW PER PAGE — RESET TO THE FIRST PAGE SO THE OFFSET STAYS VALID
	function setPageSize(v: string) {
		pageSize = Number(v);
		page = 1;
		load();
	}

	// JUMP TO AN ARBITRARY PAGE INDEX (CLAMPED) FROM THE INPUT FIELD
	function jumpToPage() {
		const n = Number(jumpValue);
		gotoPage(Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
	}

	// PARSE THE COMMA-SEPARATED ALIAS INPUT INTO A CLEAN, DEDUPED ARRAY.
	function splitAliases(text: string): string[] {
		return [
			...new Set(
				text
					.split(',')
					.map((a) => a.trim())
					.filter(Boolean),
			),
		];
	}

	// THE REAL STORY CHAPTER WHERE A TERM FIRST APPEARS: PARSE THE NUMBER FROM THE TITLE (第562章 → "Ch. 562")
	// OR USE A SPECIAL TAG (Prologue / Extra …); FALL BACK TO THE BOOK POSITION ONLY FOR A PLAIN, UNNUMBERED
	// TITLE (SEQUENTIAL epub/txt). null WHEN THERE IS NO first-appearance CHAPTER (GLOBAL TERM / DELETED CHAPTER).
	function firstAppearanceLabel(e: Entry): string | null {
		if (e.firstChapterTitle) {
			const lbl = chapterLabel(e.firstChapterTitle, e.firstChapterTitleTarget);
			if (lbl.kind === 'chapter') return `Ch. ${lbl.number}`;
			if (lbl.kind === 'special') return lbl.tag;
		}
		if (e.firstSeq !== null) return `Ch. ${e.firstSeq + 1}`;
		return null;
	}

	// OPEN THE DIALOG IN ADD MODE (BLANK FIELDS).
	function openAdd() {
		formMode = 'add';
		formId = null;
		fSource = '';
		fTarget = '';
		fGender = 'neuter';
		fCategory = null;
		fPinned = false;
		fContext = '';
		fAliases = '';
		fStatus = 'ai';
		fFirstLabel = null;
		formOpen = true;
	}

	// OPEN THE DIALOG IN EDIT MODE, PREFILLED FROM THE TAPPED CARD.
	function openEdit(e: Entry) {
		formMode = 'edit';
		formId = e.id;
		fSource = e.source;
		fTarget = e.target;
		fGender = e.gender;
		fCategory = e.category;
		fPinned = e.pinned;
		fContext = e.context ?? '';
		fAliases = e.aliases.join(', ');
		fStatus = e.status;
		fFirstLabel = firstAppearanceLabel(e);
		formOpen = true;
	}

	function closeForm() {
		formOpen = false;
	}

	// CREATE (add) OR UPDATE (edit) THE TERM FROM THE DIALOG FIELDS.
	async function submitForm() {
		const fields = {
			source: fSource.trim(),
			target: fTarget.trim(),
			gender: fGender,
			context: fContext.trim() || null,
			category: fCategory,
			pinned: fPinned,
			aliases: splitAliases(fAliases),
		};

		let validation;
		if (formMode === 'add') {
			validation = validateForm(createGlossaryTermSchema, {
				scope,
				bookId: bookId || null,
				sourceLang,
				targetLang,
				...fields,
			});
		} else {
			validation = validateForm(updateGlossaryTermSchema, fields);
		}

		if (!validation.success) {
			toast.error(Object.values(validation.errors)[0] || 'Invalid term fields.');
			return;
		}

		busy = true;
		try {
			const res =
				formMode === 'add'
					? await apiFetch('/api/glossary', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify(validation.data),
						})
					: await apiFetch(`/api/glossary/${formId}`, {
							method: 'PUT',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify(validation.data),
						});
			if (!res.ok) throw new Error('Save failed');
			formOpen = false;
			await load();
			toast.success(formMode === 'add' ? 'Term added.' : 'Term saved.');
		} catch {
			toast.error(formMode === 'add' ? 'Could not add the term.' : 'Could not save that term.');
		} finally {
			busy = false;
		}
	}

	// DELETE THE TERM BEING EDITED.
	async function deleteCurrent() {
		if (formId === null) return;
		busy = true;
		try {
			const res = await apiFetch(`/api/glossary/${formId}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Delete failed');
			formOpen = false;
			await load();
			toast.success('Term deleted.');
		} catch {
			toast.error('Could not delete that term.');
		} finally {
			busy = false;
		}
	}

	// AI-FILL THE DIALOG'S TARGET RENDERING FROM ITS SOURCE TERM.
	async function translateTarget() {
		const source = fSource.trim();
		if (!source) {
			toast.error('Add the source term first.');
			return;
		}
		translating = true;
		try {
			const res = await apiFetch('/api/translate-text', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					text: source,
					kind: 'term',
					bookId: scope === 'book' ? bookId : undefined,
					// ATTRIBUTE THE SPEND TO THE CHAPTER BEING READ (book SCOPE ONLY) SO IT SHOWS ON ITS STATS.
					chapterId: scope === 'book' ? (chapterId ?? undefined) : undefined,
					// REGENERATE EVEN FOR AN EXISTING TERM — OTHERWISE THE ENDPOINT JUST ECHOES THE STORED target.
					fresh: true,
				}),
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d.message ?? 'Translation failed');
			fTarget = d.text;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not translate the term.');
		} finally {
			translating = false;
		}
	}

	async function onImport(ev: Event) {
		const file = (ev.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		busy = true;
		const tid = toast.loading(`Importing ${file.name}…`);
		try {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('scope', scope);
			if (bookId) fd.append('bookId', bookId);
			// GLOBAL IMPORT TARGETS A SPECIFIC LANGUAGE PAIR; BOOK IMPORT INHERITS THE BOOK'S.
			if (scope === 'global') {
				fd.append('sourceLang', sourceLang);
				fd.append('targetLang', targetLang);
			}
			const res = await apiFetch('/api/glossary/import', { method: 'POST', body: fd });
			if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Import failed');
			const out = await res.json();
			toast.success(`Imported ${out.parsed} rows (${out.added} new, ${out.updated} updated).`, { id: tid });
			page = 1;
			await load();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Import failed.', { id: tid });
		} finally {
			busy = false;
			if (fileInput) fileInput.value = '';
		}
	}

	function exportHref(which: GlossaryScope): string {
		const b = bookId ? `&bookId=${encodeURIComponent(bookId)}` : '';
		// GLOBAL EXPORT IS SCOPED TO THE SELECTED LANGUAGE PAIR.
		const l =
			which === 'global'
				? `&sourceLang=${encodeURIComponent(sourceLang)}&targetLang=${encodeURIComponent(targetLang)}`
				: '';
		return `/api/glossary/export?scope=${which}${b}${l}`;
	}

	// CAST IN SCRIPT (TS `as` IS NOT ALLOWED INSIDE SVELTE TEMPLATE EXPRESSIONS)
	function setFGender(v: string) {
		fGender = v as Gender;
	}
	// EMPTY value = UNCATEGORISED (→ null).
	function setFCategory(v: string) {
		fCategory = v ? (v as TermCategory) : null;
	}

	// -- LIFECYCLES -- //

	onMount(load);
	onDestroy(() => clearTimeout(debounce));
</script>

<!-- GLOSSARY PANEL: PAGINATED, SEARCHABLE, IMPORT/EXPORT. THE LIST IS READ-ONLY CARDS; TAPPING A CARD OPENS
     THE EDIT DIALOG. IN A DIALOG IT IS A FLEX COLUMN WHOSE LIST AREA IS THE ONLY SCROLLER. -->
<div class={rootClass}>
	<!-- FIXED HEADER: TOOLBAR + SEARCH (shrink-0 IN A DIALOG, STICKY ON A STANDALONE PAGE) -->
	<div class={headerClass}>
		<!-- TOOLBAR: ACTIONS ON ONE TIDY ROW, TERM COUNT RIGHT-ALIGNED (PREDICTABLE AT EVERY WIDTH) -->
		<!-- ICON-ONLY ON MOBILE (LABELS sr-only), FULL LABELS FROM sm UP — KEEPS THE BAR COMPACT ON A PHONE -->
		<div class="flex flex-wrap items-center gap-2">
			<Button variant="primary" on:click={openAdd}>
				<Plus size={14} /><span class="sr-only sm:not-sr-only sm:ml-1.5">Add term</span>
			</Button>
			<!-- IMPORT USES Download (ARROW IN), EXPORT USES Upload (ARROW OUT) — ARROWS MATCH THE IN/OUT MEANING -->
			<Button on:click={() => fileInput.click()} disabled={busy}>
				<Download size={14} /><span class="sr-only sm:not-sr-only sm:ml-1.5">Import CSV</span>
			</Button>
			<Button href={exportHref(scope)}>
				<Upload size={14} /><span class="sr-only sm:not-sr-only sm:ml-1.5">Export</span>
			</Button>

			{#if rows.length > 0}
				<button
					type="button"
					on:click={toggleSelectAllVisible}
					class="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-black/10 bg-black/5 px-2.5 text-xs font-medium transition hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
					title={allVisibleSelected ? 'Deselect all visible terms' : 'Select all terms on this page'}
					use:ripple
				>
					{#if allVisibleSelected}
						<CheckSquare size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
					{:else}
						<Square size={13} class="opacity-60" />
					{/if}
					<span>{allVisibleSelected ? 'Deselect All' : 'Select Page'}</span>
				</button>
			{/if}

			<!-- DANGEROUS CLEAR SCOPE BUTTON -->
			<Button
				class="text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border-rose-500/20"
				disabled={busy || total === 0}
				on:click={openClearScopeModal}
				title={`Permanently delete all terms in ${scope === 'book' ? (bookTitle || 'this book') : 'global'} glossary`}
			>
				<Trash2 size={14} />
				<span class="sr-only sm:not-sr-only sm:ml-1.5">Clear Scope</span>
			</Button>

			<span class="ml-auto text-xs tabular-nums opacity-60">{total.toLocaleString()} terms</span>
			<input bind:this={fileInput} type="file" accept=".csv,text/csv" class="hidden" on:change={onImport} />
		</div>
		<!-- SCOPE NOTE -->
		<p class="text-xs opacity-50">
			{scope === 'global'
				? 'Applies to every book.'
				: `Private to ${bookTitle || 'this book'} — overrides the global glossary.`}
		</p>

		<!-- SEARCH -->
		<div class="relative">
			<Search size={15} class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
			<input
				bind:value={query}
				on:input={onSearch}
				type="search"
				placeholder="Search terms…"
				class="w-full rounded-lg border border-black/10 bg-transparent py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#c0392b] dark:border-white/[0.06]"
			/>
		</div>
	</div>

	<!-- LIST SCROLL AREA: ONLY THIS REGION SCROLLS IN A DIALOG; HEADER AND FOOTER STAY FIXED -->
	<div class={scrollClass}>
		{#if loading && rows.length === 0}
			<!-- FIRST-LOAD SKELETON: MIRRORS THE CARD LAYOUT (SOURCE→TARGET LINE + A CHIP ROW) -->
			<ul
				class="divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-black/[0.06] dark:divide-white/[0.045] dark:border-white/[0.045]"
			>
				{#each [0, 1, 2, 3, 4, 5] as i (i)}
					<li class="flex flex-col gap-2 px-3 py-3">
						<div class="flex items-center gap-2">
							<div class="h-3.5 w-24 animate-pulse rounded bg-black/[0.07] dark:bg-white/[0.08]"></div>
							<div class="h-3.5 w-28 animate-pulse rounded bg-black/[0.05] dark:bg-white/[0.06]"></div>
						</div>
						<div class="flex gap-1.5">
							<div class="h-3 w-16 animate-pulse rounded-full bg-black/[0.05] dark:bg-white/[0.06]"></div>
							<div class="h-3 w-10 animate-pulse rounded bg-black/[0.04] dark:bg-white/[0.05]"></div>
						</div>
					</li>
				{/each}
			</ul>
		{:else if rows.length === 0}
			<p class="py-6 text-center text-sm opacity-50">
				{query ? 'No matches.' : 'No terms yet — add or import some.'}
			</p>
		{:else}
			<!-- READ-ONLY CARD LIST WITH CHECKBOX SELECTION: FLUID CHIP LAYOUT -->
			<ul
				class="divide-y divide-black/[0.06] overflow-hidden rounded-xl border border-black/[0.06] transition-opacity dark:divide-white/[0.045] dark:border-white/[0.045]"
				class:opacity-50={loading}
			>
				{#each rows as e (e.id)}
					{@const firstLabel = firstAppearanceLabel(e)}
					{@const isSelected = selectedTermIds.has(e.id)}
					<li class={`transition-colors ${isSelected ? 'bg-[#b23a2e]/5 dark:bg-[#e08a63]/10' : ''}`}>
						<div class="flex items-start gap-2.5 px-3 py-2.5">
							<!-- CARD CHECKBOX TOGGLE -->
							<button
								type="button"
								on:click={(ev) => toggleSelectTerm(e.id, ev)}
								class={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all mt-1 ${
									isSelected
										? 'bg-[#b23a2e] border-[#b23a2e] text-white shadow-xs'
										: 'border-black/20 bg-transparent text-transparent hover:border-black/40 dark:border-white/20 dark:hover:border-white/40'
								}`}
								title={isSelected ? 'Deselect term' : 'Select term'}
								aria-label="Select term"
							>
								<Check size={12} class={isSelected ? 'stroke-[2.5]' : 'opacity-0'} />
							</button>

							<!-- WHOLE CARD IS THE EDIT TRIGGER — NO INLINE FIELDS -->
							<button
								type="button"
								use:ripple
								on:click={() => openEdit(e)}
								class="flex min-w-0 flex-1 items-start gap-3 text-left transition-colors hover:opacity-90"
							>
								<div class="min-w-0 flex-1">
									<!-- SOURCE → TARGET (PINNED STAR INLINE, ONLY WHEN PINNED — NO RESERVED LEFT GUTTER; WRAPS ON NARROW WIDTHS) -->
									<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
										{#if e.pinned}
											<Star size={13} class="shrink-0 self-center fill-amber-400 text-amber-500" />
										{/if}
										<span class="font-medium">{e.source}</span>
										<span class="opacity-30">→</span>
										<span class="break-words text-[#b23a2e] dark:text-[#e08a63]">{e.target}</span>
									</div>
									<!-- DESCRIPTION — CLAMPED SO LONG NOTES DON'T BLOAT THE ROW -->
									{#if e.context}
										<p class="mt-1 line-clamp-2 text-xs leading-relaxed opacity-55">{e.context}</p>
									{/if}
									<!-- META CHIPS: CATEGORY · GENDER · ALIASES · FIRST-SEEN · STATUS -->
									<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
										{#if e.category}
											<!-- CATEGORY CHIP — RUNTIME PER-CATEGORY COLOUR (style EXCEPTION) -->
											<span
												class="rounded-full border px-1.5 py-0.5"
												style="color: {CATEGORY_COLOR[e.category]}; border-color: {CATEGORY_COLOR[
													e.category
												]}66;">{CATEGORY_LABELS[e.category]}</span
											>
										{/if}
										{#if e.gender === 'masculine'}
											<span
												class="bg-[#3b6fb0]/12 rounded px-1.5 py-0.5 text-[#3b6fb0] dark:text-[#7aa6e0]"
												>Masculine</span
											>
										{:else if e.gender === 'feminine'}
											<span
												class="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-600 dark:text-rose-300"
												>Feminine</span
											>
										{/if}
										{#if e.aliases.length}<span class="truncate opacity-45"
												>also: {e.aliases.join(', ')}</span
											>{/if}
										{#if firstLabel}
											<span class="opacity-45" title="First appears in this chapter"
												>{firstLabel}</span
											>
										{/if}
										<span
											class={cn(
												'rounded px-1.5 py-0.5',
												e.status === 'user'
													? 'bg-[#5b8a72]/14 text-[#4f7a64] dark:text-[#83b39a]'
													: 'opacity-45',
											)}
											title={e.status === 'user'
												? 'Added or confirmed by you'
												: 'Auto-extracted (unreviewed)'}>{e.status === 'user' ? 'You' : 'AI'}</span
										>
									</div>
								</div>
								<!-- EDIT AFFORDANCE -->
								<ChevronRight size={16} class="shrink-0 self-center opacity-25" />
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<!-- PAGINATION FOOTER: FIXED (shrink-0) IN A DIALOG, NORMAL FLOW STANDALONE; SHOWN ONLY WHEN ROWS EXIST -->
	{#if rows.length > 0}
		<div class={footerClass}>
			<!-- ROWS PER PAGE + RANGE -->
			<div class="flex items-center justify-between gap-3 sm:justify-start">
				<div class="flex items-center gap-2">
					<span class="shrink-0 opacity-60">Show</span>
					<Select
						items={PAGE_SIZE_ITEMS}
						value={String(pageSize)}
						on:change={(e) => setPageSize(e.detail)}
						class="w-28"
					/>
				</div>
				<span class="shrink-0 text-xs tabular-nums opacity-50">
					{rangeFrom.toLocaleString()}–{rangeTo.toLocaleString()} of {total.toLocaleString()}
				</span>
			</div>
			<!-- PAGE NAV: FIRST / PREV / JUMP / NEXT / LAST -->
			<div class="flex items-center justify-center gap-1.5 sm:justify-end">
				<Button size="sm" class="hidden sm:inline-flex" disabled={page <= 1} on:click={() => gotoPage(1)}>
					<ChevronsLeft size={16} /><span class="sr-only">First page</span>
				</Button>
				<Button size="sm" disabled={page <= 1} on:click={() => gotoPage(page - 1)}>
					<ChevronLeft size={16} /><span class="sr-only">Previous page</span>
				</Button>
				<form class="flex items-center gap-1.5" on:submit|preventDefault={jumpToPage}>
					<span class="opacity-60">Page</span>
					<input
						type="number"
						min="1"
						max={pageCount}
						bind:value={jumpValue}
						on:change={jumpToPage}
						aria-label="Jump to page"
						class="w-14 rounded-md border border-black/10 bg-transparent px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-[#c0392b] dark:border-white/[0.06]"
					/>
					<span class="shrink-0 opacity-60">of {pageCount.toLocaleString()}</span>
				</form>
				<Button size="sm" disabled={page >= pageCount} on:click={() => gotoPage(page + 1)}>
					<ChevronRight size={16} /><span class="sr-only">Next page</span>
				</Button>
				<Button
					size="sm"
					class="hidden sm:inline-flex"
					disabled={page >= pageCount}
					on:click={() => gotoPage(pageCount)}
				>
					<ChevronsRight size={16} /><span class="sr-only">Last page</span>
				</Button>
			</div>
		</div>
	{/if}
</div>

<!-- STICKY FLOATING BATCH ACTIONS TOOLBAR -->
{#if selectedTermIds.size > 0}
	<div
		transition:fly={{ y: 40, duration: 250, easing: cubicOut }}
		class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 sm:gap-4 rounded-2xl border border-black/15 bg-white/95 px-3 sm:px-4 py-2 sm:py-2.5 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-[#1a1714]/95 max-w-[95vw]"
	>
		<div class="flex items-center gap-2 text-xs font-semibold">
			<span class="flex h-6 w-6 items-center justify-center rounded-lg bg-[#b23a2e] text-white font-mono text-[11px] font-bold shadow-xs">
				{selectedTermIds.size}
			</span>
			<span class="hidden sm:inline">Selected</span>
		</div>

		<div class="h-4 w-px bg-black/10 dark:bg-white/10"></div>

		<div class="flex items-center gap-1.5 sm:gap-2">
			<!-- BATCH PIN / UNPIN -->
			<Button
				variant="secondary"
				size="sm"
				class="gap-1 text-xs h-8 sm:h-9 px-2.5"
				on:click={() => batchTogglePin(!allSelectedPinned)}
				title={allSelectedPinned ? 'Unpin selected terms' : 'Pin selected terms'}
			>
				{#if allSelectedPinned}
					<PinOff size={13} />
					<span>Unpin ({selectedTermIds.size})</span>
				{:else}
					<Pin size={13} />
					<span>Pin ({selectedTermIds.size})</span>
				{/if}
			</Button>

			<!-- BATCH DELETE -->
			<Button
				variant="secondary"
				size="sm"
				class="gap-1 text-xs h-8 sm:h-9 px-2.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border-rose-500/20"
				on:click={promptBatchDelete}
				title="Delete selected terms"
			>
				<Trash2 size={13} />
				<span>Delete ({selectedTermIds.size})</span>
			</Button>

			<button
				type="button"
				on:click={clearSelection}
				class="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-black/5 hover:bg-black/10 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 transition opacity-70 hover:opacity-100"
				title="Clear selection"
				aria-label="Clear selection"
			>
				<X size={14} />
			</button>
		</div>
	</div>
{/if}

<!-- DANGEROUS CLEAR SCOPE CONFIRMATION DIALOG (USES SHARED APP CONFIRM DIALOG WITH VERIFICATION CODE) -->
<ConfirmDialog
	open={clearScopeConfirmOpen}
	title="Clear Entire Glossary?"
	message={`Are you sure you want to permanently delete all ${total.toLocaleString()} glossary term${total === 1 ? '' : 's'} in ${scope === 'book' ? (bookTitle || 'this book') : `${sourceLang} → ${targetLang} Global`}? This action cannot be undone.`}
	confirmLabel={`Clear All (${total.toLocaleString()} terms)`}
	variant="danger"
	requireVerificationCode={true}
	on:confirm={confirmClearScope}
	on:cancel={() => (clearScopeConfirmOpen = false)}
/>

<!-- BATCH DELETE CONFIRMATION DIALOG -->
<ConfirmDialog
	open={batchDeleteConfirmOpen}
	title="Delete Selected Terms?"
	message={`Are you sure you want to delete ${selectedTermIds.size} selected glossary term${selectedTermIds.size === 1 ? '' : 's'}?`}
	confirmLabel={`Delete (${selectedTermIds.size})`}
	variant="danger"
	on:confirm={confirmBatchDelete}
	on:cancel={() => (batchDeleteConfirmOpen = false)}
/>

<!-- ADD / EDIT TERM DIALOG (ONE FORM, MODE-SWITCHED) -->
<Modal open={formOpen} title={formMode === 'add' ? 'Add term' : 'Edit term'} size="sm" on:close={closeForm}>
	<form class="flex flex-col gap-4" on:submit|preventDefault={submitForm}>
		<!-- EDIT META: PROVENANCE + FIRST APPEARANCE (READ-ONLY) -->
		{#if formMode === 'edit'}
			<p class="text-xs opacity-50">
				{fStatus === 'user' ? 'Added or edited by you' : 'Auto-extracted'}{#if fFirstLabel}
					· first appears in {fFirstLabel}{/if}
			</p>
		{/if}
		<label class="block">
			<span class="mb-1 block text-xs font-medium opacity-60">Source term</span>
			<input
				bind:value={fSource}
				placeholder="source term"
				class="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-2 text-sm outline-none focus:border-[#c0392b] dark:border-white/[0.06]"
			/>
		</label>
		<!-- TARGET + AI-FILL: THE Languages BUTTON TRANSLATES THE SOURCE INTO THE TARGET FIELD -->
		<div class="block">
			<span class="mb-1 block text-xs font-medium opacity-60">Target rendering</span>
			<div class="flex items-center gap-2">
				<input
					bind:value={fTarget}
					placeholder="target rendering"
					class="h-[38px] min-w-0 flex-1 rounded-md border border-black/10 bg-transparent px-2.5 text-sm outline-none focus:border-[#c0392b] dark:border-white/[0.06]"
				/>
				<Button
					class="h-[38px] w-[38px] min-h-[38px] min-w-[38px] max-h-[38px] max-w-[38px] shrink-0 p-0 inline-flex items-center justify-center"
					loading={translating}
					disabled={translating || !fSource.trim()}
					on:click={translateTarget}
				>
					{#if !translating}
						<Languages size={15} /><span class="sr-only">Translate source with AI</span>
					{/if}
				</Button>
			</div>
		</div>
		<!-- NOT A <label>: Select IS A CUSTOM WIDGET, NOT A NATIVE CONTROL A LABEL CAN BIND TO -->
		<div class="grid grid-cols-2 gap-3">
			<div class="block">
				<span class="mb-1 block text-xs font-medium opacity-60">Category</span>
				<Select items={CATEGORY_ITEMS} value={fCategory ?? ''} on:change={(e) => setFCategory(e.detail)} />
			</div>
			<div class="block">
				<span class="mb-1 block text-xs font-medium opacity-60">Gender</span>
				<Select items={GENDER_ITEMS} value={fGender} on:change={(e) => setFGender(e.detail)} />
			</div>
		</div>
		<!-- PIN TOGGLE — NATIVE CHECKBOX (NO ripple ON NATIVE FORM CONTROLS) -->
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={fPinned} class="h-4 w-4 accent-amber-500" />
			<span class="text-sm">Pin — prioritise this term during translation</span>
		</label>
		<label class="block">
			<span class="mb-1 block text-xs font-medium opacity-60">Description (optional)</span>
			<textarea
				bind:value={fContext}
				rows="2"
				placeholder="What this is and its role in the story (e.g. The protagonist's senior martial brother and rival)"
				class="w-full resize-y rounded-md border border-black/10 bg-transparent px-2.5 py-2 text-sm outline-none focus:border-[#c0392b] dark:border-white/[0.06]"
			></textarea>
		</label>
		<label class="block">
			<span class="mb-1 block text-xs font-medium opacity-60">Aliases (optional)</span>
			<input
				bind:value={fAliases}
				placeholder="Other source forms, comma-separated (e.g. 齊兄, 澈)"
				class="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-2 text-sm outline-none focus:border-[#c0392b] dark:border-white/[0.06]"
			/>
		</label>
		<!-- HIDDEN SUBMIT: LETS ENTER SUBMIT THE FORM WHILE THE VISIBLE ACTIONS LIVE IN THE FOOTER -->
		<button type="submit" class="hidden" disabled={busy} aria-hidden="true"></button>
	</form>
	<svelte:fragment slot="footer">
		<!-- DELETE (EDIT ONLY) IS PUSHED LEFT, AWAY FROM THE SAFE Cancel / Save PAIR -->
		{#if formMode === 'edit'}
			<Button class="mr-auto text-rose-600 dark:text-rose-400" disabled={busy} on:click={deleteCurrent}>
				<Trash2 size={14} /> Delete
			</Button>
		{/if}
		<Button on:click={closeForm}>Cancel</Button>
		<Button variant="primary" loading={busy} disabled={busy} on:click={submitForm}>
			{#if formMode === 'add'}<Plus size={14} /> Add term{:else}Save{/if}
		</Button>
	</svelte:fragment>
</Modal>
