<script lang="ts">
	export let pages: any[] = [];
	export let webtoonKind: 'output' | 'original' = 'output';
	export let webtoonWidth: 'sm' | 'md' | 'lg' = 'md';

	const widthClasses = {
		sm: 'max-w-lg',
		md: 'max-w-2xl',
		lg: 'max-w-4xl',
	};
</script>

<div class="flex flex-col items-center w-[calc(100%+2rem)] -mx-4 sm:w-full sm:mx-0">
	<div class={`w-full ${widthClasses[webtoonWidth]} flex flex-col items-center bg-black transition-all duration-300 shadow-2xl`}>
		{#each pages as page (page.id)}
			{@const hasRatio = Boolean(page.width && page.height)}
			<div
				class="relative w-full border-0 p-0 m-0 leading-none bg-black"
				data-page-seq={page.seq}
				data-page-id={page.id}
				style={hasRatio ? `aspect-ratio: ${page.width} / ${page.height};` : ''}
			>
				<div
					class="w-full h-full bg-black/40 overflow-hidden"
					style={hasRatio ? `aspect-ratio: ${page.width} / ${page.height};` : ''}
				>
					<img
						src={`/api/pages/${page.id}/file?kind=${webtoonKind === 'output' && page.outputPath ? 'output' : 'original'}&rev=${webtoonKind === 'output' && page.outputPath ? page.outputRev ?? 0 : page.originalRev ?? 0}`}
						alt={`Page ${page.seq + 1}`}
						width={page.width || undefined}
						height={page.height || undefined}
						draggable="false"
						class="w-full block h-auto object-contain leading-none border-0 p-0 m-0 select-none pointer-events-none"
						loading="lazy"
						decoding="async"
						style={hasRatio ? `aspect-ratio: ${page.width} / ${page.height};` : ''}
					/>
				</div>
			</div>
		{/each}
	</div>
</div>
