<script lang="ts">
	// BOOK METADATA FIELDS - AUTHOR / ARTIST, DESCRIPTION, GENRES & TAGS (CHIP INPUT), SERIALIZATION
	// STATUS. SHARED BY THE CREATE-BOOK AND EDIT-BOOK FORMS. ALL FIELDS ARE BINDABLE PROPS.

	// IMPORTED MODULES
	import SelectField from '$lib/components/ui/SelectField.svelte';
	import TagInput from '$lib/components/ui/TagInput.svelte';

	// -- CONSTANTS -- //

export const BOOK_STATUS_OPTIONS: { value: string; label: string }[] = [
	{ value: 'unknown', label: 'Unknown' },
	{ value: 'ongoing', label: 'Ongoing' },
	{ value: 'completed', label: 'Completed' },
	{ value: 'licensed', label: 'Licensed' },
	{ value: 'publishing_finished', label: 'Publishing Finished' },
	{ value: 'cancelled', label: 'Cancelled' },
	{ value: 'on_hiatus', label: 'On Hiatus' },
];

// CURATED GENRE PALETTE — QUICK-ADD SUGGESTIONS SHOWN UNDER THE CHIP FIELD. NOT ENFORCED; USERS MAY
// STILL TYPE ARBITRARY TAGS.
const GENRE_SUGGESTIONS = [
	'Action',
	'Adventure',
	'Comedy',
	'Drama',
	'Fantasy',
	'Romance',
	'Sci-Fi',
	'Slice of Life',
	'Horror',
	'Mystery',
	'Thriller',
	'Martial Arts',
	'Cultivation',
	'Xianxia',
	'Historical',
	'Reincarnation',
	'System',
	'School Life',
	'Sports',
	'Mecha',
	'Supernatural',
	'Urban',
	'Magic',
	'Harem',
	'Tragedy',
];

// -- OPTIONAL PROPS -- //

export let description = '';
export let author = '';
export let artist = '';
export let tags: string[] = [];
export let status = 'unknown';
</script>

<div class="flex flex-col gap-3">
	<!-- AUTHOR + ARTIST ROW -->
	<div class="grid grid-cols-2 gap-3">
		<div>
			<span class="mb-1 block text-xs font-semibold opacity-60">Author</span>
			<input
				type="text"
				bind:value={author}
				placeholder="e.g. Er Gen"
				class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.06]"
			/>
		</div>
		<div>
			<span class="mb-1 block text-xs font-semibold opacity-60">Artist</span>
			<input
				type="text"
				bind:value={artist}
				placeholder="e.g. Manga Artist"
				class="h-[38px] w-full rounded-lg border border-black/10 bg-transparent px-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.06]"
			/>
		</div>
	</div>

	<!-- DESCRIPTION -->
	<div>
		<span class="mb-1 block text-xs font-semibold opacity-60">Description</span>
		<textarea
			bind:value={description}
			rows={3}
			placeholder="Series synopsis shown to readers on the book page"
			class="w-full rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-[#b23a2e] focus:ring-2 focus:ring-[#b23a2e]/30 dark:border-white/[0.06]"
		></textarea>
	</div>

	<!-- GENRES / TAGS -->
	<TagInput bind:value={tags} label="Genres / Tags" suggestions={GENRE_SUGGESTIONS} max={24} />

	<!-- SERIALIZATION STATUS -->
	<SelectField
		label="Serialization Status"
		bind:value={status}
		items={BOOK_STATUS_OPTIONS}
		placeholder="Select status…"
	/>
</div>
