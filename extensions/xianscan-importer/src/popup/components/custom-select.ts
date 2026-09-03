// -- REUSABLE ACCESSIBLE CUSTOM SELECT COMPONENT -- //

// -- TYPES -- //

export interface SelectOption {
	label: string;
	value: string;
	className?: string;
}

// -- CUSTOM SELECT CLASS -- //

export class CustomSelectComponent {
	private static instances: CustomSelectComponent[] = [];
	private static documentListenerAttached = false;

	private container: HTMLElement;
	private button: HTMLButtonElement;
	private labelEl: HTMLElement;
	private dropdown: HTMLElement;
	private selectedValue: string | null = null;
	private onSelectCallback?: (value: string) => void;

	constructor(
		containerId: string,
		buttonId: string,
		labelId: string,
		dropdownId: string,
		onSelect?: (value: string) => void
	) {
		this.container = document.getElementById(containerId) || document.createElement('div');
		this.button = (document.getElementById(buttonId) as HTMLButtonElement) || document.createElement('button');
		this.labelEl = document.getElementById(labelId) || document.createElement('span');
		this.dropdown = document.getElementById(dropdownId) || document.createElement('div');
		this.onSelectCallback = onSelect;

		CustomSelectComponent.instances.push(this);

		this.button.addEventListener('click', (e) => {
			e.stopPropagation();
			CustomSelectComponent.closeAllExcept(this);
			this.container.classList.toggle('open');
		});

		CustomSelectComponent.ensureGlobalClickListener();
	}

	private static ensureGlobalClickListener(): void {
		if (CustomSelectComponent.documentListenerAttached) return;
		CustomSelectComponent.documentListenerAttached = true;
		document.addEventListener('click', () => {
			CustomSelectComponent.closeAllExcept(null);
		});
	}

	public static closeAllExcept(active: CustomSelectComponent | null): void {
		for (const instance of CustomSelectComponent.instances) {
			if (instance !== active) {
				instance.close();
			}
		}
	}

	close(): void {
		this.container.classList.remove('open');
	}

	setDisabled(disabled: boolean): void {
		this.button.disabled = disabled;
	}

	setLabel(text: string): void {
		this.labelEl.textContent = text;
	}

	getValue(): string | null {
		return this.selectedValue;
	}

	// BIND EXISTING STATIC OPTIONS ALREADY PRESENT IN HTML
	bindStaticOptions(initialValue?: string): void {
		const options = Array.from(this.dropdown.querySelectorAll<HTMLButtonElement>('.custom-select-option'));
		for (const opt of options) {
			opt.addEventListener('click', (e) => {
				e.stopPropagation();
				const val = opt.dataset.value || '';
				this.select(val, opt.textContent || val, true);
			});
		}
		if (initialValue) {
			const match = options.find(o => o.dataset.value === initialValue);
			if (match) {
				this.select(initialValue, match.textContent || initialValue, false);
			}
		}
	}

	// POPULATE OPTIONS DYNAMICALLY
	setOptions(options: SelectOption[], initialValue?: string): void {
		this.dropdown.innerHTML = '';
		for (const opt of options) {
			const btn = document.createElement('button');
			btn.className = `custom-select-option mono ${opt.className || ''}`;
			btn.type = 'button';
			btn.dataset.value = opt.value;
			btn.textContent = opt.label;

			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.select(opt.value, opt.label, true);
			});

			this.dropdown.appendChild(btn);
		}

		if (initialValue !== undefined) {
			const match = options.find(o => o.value === initialValue);
			if (match) {
				this.select(match.value, match.label, false);
			}
		}
	}

	// SELECT OPTION: NOTIFY DEFAULTS TO FALSE TO PREVENT RECURSIVE EVENT LOOPS DURING PROGRAMMATIC UPDATES
	select(value: string, label?: string, notify = false): void {
		this.selectedValue = value;
		const matchingOpt = this.dropdown.querySelector<HTMLElement>(`.custom-select-option[data-value="${value}"]`);
		if (label) {
			this.labelEl.textContent = label;
		} else if (matchingOpt && matchingOpt.textContent) {
			this.labelEl.textContent = matchingOpt.textContent;
		}

		this.dropdown.querySelectorAll<HTMLElement>('.custom-select-option').forEach(opt => {
			opt.classList.toggle('active', opt.dataset.value === value);
		});

		this.close();
		if (notify) {
			this.onSelectCallback?.(value);
		}
	}
}
