import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView, MarkdownRenderer } from "obsidian";
import { ColumnEditor } from '../components/ColumnEditor';
import MultiColumnPlugin from "../main";

export class MultiColumnProcessor {
	constructor(private plugin: MultiColumnPlugin) {}

	processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		console.log('Processing code block with source:', source);

		const { config, columnContents } = this.parseConfigAndContent(source);
		console.log('Parsed config:', config, 'Column contents:', columnContents);

		// Create a render child to manage the lifecycle and updates
		const renderChild = new MultiColumnRenderChild(el, this.plugin, ctx, config, columnContents, source);
		ctx.addChild(renderChild);
	}

	private parseConfigAndContent(source: string): { config: any; columnContents: string[] } {
		const lines = source.split('\n');
		const config: any = {
			columns: 2
		};

		const columnContents: string[] = [];
		let currentColumn = -1;
		let inColumnSection = false;

		for (const line of lines) {
			if (line.includes(':') && !inColumnSection) {
				// Parse config
				const [key, value] = line.split(':').map(s => s.trim());
				if (key === 'columns' && value) {
					config.columns = parseInt(value) || 2;
				}
			} else if (line.startsWith('===column===')) {
				// Start of column content
				inColumnSection = true;
				currentColumn++;
				columnContents[currentColumn] = '';
			} else if (inColumnSection) {
				// Column content
				if (columnContents[currentColumn] === undefined) {
					columnContents[currentColumn] = '';
				}
				columnContents[currentColumn] += line + '\n';
			}
		}		// Clean up excessive trailing newlines, but preserve intentional ones
		columnContents.forEach((content, i) => {
			if (content) {
				// Remove only excessive trailing newlines (more than 2)
				columnContents[i] = content.replace(/\n{3,}$/, '\n\n');
			}
		});

		// Ensure we have enough empty columns
		while (columnContents.length < config.columns) {
			columnContents.push('');
		}

		return { config, columnContents };
	}

	createMultiColumnContainer(config: any): HTMLElement {
		const container = document.createElement('div');
		container.className = 'multi-column-container';

		const settings = this.plugin.settingManager.getSettings();
		if (settings.showColumnBorders) {
			container.classList.add('show-borders');
		}

		// Add edit controls if interactive editing is enabled
		if (settings.enableInteractiveEditing) {
			const editControls = this.createEditControls(container, config);
			container.appendChild(editControls);
		}

		// Create content wrapper for horizontal columns
		const contentWrapper = document.createElement('div');
		contentWrapper.className = 'multi-column-content';

		// Columns placeholder wrappers (editor inserted later)
		for (let i = 0; i < config.columns; i++) {
			const column = document.createElement('div');
			column.className = 'multi-column-item';
			column.setAttribute('data-column', i.toString());
			contentWrapper.appendChild(column);
			if (i < config.columns - 1) {
				const resizer = document.createElement('div');
				resizer.className = 'multi-column-resizer';
				this.attachResizerEvents(resizer);
				contentWrapper.appendChild(resizer);
			}
		}

		container.appendChild(contentWrapper);
		return container;
	}

	private createEditControls(container: HTMLElement, config: any): HTMLElement {
		const controls = document.createElement('div');
		controls.className = 'multi-column-controls';
		controls.style.cssText = `
			display: flex;
			gap: 8px;
			margin-bottom: 8px;
			padding: 8px;
			background: var(--background-secondary);
			border-radius: 4px;
			font-size: 12px;
		`;

		// Add column button
		const addBtn = document.createElement('button');
		addBtn.textContent = '+';
		addBtn.title = 'Add column';
		addBtn.style.cssText = `
			padding: 4px 8px;
			background: var(--interactive-accent);
			color: var(--text-on-accent);
			border: none;
			border-radius: 3px;
			cursor: pointer;
		`;
		addBtn.onclick = () => this.addColumn(container);

		// Remove column button
		const removeBtn = document.createElement('button');
		removeBtn.textContent = '−';
		removeBtn.title = 'Remove column';
		removeBtn.style.cssText = addBtn.style.cssText;
		removeBtn.onclick = () => this.removeColumn(container);

		controls.appendChild(addBtn);
		controls.appendChild(removeBtn);

		return controls;
	}

	private addColumn(container: HTMLElement) {
		const contentWrapper = container.querySelector('.multi-column-content') as HTMLElement;
		if (!contentWrapper) return;

		const columns = contentWrapper.querySelectorAll('.multi-column-item');
		// Create new column wrapper
		const newColumn = document.createElement('div');
		newColumn.className = 'multi-column-item';
		newColumn.setAttribute('data-column', columns.length.toString());
		if (columns.length > 0) {
			const resizer = document.createElement('div');
			resizer.className = 'multi-column-resizer';
			this.attachResizerEvents(resizer);
			contentWrapper.appendChild(resizer);
		}
		contentWrapper.appendChild(newColumn);
	}

	private removeColumn(container: HTMLElement) {
		const contentWrapper = container.querySelector('.multi-column-content') as HTMLElement;
		if (!contentWrapper) return;

		const columns = contentWrapper.querySelectorAll('.multi-column-item');
		const resizers = contentWrapper.querySelectorAll('.multi-column-resizer');

		if (columns.length > 1) {
			// Remove last column and its resizer
			const lastColumn = columns[columns.length - 1] as HTMLElement;
			const lastResizer = resizers[resizers.length - 1] as HTMLElement;

			if (lastColumn) {
				lastColumn.remove();
			}
			if (lastResizer) {
				lastResizer.remove();
			}
		}
	}

	attachResizerEvents(resizer: HTMLElement) {
		let isResizing = false;
		let startX: number;
		let startWidth: number;

		resizer.addEventListener('mousedown', (e) => {
			isResizing = true;
			startX = e.clientX;

			const prevColumn = resizer.previousElementSibling as HTMLElement;
			startWidth = prevColumn.offsetWidth;

			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
		});

		const handleMouseMove = (e: MouseEvent) => {
			if (!isResizing) return;

			const deltaX = e.clientX - startX;
			const prevColumn = resizer.previousElementSibling as HTMLElement;
			const newWidth = startWidth + deltaX;

			if (newWidth > 50) { // Minimum column width
				prevColumn.style.width = newWidth + 'px';
			}
		};

		const handleMouseUp = () => {
			isResizing = false;
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
		};
	}

	cleanup() {
		// Clean up any event listeners or resources
	}
}

class MultiColumnRenderChild extends MarkdownRenderChild {
	private container: HTMLElement;
	private columnContents: string[];
	private originalSource: string;
	// Popup overlay state
	private overlayEl: HTMLElement | null = null;
	private overlayEditor: ColumnEditor | null = null;
	private currentEditIndex: number | null = null;
	private currentEditValue: string = '';

	constructor(
		containerEl: HTMLElement,
		private plugin: MultiColumnPlugin,
		private ctx: MarkdownPostProcessorContext,
		private config: any,
		columnContents: string[],
		originalSource: string
	) {
		super(containerEl);
		this.columnContents = [...columnContents];
		this.originalSource = originalSource;
		this.render();
	}

	private render() {
		this.containerEl.empty();

		// Create the multi-column container using the processor's methods
		const processor = new MultiColumnProcessor(this.plugin);
		this.container = processor.createMultiColumnContainer(this.config);

		// Load existing content into columns
		this.loadColumnContents();

		this.containerEl.appendChild(this.container);
	}

	private loadColumnContents() {
		const wrappers = this.container.querySelectorAll('.multi-column-item');
		wrappers.forEach((wrap, idx) => {
			const el = wrap as HTMLElement;
			el.innerHTML = '';
			const display = document.createElement('div');
			display.className = 'multi-column-display';
			// Render markdown content for nicer preview
			const md = (this.columnContents[idx] ?? '').trim();
			if (md) {
				MarkdownRenderer.renderMarkdown(md, display, this.ctx.sourcePath, this.plugin);
			} else {
				display.textContent = '(empty)';
				display.style.opacity = '0.6';
			}
			el.appendChild(display);
			el.classList.add('multi-column-clickable');
			el.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.openEditorOverlay(idx, el);
			});
		});
	}

	private openEditorOverlay(index: number, columnEl: HTMLElement) {
		// Avoid reopening if same index already open
		if (this.currentEditIndex === index && this.overlayEl) return;
		this.closeOverlay(false);
		this.currentEditIndex = index;
		this.currentEditValue = this.columnContents[index] ?? '';

		const rect = columnEl.getBoundingClientRect();
		const overlay = document.createElement('div');
		overlay.className = 'multi-column-editor-overlay';
		overlay.style.position = 'absolute';
		overlay.style.top = `${rect.top + window.scrollY}px`;
		overlay.style.left = `${rect.left + window.scrollX}px`;
		overlay.style.minWidth = `${Math.max(rect.width, 260)}px`;
		overlay.style.maxWidth = '600px';
		overlay.style.background = 'var(--background-primary)';
		overlay.style.display = 'flex';
		overlay.style.flexDirection = 'column';
		overlay.style.gap = '8px';

		const editorHost = document.createElement('div');
		editorHost.style.minHeight = '140px';
		editorHost.style.border = '1px solid var(--background-modifier-border)';
		editorHost.style.borderRadius = '4px';
		editorHost.style.padding = '4px';
		overlay.appendChild(editorHost);

		const actions = document.createElement('div');
		actions.style.display = 'flex';
		actions.style.justifyContent = 'space-between';
		actions.style.gap = '4px';

		const leftGroup = document.createElement('div');
		leftGroup.style.display = 'flex';
		leftGroup.style.gap = '4px';

		const rightGroup = document.createElement('div');
		rightGroup.style.display = 'flex';
		rightGroup.style.gap = '4px';

		const saveBtn = document.createElement('button');
		saveBtn.textContent = 'Save';
		saveBtn.className = 'mod-cta';
		saveBtn.onclick = () => this.closeOverlay(true);

		const cancelBtn = document.createElement('button');
		cancelBtn.textContent = 'Cancel';
		cancelBtn.onclick = () => this.closeOverlay(false);

		leftGroup.appendChild(saveBtn);
		leftGroup.appendChild(cancelBtn);
		actions.appendChild(leftGroup);

		const hint = document.createElement('div');
		hint.style.fontSize = '11px';
		hint.style.opacity = '0.7';
		hint.textContent = 'Esc: cancel · Click outside: save';
		rightGroup.appendChild(hint);
		actions.appendChild(rightGroup);
		overlay.appendChild(actions);

		document.body.appendChild(overlay);
		this.overlayEl = overlay;

		// Instantiate CodeMirror editor (no autosave; just track currentEditValue)
		this.overlayEditor = new ColumnEditor(this.plugin, editorHost, this.currentEditValue, this.ctx.sourcePath, (val) => {
			this.currentEditValue = val; // live update internal buffer only
		});

		// Focus editor
		setTimeout(() => this.overlayEditor?.focus(), 0);

		// Outside click handler – save on outside click
		const outsideClick = (e: MouseEvent) => {
			if (!overlay.contains(e.target as Node)) {
				document.removeEventListener('mousedown', outsideClick, true);
				this.closeOverlay(true);
			}
		};
		document.addEventListener('mousedown', outsideClick, true);

		// Escape key to cancel
		const keyHandler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				this.closeOverlay(false);
			}
		};
		document.addEventListener('keydown', keyHandler, { once: true });

		// Store cleanup references on element for safety
		(overlay as any)._cleanup = () => {
			document.removeEventListener('mousedown', outsideClick, true);
		};
	}

	private closeOverlay(commit: boolean) {
		if (!this.overlayEl) return;
		if (commit && this.currentEditIndex != null) {
			// Persist change then re-render code block by updating file
			this.columnContents[this.currentEditIndex] = this.currentEditValue;
			this.updateSourceInFile();
		}
		// Destroy editor
		this.overlayEditor?.destroy();
		this.overlayEditor = null;
		// Cleanup handlers
		const cleanup = (this.overlayEl as any)._cleanup;
		if (cleanup) cleanup();
		this.overlayEl.remove();
		this.overlayEl = null;
		this.currentEditIndex = null;
	}

	private updateSourceInFile() {
		let newSource = `columns: ${this.config.columns}\n`;
		this.columnContents.forEach((content) => {
			newSource += `===column===\n`;
			if (content) {
				newSource += content;
				if (!content.endsWith('\n')) newSource += '\n';
			}
		});
		newSource = newSource.replace(/\n$/, '');
		this.updateCodeBlockInFile(newSource);
	}

	private updateCodeBlockInFile(newSource: string) {
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const editor = activeView.editor;
		const content = editor.getValue();

		// Create the new block content
		const newBlock = `\`\`\`multi-column\n${newSource}\n\`\`\``;

		// Find the original code block more reliably by looking for the exact original source
		const originalBlock = `\`\`\`multi-column\n${this.originalSource}\n\`\`\``;

		// Only update if we find the exact original block
		const blockIndex = content.indexOf(originalBlock);
		if (blockIndex !== -1) {
			// Use a small delay to avoid conflicts with live preview
			setTimeout(() => {
				const currentContent = editor.getValue();
				const currentBlockIndex = currentContent.indexOf(originalBlock);

				if (currentBlockIndex !== -1) {
					const newContent = currentContent.substring(0, currentBlockIndex) +
									  newBlock +
									  currentContent.substring(currentBlockIndex + originalBlock.length);

					// Update the original source reference for future saves
					this.originalSource = newSource;

					// Set the new content
					editor.setValue(newContent);
				}
			}, 100);
		}
	}
}
