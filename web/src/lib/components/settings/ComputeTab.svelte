<!-- HARDWARE & COMPUTE TAB (FEAT-009 PHASE 6: MOVED OUT OF SettingsModal.svelte) -->
<script lang="ts">
	// IMPORTED DEP-MODULES
	import { onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	// IMPORTED TYPES
	import type { HardwareInfo } from '$lib/components/settings/settings-helpers';
	// IMPORTED MODULES
	import { ripple } from '$lib/actions/ripple';
	import {
		settings,
		EXECUTION_DEVICES,
		CUDA_VRAM_LIMIT_PRESETS,
		type ExecutionDevice,
	} from '$lib/stores/settings';
	import { mlStatus } from '$lib/stores/ml-status';
	import { formatDeviceLabel } from '$lib/components/settings/settings-helpers';
	import { computeWork, computeToastIds, settingsHardwareInfo, type ComputeWork } from '$lib/stores/settings-ui';
	// IMPORTED DEP-COMPONENTS
	import Check from 'lucide-svelte/icons/check';
	import Cpu from 'lucide-svelte/icons/cpu';
	import ZapOff from 'lucide-svelte/icons/zap-off';
	import Activity from 'lucide-svelte/icons/activity';
	import Scissors from 'lucide-svelte/icons/scissors';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Sliders from 'lucide-svelte/icons/sliders';
	import Server from 'lucide-svelte/icons/server';
	// IMPORTED COMPONENTS
	import Switch from '$lib/components/ui/Switch.svelte';

	// -- OPTIONAL PROPS -- //

	// FOLLOWS THE MODAL'S open (THE TAB ONLY MOUNTS WHILE IT IS THE ACTIVE ONE)
	export let active = true;
	// OWNED BY THE SHELL (THE ABOUT TAB READS IT TOO); THIS TAB PUBLISHES FRESHER ANSWERS THROUGH applyHardwareInfo
	export let hardwareInfo: HardwareInfo | null = null;
	export let highlightedSettingId: string | null = null;

	// -- TYPES -- //

	interface SystemTelemetry {
		gpu?: {
			name: string;
			vram_used_mb: number;
			vram_total_mb: number;
			utilization_pct?: number | null;
			active_provider: string;
		} | null;
		host_memory: {
			used_mb: number;
			total_mb: number;
		};
		cpu: {
			cores: number;
			utilization_pct?: number | null;
		};
		queue: {
			active_jobs: number;
			queued_jobs: number;
		};
		timestamp_ms: number;
	}

	// -- STATES -- //

	// switchingDevice / settingVramLimit AND THEIR LOADING TOASTS LIVE IN settings-ui: THE RELOAD POLL OUTLIVES THIS TAB, SO
	// COMING BACK MID SWITCH STILL SHOWS IT AS BUSY AND CANNOT FIRE A SECOND SWITCH

	// LIVE TELEMETRY STATE
	let telemetry: SystemTelemetry | null = null;
	// SELF-SCHEDULING POLL: AT MOST ONE REQUEST IN FLIGHT, A 2 S GAP AFTER EACH ANSWER, ONLY ON THE COMPUTE TAB AND
	// ONLY WHILE THE PAGE IS VISIBLE (FEAT-009 PHASE 5)
	let telemetryTimer: ReturnType<typeof setTimeout> | null = null;
	let telemetryInFlight = false;
	let telemetryPolling = false;
	let destroyed = false;

	// THE POLL IS SCOPED TO THIS TAB (FEAT-009 PHASE 6): THE TAB MOUNTS ONLY WHILE IT IS SHOWN, active FOLLOWS THE MODAL'S
	// open, AND onDestroy STOPS IT. IT STARTS FROM A REACTIVE STATEMENT, NOT onMount, SO IT ALSO RUNS UNDER THE VITEST
	// HARNESS (WHERE onMount IS A NO-OP); destroyed STOPS AN ANSWER THAT LANDS AFTER UNMOUNT FROM RESCHEDULING.
	$: shouldPollTelemetry = active;

	function keepPolling(): boolean {
		return shouldPollTelemetry && !destroyed;
	}

	$: if (shouldPollTelemetry && !telemetryPolling) {
		telemetryPolling = true;
		void pollTelemetry();
	} else if (!shouldPollTelemetry && telemetryPolling) {
		stopTelemetry();
	}

	// -- FUNCTIONS -- //

	function setWork(patch: Partial<ComputeWork>): void {
		computeWork.update((w) => ({ ...w, ...patch }));
	}

	// ALSO WRITES THE SHARED STORE, WHICH STILL REACHES THE SHELL WHEN A POLL ANSWERS AFTER THIS TAB UNMOUNTED
	function applyHardwareInfo(info: HardwareInfo): HardwareInfo {
		hardwareInfo = info;
		settingsHardwareInfo.set(info);
		return info;
	}

	async function pollTelemetry(): Promise<void> {
		telemetryTimer = null;
		if (!keepPolling()) {
			telemetryPolling = false;
			return;
		}
		if (telemetryInFlight) return;
		if (typeof document === 'undefined' || document.visibilityState !== 'hidden') {
			telemetryInFlight = true;
			try {
				await loadTelemetry();
			} finally {
				telemetryInFlight = false;
			}
		}
		if (keepPolling()) {
			telemetryTimer = setTimeout(pollTelemetry, 2000);
		} else {
			telemetryPolling = false;
		}
	}

	function stopTelemetry(): void {
		if (telemetryTimer) clearTimeout(telemetryTimer);
		telemetryTimer = null;
		telemetryPolling = false;
	}

	async function loadTelemetry() {
		try {
			const res = await fetch('/api/system/telemetry');
			if (res.ok) {
				telemetry = (await res.json()) as SystemTelemetry;
			}
		} catch {
			// SILENT FALLBACK
		}
	}

	async function setCudaVramLimit(limitMb: number | null) {
		if ($computeWork.settingVramLimit || $computeWork.switchingDevice || mlOffline) return;
		setWork({ settingVramLimit: true });
		const label = limitMb ? `${(limitMb / 1024).toFixed(1).replace(/\.0$/, '')} GB` : 'Auto (Adaptive)';
		if (computeToastIds.vram) {
			toast.dismiss(computeToastIds.vram);
		}
		computeToastIds.vram = toast.loading(`Updating GPU VRAM allocation to ${label}...`);
		try {
			const res = await fetch('/api/system/hardware', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					device: $settings.executionDevice || 'auto',
					vram_limit_mb: limitMb === null ? 0 : limitMb,
				}),
			});
			if (res.ok) {
				const info = applyHardwareInfo((await res.json()) as HardwareInfo);
				settings.update((s) => ({ ...s, cudaVramLimitMb: limitMb }));
				if (info.reloading) {
					if (computeToastIds.vram) {
						toast.dismiss(computeToastIds.vram);
					}
					computeToastIds.vram = toast.loading(`Reallocating GPU VRAM memory pools (${label})...`);
					void waitForVramReloadDone(label);
				} else {
					if (computeToastIds.vram) {
						toast.dismiss(computeToastIds.vram);
						computeToastIds.vram = null;
					}
					toast.success(`GPU VRAM allocation set to ${label}`);
					setWork({ settingVramLimit: false });
					void mlStatus.checkHealth();
				}
			} else {
				if (computeToastIds.vram) {
					toast.dismiss(computeToastIds.vram);
					computeToastIds.vram = null;
				}
				toast.error('Failed to update GPU VRAM allocation limit');
				setWork({ settingVramLimit: false });
			}
		} catch (e: any) {
			if (computeToastIds.vram) {
				toast.dismiss(computeToastIds.vram);
				computeToastIds.vram = null;
			}
			toast.error(e.message || 'Failed to update GPU VRAM allocation');
			setWork({ settingVramLimit: false });
		}
	}

	async function waitForVramReloadDone(label: string) {
		const maxWaitMs = 60000;
		const startedAt = Date.now();
		while (Date.now() - startedAt < maxWaitMs) {
			await new Promise((r) => setTimeout(r, 300));
			try {
				const res = await fetch('/api/system/hardware');
				if (res.ok) {
					const info = (await res.json()) as HardwareInfo;
					applyHardwareInfo(info);
					if (!info.reloading) break;
				}
			} catch {
				break;
			}
		}
		setWork({ settingVramLimit: false });
		if (computeToastIds.vram) {
			toast.dismiss(computeToastIds.vram);
			computeToastIds.vram = null;
		}
		toast.success(`GPU VRAM allocation set to ${label}`);
		void mlStatus.checkHealth();
	}

	$: mlOffline = !$mlStatus.loading && !$mlStatus.online;
	$: switchingDevice = $computeWork.switchingDevice;
	$: settingVramLimit = $computeWork.settingVramLimit;

	$: gpuVramPct = telemetry?.gpu && telemetry.gpu.vram_total_mb > 0
		? Math.min(100, Math.max(0, (telemetry.gpu.vram_used_mb / telemetry.gpu.vram_total_mb) * 100))
		: 0;

	$: hostRamPct = telemetry?.host_memory && telemetry.host_memory.total_mb > 0
		? Math.min(100, Math.max(0, (telemetry.host_memory.used_mb / telemetry.host_memory.total_mb) * 100))
		: 0;

	function setParallelProcesses(n: number) {
		settings.update((s) => ({ ...s, parallelProcesses: n }));
		toast.success(`Parallel page workers set to ${n}`);
	}

	function setParallelChapters(n: number) {
		settings.update((s) => ({ ...s, parallelChapters: n }));
		toast.success(`Parallel batch chapters set to ${n}`);
	}

	function toggleResliceBeforeBatch() {
		settings.update((s) => {
			const next = !s.resliceBeforeBatch;
			toast.success(`Pre-translation smart reslicing ${next ? 'enabled' : 'disabled'}`);
			return { ...s, resliceBeforeBatch: next };
		});
	}

	// HARDWARE ACCELERATION METHODS
	function isDeviceAvailable(devId: ExecutionDevice): boolean {
		if (devId === 'auto' || devId === 'cpu') return true;
		if (!hardwareInfo) return false;
		if (devId === 'cuda') return hardwareInfo.has_cuda;
		if (devId === 'coreml') return hardwareInfo.has_coreml;
		if (devId === 'dml') return hardwareInfo.has_directml_raw ?? hardwareInfo.has_directml;
		return true;
	}

	function getDeviceAvailabilityReason(devId: ExecutionDevice): string | null {
		if (!hardwareInfo) return 'Detecting available hardware...';
		if (devId === 'cuda' && !hardwareInfo.has_cuda) return 'Dedicated NVIDIA CUDA GPU not detected';
		if (devId === 'coreml' && !hardwareInfo.has_coreml) return 'Apple Silicon GPU (CoreML) not detected';
		if (devId === 'dml' && !(hardwareInfo.has_directml_raw ?? hardwareInfo.has_directml)) {
			if (hardwareInfo.detected_gpus && hardwareInfo.detected_gpus.some((g) => g.is_integrated)) {
				const igpuName = hardwareInfo.detected_gpus.find((g) => g.is_integrated)?.name || 'Integrated GPU';
				return `Only ${igpuName} detected. DirectML disabled to protect system against freezing and driver TDR crashes.`;
			}
			return 'Dedicated GPU for DirectML not detected';
		}
		return null;
	}

	async function setExecutionDevice(dev: ExecutionDevice) {
		if (mlOffline) {
			toast.error('ML sidecar is offline: cannot switch compute hardware.');
			return;
		}

		if (!isDeviceAvailable(dev)) {
			const reason = getDeviceAvailabilityReason(dev);
			toast.error(`Cannot select ${dev.toUpperCase()}: ${reason || 'Hardware not supported'}`);
			return;
		}

		if ($computeWork.switchingDevice) return;

		const found = EXECUTION_DEVICES.find((d) => d.id === dev);
		const targetLabel = found?.label || dev;
		setWork({ switchingDevice: dev });
		if (computeToastIds.switching) {
			toast.dismiss(computeToastIds.switching);
		}
		computeToastIds.switching = toast.loading(`Initializing compute accelerator: ${targetLabel}...`);

		try {
			const res = await fetch('/api/system/hardware', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ device: dev }),
			});
			if (res.ok) {
				const info = applyHardwareInfo((await res.json()) as HardwareInfo);
				const expectedEp =
					dev === 'dml'
						? 'DmlExecutionProvider'
						: dev === 'cuda'
							? 'CUDAExecutionProvider'
							: dev === 'coreml'
								? 'CoreMLExecutionProvider'
								: null;
				const active = info.providers?.[0] ?? info.active_provider;
				const resolvedLabel = formatDeviceLabel(info.device_label) || targetLabel;
				if (expectedEp && active && active !== expectedEp) {
					settings.update((s) => ({ ...s, executionDevice: 'auto' }));
					if (computeToastIds.switching) {
						toast.dismiss(computeToastIds.switching);
						computeToastIds.switching = null;
					}
					toast.error(`${targetLabel} is not available. Running on ${resolvedLabel}.`);
					setWork({ switchingDevice: null });
				} else {
					settings.update((s) => ({ ...s, executionDevice: dev }));
					if (info.reloading) {
						if (computeToastIds.switching) {
							toast.dismiss(computeToastIds.switching);
						}
						computeToastIds.switching = toast.loading(`Reloading neural models on ${resolvedLabel}...`);
						void waitForReloadDone(dev, resolvedLabel);
					} else {
						if (computeToastIds.switching) {
							toast.dismiss(computeToastIds.switching);
							computeToastIds.switching = null;
						}
						toast.success(`Compute accelerator active: ${resolvedLabel}`);
						setWork({ switchingDevice: null });
						void mlStatus.checkHealth();
					}
				}
			} else {
				if (computeToastIds.switching) {
					toast.dismiss(computeToastIds.switching);
					computeToastIds.switching = null;
				}
				toast.error(`Failed to switch compute hardware to ${targetLabel}`);
				setWork({ switchingDevice: null });
			}
		} catch {
			if (computeToastIds.switching) {
				toast.dismiss(computeToastIds.switching);
				computeToastIds.switching = null;
			}
			toast.error(`Failed to switch compute hardware to ${targetLabel}`);
			setWork({ switchingDevice: null });
			void mlStatus.checkHealth();
		}
	}

	async function waitForReloadDone(dev: ExecutionDevice, resolvedLabel?: string) {
		const maxWaitMs = 60000;
		const startedAt = Date.now();
		while (Date.now() - startedAt < maxWaitMs) {
			await new Promise((r) => setTimeout(r, 300));
			try {
				const res = await fetch('/api/system/hardware');
				if (res.ok) {
					const info = (await res.json()) as HardwareInfo;
					applyHardwareInfo(info);
					if (!info.reloading) break;
				}
			} catch {
				break;
			}
		}
		setWork({ switchingDevice: null });
		if (computeToastIds.switching) {
			toast.dismiss(computeToastIds.switching);
			computeToastIds.switching = null;
		}
		if (resolvedLabel) {
			toast.success(`Compute accelerator ready: ${resolvedLabel}`);
		}
		void mlStatus.checkHealth();
	}

	// -- LIFECYCLES -- //

	// THE LOADING TOASTS OF A SWITCH OR VRAM CHANGE STAY UP: THEIR POLL KEEPS RUNNING AND DISMISSES THEM WHEN IT ENDS
	onDestroy(() => {
		destroyed = true;
		stopTelemetry();
	});
</script>

<div class="space-y-5">
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
		<div>
			<h2 class="text-base font-bold">Hardware & Compute Accelerator</h2>
			<p class="text-xs opacity-60 mt-0.5">ONNX Runtime execution engines, GPU allocation, and batch processing concurrency</p>
		</div>

		<!-- ACCELERATOR STATUS BADGE -->
		<div class="self-start sm:self-auto shrink-0">
			{#if switchingDevice || hardwareInfo?.reloading}
				<div class="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 shadow-2xs backdrop-blur-xs">
					<Loader2 size={12} class="animate-spin text-amber-500 shrink-0" />
					<span>Reloading models…</span>
				</div>
			{:else if mlOffline}
				<div class="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[11px] font-semibold text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300 shadow-2xs backdrop-blur-xs">
					<ZapOff size={12} class="text-red-500 shrink-0" />
					<span>ML Core Offline</span>
				</div>
			{:else if hardwareInfo}
				<div
					class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300 shadow-2xs backdrop-blur-xs"
					title={hardwareInfo.detected_gpus?.[0]?.name ? `Detected: ${hardwareInfo.detected_gpus[0].name}` : `Active Engine: ${hardwareInfo.device_label}`}
				>
					<Cpu size={12} class="text-emerald-600 dark:text-emerald-400 shrink-0" />
					<span class="font-mono text-[10px] uppercase font-bold tracking-wider opacity-60">Active:</span>
					<span class="font-medium">{formatDeviceLabel(hardwareInfo.device_label)}</span>
				</div>
			{:else}
				<div class="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] px-3 py-1 text-[11px] font-medium opacity-60 dark:border-white/10 dark:bg-white/[0.03]">
					<Activity size={12} class="text-neutral-400 shrink-0" />
					<span>Detecting hardware…</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- DEVICE CARDS -->
	<div
		id="setting-compute-device"
		class={`space-y-2.5 transition-all duration-300 ${highlightedSettingId === 'compute-device' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-2xl p-2.5 -m-1' : ''}`}
	>
		<!-- AUTO DETECT FEATURED CARD -->
		{#if EXECUTION_DEVICES[0]}
			{@const autoDev = EXECUTION_DEVICES[0]}
			<button
				type="button"
				disabled={!!switchingDevice || !!hardwareInfo?.reloading || mlOffline || !isDeviceAvailable(autoDev.id)}
				on:click={() => setExecutionDevice(autoDev.id)}
				class={`w-full flex items-center justify-between rounded-xl border p-3 text-left transition-all ${
					mlOffline || !isDeviceAvailable(autoDev.id)
						? 'opacity-40 border-black/5 bg-black/[0.01] dark:border-white/5 cursor-not-allowed'
						: switchingDevice || hardwareInfo?.reloading
							? $settings.executionDevice === autoDev.id
								? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs cursor-wait opacity-85'
								: 'border-black/10 opacity-50 cursor-not-allowed dark:border-white/10'
							: $settings.executionDevice === autoDev.id
								? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
								: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
				}`}
				use:ripple
			>
				<div>
					<div class="flex items-center gap-2 font-bold text-xs">
						{#if switchingDevice === autoDev.id}
							<Loader2 size={13} class="animate-spin text-[#b23a2e]" />
						{:else}
							<Cpu size={13} class={isDeviceAvailable(autoDev.id) ? 'opacity-80' : 'opacity-40'} />
						{/if}
						<span>{autoDev.label}</span>
						<span class="rounded-full bg-[#b23a2e]/10 dark:bg-[#e08a63]/15 px-2 py-0.5 text-[9.5px] font-semibold text-[#b23a2e] dark:text-[#e08a63] uppercase tracking-wider">Recommended</span>
					</div>
					<p class="mt-1 text-[10.5px] opacity-70 leading-relaxed">{autoDev.blurb}</p>
				</div>
				<div class="shrink-0 ml-3">
					{#if $settings.executionDevice === autoDev.id && switchingDevice !== autoDev.id}
						<Check size={15} class="text-[#b23a2e] dark:text-[#e08a63]" />
					{/if}
				</div>
			</button>
		{/if}

		<!-- MANUAL EXPLICIT BACKENDS (2x2 GRID) -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
			{#each EXECUTION_DEVICES.slice(1) as dev (dev.id)}
				<button
					type="button"
					id={dev.id === 'dml' ? 'setting-igpu-protect' : undefined}
					disabled={!!switchingDevice || !!hardwareInfo?.reloading || mlOffline || !isDeviceAvailable(dev.id)}
					on:click={() => setExecutionDevice(dev.id)}
					class={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all ${
						highlightedSettingId === 'igpu-protect' && dev.id === 'dml'
							? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]'
							: ''
					} ${
						mlOffline || !isDeviceAvailable(dev.id)
							? 'opacity-40 border-black/5 bg-black/[0.01] dark:border-white/5 cursor-not-allowed'
							: switchingDevice || hardwareInfo?.reloading
								? $settings.executionDevice === dev.id
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs cursor-wait opacity-85'
									: 'border-black/10 opacity-50 cursor-not-allowed dark:border-white/10'
								: $settings.executionDevice === dev.id
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-2 ring-[#b23a2e]/30 shadow-xs'
									: 'border-black/10 hover:border-black/20 hover:bg-black/[0.02] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.02]'
					}`}
					use:ripple
				>
					<div>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-1.5 font-bold text-xs">
								{#if switchingDevice === dev.id}
									<Loader2 size={13} class="animate-spin text-[#b23a2e]" />
								{:else}
									<Cpu size={13} class={isDeviceAvailable(dev.id) ? 'opacity-80' : 'opacity-40'} />
								{/if}
								<span>{dev.label}</span>
							</div>
							{#if $settings.executionDevice === dev.id && switchingDevice !== dev.id}
								<Check size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
							{/if}
						</div>
						<p class="mt-1 text-[10px] opacity-70 leading-relaxed">{dev.blurb}</p>
					</div>
					{#if !isDeviceAvailable(dev.id) && getDeviceAvailabilityReason(dev.id)}
						<div class="mt-1.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
							{getDeviceAvailabilityReason(dev.id)}
						</div>
					{/if}
				</button>
			{/each}
		</div>
	</div>

	<!-- GPU VRAM MEMORY ALLOCATOR -->
	{#if hardwareInfo?.has_cuda || $settings.executionDevice === 'cuda' || hardwareInfo?.detected_gpus?.some((g) => g.is_dedicated)}
		<div
			id="setting-vram-limit"
			class={`space-y-2 rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'vram-limit' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
		>
			<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
				<div class="flex items-center gap-1.5 font-bold text-xs">
					<Sliders size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span>GPU VRAM Allocation Limit</span>
				</div>
				<div class="font-mono text-[10.5px] opacity-70">
					Active Limit: <span class="font-bold text-[#b23a2e] dark:text-[#e08a63]">{hardwareInfo?.cuda_vram_limit_mb ? `${(hardwareInfo.cuda_vram_limit_mb / 1024).toFixed(1).replace(/\.0$/, '')} GB` : 'Auto'}</span>
					{#if hardwareInfo?.configured_cuda_vram_limit_mb}
						<span class="opacity-60">(Manual override)</span>
					{:else}
						<span class="opacity-60">(Hardware adaptive)</span>
					{/if}
				</div>
			</div>
			<p class="text-[10.5px] opacity-60 leading-relaxed">
				Sets the maximum memory capacity allocated per ONNX CUDA session to prevent out-of-memory errors on large transformer layers.
			</p>
			<div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5 pt-1">
				{#each CUDA_VRAM_LIMIT_PRESETS as preset}
					{@const isSelected = $settings.cudaVramLimitMb === preset.value || ($settings.cudaVramLimitMb === null && preset.value === null)}
					{@const maxGpuVramMb = hardwareInfo?.detected_gpus?.[0]?.vram_mb ?? 0}
					{@const exceedsPhysicalVram = preset.value !== null && maxGpuVramMb > 0 && preset.value > maxGpuVramMb}
					{@const isBusy = settingVramLimit || !!switchingDevice || !!hardwareInfo?.reloading || mlOffline || exceedsPhysicalVram}
					<button
						type="button"
						disabled={isBusy}
						on:click={() => setCudaVramLimit(preset.value)}
						class={`flex flex-col items-center justify-center rounded-lg border py-2 px-1 text-center transition-all ${
							exceedsPhysicalVram
								? 'border-black/5 bg-black/[0.01] dark:border-white/5 opacity-30 cursor-not-allowed'
								: isBusy
									? isSelected
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-1 ring-[#b23a2e]/30 font-bold opacity-85 cursor-wait'
										: 'border-black/10 opacity-40 cursor-not-allowed dark:border-white/10'
									: isSelected
										? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-1 ring-[#b23a2e]/30 font-bold cursor-pointer'
										: 'border-black/10 hover:border-black/20 dark:border-white/10 opacity-75 cursor-pointer'
						}`}
						title={exceedsPhysicalVram ? `Exceeds detected GPU VRAM (${(maxGpuVramMb / 1024).toFixed(1)} GB)` : ''}
						use:ripple
					>
						<span class="text-xs font-mono">{preset.label}</span>
						<span class="text-[9px] opacity-60 mt-0.5">{exceedsPhysicalVram ? 'Exceeds GPU' : preset.sub}</span>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- LIVE SYSTEM TELEMETRY -->
	<div
		id="setting-telemetry-monitor"
		class={`space-y-3 rounded-xl border border-black/10 bg-black/[0.02] p-3.5 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'telemetry-monitor' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
	>
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-1.5 font-bold text-xs">
				<Activity size={13} class="text-[#b23a2e] dark:text-[#e08a63]" />
				<span>Live System Telemetry</span>
			</div>
			<div class="flex items-center gap-2 text-[10px] font-mono opacity-60">
				<span>Auto-refresh: 2.0s</span>
			</div>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-0.5">
			<!-- GPU VRAM GAUGE -->
			<div class="rounded-lg border border-black/5 bg-white/40 p-2.5 dark:border-white/5 dark:bg-black/20 space-y-1.5">
				<div class="flex items-center justify-between text-[11px]">
					<span class="font-semibold opacity-80 flex items-center gap-1">
						<Cpu size={12} class="opacity-60" />
						<span>GPU VRAM</span>
					</span>
					<span class="font-mono text-[10px] font-bold">
						{#if telemetry?.gpu}
							{telemetry.gpu.vram_used_mb.toFixed(0)} MB / {telemetry.gpu.vram_total_mb.toFixed(0)} MB
							{#if telemetry.gpu.vram_total_mb > 0}
								<span class="opacity-60">({((telemetry.gpu.vram_used_mb / telemetry.gpu.vram_total_mb) * 100).toFixed(0)}%)</span>
							{/if}
						{:else}
							<span class="opacity-50 font-normal">No dedicated GPU</span>
						{/if}
					</span>
				</div>
				<div class="h-1.5 w-full rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
					<!-- DYNAMIC RUNTIME GAUGE WIDTH -->
					<div
						class={`h-full rounded-full transition-all duration-500 ${gpuVramPct > 85 ? 'bg-amber-500' : 'bg-[#b23a2e] dark:bg-[#e08a63]'}`}
						style={`width: ${gpuVramPct}%;`}
					></div>
				</div>
				<div class="flex items-center justify-between text-[9.5px] font-mono opacity-50 truncate">
					<span>{telemetry?.gpu?.name || 'CPU Multi-threaded'}</span>
					{#if telemetry?.gpu?.utilization_pct !== null && telemetry?.gpu?.utilization_pct !== undefined}
						<span>Load: {telemetry.gpu.utilization_pct.toFixed(0)}%</span>
					{/if}
				</div>
			</div>

			<!-- HOST RAM GAUGE -->
			<div class="rounded-lg border border-black/5 bg-white/40 p-2.5 dark:border-white/5 dark:bg-black/20 space-y-1.5">
				<div class="flex items-center justify-between text-[11px]">
					<span class="font-semibold opacity-80 flex items-center gap-1">
						<Server size={12} class="opacity-60" />
						<span>Host System RAM</span>
					</span>
					<span class="font-mono text-[10px] font-bold">
						{#if telemetry?.host_memory && telemetry.host_memory.total_mb > 0}
							{telemetry.host_memory.used_mb.toFixed(0)} MB / {telemetry.host_memory.total_mb.toFixed(0)} MB
							<span class="opacity-60">({((telemetry.host_memory.used_mb / telemetry.host_memory.total_mb) * 100).toFixed(0)}%)</span>
						{:else}
							<span class="opacity-50 font-normal">Reading…</span>
						{/if}
					</span>
				</div>
				<div class="h-1.5 w-full rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
					<!-- DYNAMIC RUNTIME GAUGE WIDTH -->
					<div
						class={`h-full rounded-full transition-all duration-500 ${hostRamPct > 90 ? 'bg-red-500' : hostRamPct > 75 ? 'bg-amber-500' : 'bg-[#4f7a64] dark:bg-[#83b39a]'}`}
						style={`width: ${hostRamPct}%;`}
					></div>
				</div>
				<div class="flex items-center justify-between text-[9.5px] font-mono opacity-50">
					<span>CPU Threads: {telemetry?.cpu?.cores || 1}</span>
					<span>Active Process</span>
				</div>
			</div>
		</div>
	</div>

	<!-- PRE-RESLICING & PARALLEL WORKERS -->
	<div class="border-t border-black/10 pt-4 dark:border-white/10 space-y-4">
		<div
			id="setting-auto-reslice"
			class={`flex items-start justify-between gap-4 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.02] transition-all duration-300 ${highlightedSettingId === 'auto-reslice' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08]' : ''}`}
		>
			<div>
				<div class="text-xs font-bold flex items-center gap-1.5">
					<Scissors size={14} class="text-[#b23a2e] dark:text-[#e08a63]" />
					<span>Auto-Reslice Before Batch Translation</span>
				</div>
				<p class="text-[11px] opacity-60 mt-0.5">Recombine and cut vertical webtoon chapters along whitespace gutters before OCR to protect speech bubbles. Chapters over 400 pages or 200 MP are translated without reslicing.</p>
			</div>
			<Switch
				checked={$settings.resliceBeforeBatch}
				on:click={toggleResliceBeforeBatch}
				ariaLabel="Auto-Reslice Before Batch Translation"
			/>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div
				id="setting-parallel-workers"
				class={`space-y-1.5 transition-all duration-300 ${highlightedSettingId === 'parallel-workers' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2' : ''}`}
			>
				<div class="text-xs font-bold uppercase tracking-wider opacity-80">Parallel Page Workers</div>
				<div class="grid grid-cols-4 gap-1.5">
					{#each [1, 2, 3, 4] as count}
						<button
							type="button"
							on:click={() => setParallelProcesses(count)}
							class={`rounded-lg border py-2 text-center text-xs font-bold transition-all ${
								($settings.parallelProcesses || 1) === count
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-1 ring-[#b23a2e]/30'
									: 'border-black/10 hover:border-black/20 dark:border-white/10'
							}`}
							use:ripple
						>
							{count}
						</button>
					{/each}
				</div>
			</div>

			<div
				id="setting-parallel-chapters"
				class={`space-y-1.5 transition-all duration-300 ${highlightedSettingId === 'parallel-chapters' ? 'ring-2 ring-[#b23a2e] dark:ring-[#e08a63] bg-[#b23a2e]/[0.06] dark:bg-[#e08a63]/[0.08] rounded-xl p-2' : ''}`}
			>
				<div class="text-xs font-bold uppercase tracking-wider opacity-80">Parallel Batch Chapters</div>
				<div class="grid grid-cols-4 gap-1.5">
					{#each [1, 2, 3, 4] as count}
						<button
							type="button"
							on:click={() => setParallelChapters(count)}
							class={`rounded-lg border py-2 text-center text-xs font-bold transition-all ${
								($settings.parallelChapters || 2) === count
									? 'border-[#b23a2e] bg-[#b23a2e]/[0.08] text-[#b23a2e] dark:text-[#e08a63] ring-1 ring-[#b23a2e]/30'
									: 'border-black/10 hover:border-black/20 dark:border-white/10'
							}`}
							use:ripple
						>
							{count}
						</button>
					{/each}
				</div>
			</div>
		</div>

		<!-- NOTICE: CONCURRENCY HARDWARE STRAIN WARNING -->
		<div class="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 text-[10.5px] leading-relaxed text-amber-800 dark:text-amber-300">
			<AlertTriangle size={14} class="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
			<span>
				<strong>Warning:</strong> Setting parallel page workers or batch chapters too high may put heavy strain on your processor and system memory, potentially causing crashes or out-of-memory errors. Only configure concurrency levels that your CPU, GPU, and RAM can handle efficiently.
			</span>
		</div>
	</div>
</div>
