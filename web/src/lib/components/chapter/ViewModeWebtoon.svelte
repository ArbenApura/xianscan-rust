<!-- WEBTOON VIEW MODE - CONTINUOUS VERTICAL STREAM WITH HARDWARE-ACCELERATED NATIVE VISIBILITY -->
<script lang="ts">
	// IMPORTED COMPONENTS
	import PageImage from '$lib/components/chapter/PageImage.svelte';
	import VirtualPageList from '$lib/components/chapter/VirtualPageList.svelte';

	// -- REQUIRED PROPS -- //
	export let pages: any[] = [];

	// -- OPTIONAL PROPS -- //
	export let webtoonKind: 'output' | 'original' = 'output';
	export let webtoonWidth: 'sm' | 'md' | 'lg' = 'md';

	// -- CONSTANTS -- //
	const widthClasses = {
		sm: 'max-w-lg',
		md: 'max-w-2xl',
		lg: 'max-w-4xl',
	};
</script>

<div class="-mx-4 flex w-[calc(100%+2rem)] flex-col items-center sm:mx-0 sm:w-full">
	<div
		class={`w-full ${widthClasses[webtoonWidth]} flex flex-col items-center bg-black shadow-2xl transition-all duration-300`}
	>
		{#each pages as page (page.id)}
			{@const hasRatio = Boolean(page.width && page.height && page.height > 0)}
			<div
				class="relative m-0 w-full border-0 bg-black p-0 leading-none"
				data-page-seq={page.seq}
				data-page-id={page.id}
				style={hasRatio ? `aspect-ratio: ${page.width} / ${page.height};` : 'min-height: 400px;'}
			>
				<PageImage
					src={`/api/pages/${page.id}/file?kind=${webtoonKind === 'output' && page.outputPath ? 'output' : 'original'}&rev=${webtoonKind === 'output' && page.outputPath ? (page.outputRev ?? 0) : (page.originalRev ?? 0)}`}
					alt={`Page ${page.seq + 1}`}
					imgClass="pointer-events-none object-contain w-full h-full"
				/>
			</div>
		{/each}
	</div>
</div>


