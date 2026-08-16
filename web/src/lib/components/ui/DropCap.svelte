<script lang="ts">
	// IMPORTED MODULES
	import { cn } from '$lib/utils/cn';

	// -- REQUIRED PROPS -- //

	// THE FIRST LETTER OF THE PARAGRAPH, RENDERED AS A VERSAL (THE PARAGRAPH TEXT MUST OMIT IT)
	export let letter: string;

	// -- OPTIONAL PROPS -- //

	let className = '';
	export { className as class };
</script>

<!-- DROP-CAP / VERSAL — FLOATS A LARGE CINNABAR SERIF INITIAL AT A CHAPTER OPENING. -->
<!-- NOT aria-hidden: IT CARRIES THE REAL FIRST LETTER, SO SCREEN READERS STILL READ THE FULL WORD. -->
<span
	class={cn(
		"float-left mr-2 mt-1.5 font-['Literata'] text-[3.25rem] font-bold leading-[0.78] text-[#b23a2e]",
		className,
	)}>{letter}</span
>
