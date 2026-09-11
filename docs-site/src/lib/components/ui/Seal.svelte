<script lang="ts">
	import { cn } from '$lib/utils/cn';

	export let char = '仙';
	export let size = 28;
	let className = '';
	export { className as class };

	// CANONICAL NORMAL WEIGHT VECTOR OUTLINE FOR BRAND MARK
	const XIAN_PATH =
		'M22.16 42.72Q22.16 46 22.32 49.28L19.7 50.27Q19.86 47.15 19.86 43.21V25.49Q16.41 30.74 13.13 34.02L12.64 33.7Q16.41 28.45 19.29 22.05Q22.16 15.65 22.98 11.55L26.59 13.52Q25.27 14.34 23.96 17.12Q22.65 19.91 21.01 23.2L23.14 24.34L22.16 25.33ZM47.91 40.09Q47.91 43.05 48.08 46.49L45.62 48.13V45.18H29.87L28.55 46.66L26.42 44.36L27.41 43.54V28.45Q27.41 26.97 27.24 21.88L31.02 23.69L29.7 24.84V44.2H36.43V18.44Q36.43 15.98 36.27 11.88L40.04 13.68L38.73 14.99V44.2H45.62V29.27Q45.62 26.64 45.45 22.21L49.06 24.02L47.91 25.16Z';
</script>

<!-- CINNABAR SEAL / CHOP (印章) - THE BRAND STAMP. DECORATIVE, NON-INTERACTIVE (NO RIPPLE). -->
<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 64 64"
	width={size}
	height={size}
	class={cn('inline-flex shrink-0 select-none shadow-sm', className)}
	role="img"
	aria-label={char}
>
	<!-- CINNABAR SEAL / CHOP (印章) -->
	<rect width="64" height="64" rx="10" fill="#b23a2e" />
	<!-- CARVED INNER FRAME -->
	<rect x="7" y="7" width="50" height="50" rx="6" fill="none" stroke="#f7efe0" stroke-opacity="0.35" stroke-width="2" />
	{#if char === '仙'}
		<!-- CANONICAL NORMAL WEIGHT VECTOR OUTLINE -->
		<path d={XIAN_PATH} fill="#f7efe0" />
	{:else}
		<text
			x="32"
			y="46"
			text-anchor="middle"
			font-family="'Songti SC','SimSun',serif"
			font-size="42"
			font-weight="400"
			fill="#f7efe0">{char}</text>
	{/if}
</svg>
