// SHARED PLAIN-TS HELPERS AND TYPES FOR THE SETTINGS TABS (FEAT-009 PHASE 6). NO SVELTE, NO STORES: UNIT-TESTABLE.

// -- TYPES -- //

export interface HardwareInfo {
	device_label: string;
	active_provider: string;
	providers: string[];
	available_providers: string[];
	has_cuda: boolean;
	has_directml: boolean;
	has_directml_raw?: boolean;
	has_coreml: boolean;
	has_dedicated_gpu?: boolean;
	detected_gpus?: Array<{ device_id: number; name: string; vram_mb: number; is_dedicated: boolean; is_integrated: boolean }>;
	gpu_warning?: string | null;
	reloading?: boolean;
	cuda_vram_limit_mb?: number | null;
	configured_cuda_vram_limit_mb?: number | null;
	version?: string;
	app_version?: string;
	web_build_hash?: string;
	web_build_time?: string;
}

export interface ProviderInfo {
	id: string;
	name: string;
	baseUrl: string;
	activeModel: string;
	availableModels: string[];
	hasKey: boolean;
	maskedKey: string;
	enabled: boolean;
	isDefault: boolean;
}

// -- CONSTANTS -- //

export const DEFAULT_PROVIDER_BASE_URLS: Record<string, string> = {
	deepseek: 'https://api.deepseek.com',
	google: 'https://generativelanguage.googleapis.com/v1beta/openai/',
	groq: 'https://api.groq.com/openai/v1',
	openrouter: 'https://openrouter.ai/api/v1',
	openai: 'https://api.openai.com/v1',
	ollama: 'http://localhost:11434/v1',
	lmstudio: 'http://localhost:1234/v1',
	custom: 'http://localhost:8000/v1',
};

export const MODEL_DESCRIPTIONS: Record<string, { label: string; badge: string; desc: string }> = {
	'deepseek-chat': {
		label: 'DeepSeek Chat',
		badge: 'Standard · Fast',
		desc: 'General-purpose dialogue and narrative translation model with low latency.',
	},
	'deepseek-reasoner': {
		label: 'DeepSeek Reasoner',
		badge: 'Reasoning · High Accuracy',
		desc: 'Chain-of-thought reasoning model for complex translation context.',
	},
	'deepseek-v4-flash': {
		label: 'DeepSeek V4 Flash',
		badge: 'Recommended · High Speed',
		desc: 'Ultra-fast, cost-efficient translation model with prefix-cached glossary enforcement.',
	},
	'deepseek-v4-pro': {
		label: 'DeepSeek V4 Pro',
		badge: 'Flagship · High Accuracy',
		desc: 'Highest literary precision and context reasoning for complex cultivation idioms.',
	},
	'gemini-3.7-flash': {
		label: 'Gemini 3.7 Flash',
		badge: 'Recommended · Frontier Speed',
		desc: 'Google flagship workhorse: ultra-fast translation with advanced reasoning capabilities.',
	},
	'gemini-3.5-flash': {
		label: 'Gemini 3.5 Flash',
		badge: 'High Speed',
		desc: 'Next-gen multimodal translation engine for long webtoon sequences.',
	},
	'llama-3.3-70b-versatile': {
		label: 'Llama 3.3 70B',
		badge: 'Ultra-Fast · 500+ t/s',
		desc: 'Flagship Meta open-source model running at extreme LPU throughput on Groq.',
	},
	'qwen-2.5-32b': {
		label: 'Qwen 2.5 32B',
		badge: 'High Accuracy · Fast',
		desc: 'High multilingual precision and strong Asian language comic localization context.',
	},
	'deepseek-r1-distill-llama-70b': {
		label: 'DeepSeek R1 Distill 70B',
		badge: 'Distilled Intelligence',
		desc: 'Distilled DeepSeek model running on Groq LPUs with high translation fluency.',
	},
	'google/gemini-2.5-flash': {
		label: 'Gemini 2.5 Flash',
		badge: 'OpenRouter · Fast',
		desc: 'Cost-effective, high-speed multi-lingual translation through OpenRouter.',
	},
	'anthropic/claude-3.5-sonnet': {
		label: 'Claude 3.5 Sonnet',
		badge: 'Literary Flagship',
		desc: 'Unmatched prose quality, character dialogue nuance, and natural localization tone.',
	},
	'deepseek/deepseek-v4-flash': {
		label: 'DeepSeek V4 Flash',
		badge: 'Ultra-Fast',
		desc: 'DeepSeek V4 high-speed comic translation model via OpenRouter routing.',
	},
	'meta-llama/llama-3.3-70b-instruct': {
		label: 'Llama 3.3 70B Instruct',
		badge: 'Open Source Flagship',
		desc: 'Standard instruction-tuned Llama 3.3 model on OpenRouter.',
	},
	'gpt-4o-mini': {
		label: 'GPT-4o Mini',
		badge: 'Recommended · Fast',
		desc: 'Affordable, low-latency OpenAI multimodal model with sharp conversational dialogue.',
	},
	'gpt-4o': {
		label: 'GPT-4o',
		badge: 'OpenAI Flagship',
		desc: 'Top-tier multimodal model with nuanced conversational phrasing and slang preservation.',
	},
	'qwen3.5:9b': {
		label: 'Qwen 3.5 9B',
		badge: 'Recommended Local',
		desc: 'Flagship 256K context local translation model for 8GB to 12GB GPUs.',
	},
	'qwen3.5:4b': {
		label: 'Qwen 3.5 4B',
		badge: 'Lightweight Local',
		desc: 'Compact 256K local model running smoothly on 4GB to 6GB GPUs or CPU.',
	},
	'qwen3.5:27b': {
		label: 'Qwen 3.5 27B',
		badge: 'High-End Local',
		desc: 'High-precision 27B parameter model for complex localization on 16GB+ GPUs.',
	},
	'gemma4:cloud': {
		label: 'Gemma 4 Cloud',
		badge: 'Free Ollama Cloud',
		desc: "Free cloud-accelerated inference via Ollama's server backend (requires 'ollama signin').",
	},
	'gemma4:12b': {
		label: 'Gemma 4 12B',
		badge: 'Local Vision-LLM',
		desc: 'Google multilingual model with 256K context for rapid comic localization.',
	},
	'qwen2.5:14b': {
		label: 'Qwen 2.5 14B',
		badge: 'Legacy Local',
		desc: 'Legacy Chinese, Japanese, and Korean manhua localization model on local GPUs.',
	},
	'qwen2.5:7b': {
		label: 'Qwen 2.5 7B',
		badge: 'Legacy Local',
		desc: 'Legacy local model running smoothly on lower VRAM GPUs or CPU offload.',
	},
	'llama3.2': {
		label: 'Llama 3.2',
		badge: 'Fast Local',
		desc: 'Compact Meta local model with quick inference generation.',
	},
	'deepseek-r1:8b': {
		label: 'DeepSeek R1 8B',
		badge: 'Local Reasoning',
		desc: 'Local quantized distilled model with reasoning suppressed for rapid translation.',
	},
	'local-model': {
		label: 'Active LM Studio Model',
		badge: 'Loaded Model',
		desc: 'Directly routes translations to whatever model is currently loaded in LM Studio.',
	},
	'custom-model': {
		label: 'Custom Model Identifier',
		badge: 'Custom',
		desc: 'Custom target model for self-hosted or reverse proxy endpoints.',
	},
};

// -- FUNCTIONS -- //

export function isLocal(id: string): boolean {
	return id === 'ollama' || id === 'lmstudio';
}

export function getProviderCategory(id: string): 'cloud' | 'local' | 'custom' {
	if (id === 'ollama' || id === 'lmstudio') return 'local';
	if (id === 'custom') return 'custom';
	return 'cloud';
}

export function formatDeviceLabel(label?: string): string {
	if (!label) return 'Detecting...';
	return label
		.replace(/\s*\(Forced via MT_DEVICE=[^)]+\)/i, '')
		.replace(/\s*\(Standard\)/i, '')
		.replace(/\s*\/ AMD & Intel & NVIDIA/i, '')
		.trim();
}

export function isFloatModified(actual: number | null | undefined, def: number | null | undefined): boolean {
	if (actual === null || actual === undefined || def === null || def === undefined) {
		return actual !== def;
	}
	return Math.abs(actual - def) >= 0.005;
}

export function hasChangesForProvider(
	providerId: string,
	provList: ProviderInfo[],
	keyDraft: Record<string, string>,
	urlDraft: Record<string, string>,
	modelDraft: Record<string, string>
): boolean {
	const prov = provList.find((p) => p.id === providerId);
	if (!prov) return false;
	const hasKey = Boolean(keyDraft[providerId] && keyDraft[providerId].trim().length > 0);
	const hasUrl = urlDraft[providerId] !== undefined && urlDraft[providerId] !== (prov.baseUrl || '');
	const hasModel = modelDraft[providerId] !== undefined && modelDraft[providerId] !== (prov.activeModel || '');
	return hasKey || hasUrl || hasModel;
}

export function formatModelLabel(modelId: string): string {
	return modelId;
}

export function formatModelBadge(modelId: string, isLocalProv: boolean): string {
	if (MODEL_DESCRIPTIONS[modelId]?.badge) return MODEL_DESCRIPTIONS[modelId].badge;
	if (isLocalProv) return 'Local Model';
	if (modelId.includes('/')) return modelId.split('/')[0];
	const match = modelId.match(/(\d+b)/i);
	if (match) return `${match[1].toUpperCase()} Model`;
	return 'Discovered Model';
}

export function getFilteredModels(models: string[], query: string): string[] {
	if (!query || !query.trim()) return models;
	const q = query.trim().toLowerCase();
	return models.filter((m) => m.toLowerCase().includes(q));
}
