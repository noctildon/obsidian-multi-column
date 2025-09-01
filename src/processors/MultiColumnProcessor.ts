import { MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView, MarkdownRenderer } from "obsidian";
import { ColumnEditor } from '../components/ColumnEditor';
import MultiColumnPlugin from "../main";

export class MultiColumnProcessor {
	constructor(private plugin: MultiColumnPlugin) {}

	processCodeBlock(source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const { config, columnContents } = this.parseConfigAndContent(source);

		// Create a render child to manage the lifecycle and updates
		const renderChild = new MultiColumnRenderChild(el, this.plugin, ctx, config, columnContents, source);
		ctx.addChild(renderChild);
	}

	private parseConfigAndContent(source: string): { config: any; columnContents: string[] } {
        // Parse the codeblock source into config and column contents
		const lines = source.split('\n');
		const config: any = {
			columns: 2,
            columnWidths: [50.0, 50.0]
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
				} else if (key === 'columnWidths' && value) {
					config.columnWidths = value.split(',').map(w => parseFloat(w.trim())).filter(w => !isNaN(w));
					config.hasExplicitColumnWidths = true;
				}
			} else if (line.startsWith('===column===')) {
				// Start of column content
				inColumnSection = true;
				currentColumn++;
			} else if (inColumnSection) {
				// Column content
				if (columnContents[currentColumn] === undefined) {
					columnContents[currentColumn] = '';
				}
				columnContents[currentColumn] += line + '\n';
			}
		}

        // Clean up excessive trailing newlines, but preserve intentional ones
		columnContents.forEach((content, i) => {
			if (content) {
				// Remove only excessive trailing newlines (more than 2)
				columnContents[i] = content.replace(/\n{3,}$/, '\n\n');
			}
		});

		// Ensure enough of empty columns
		while (columnContents.length < config.columns) {
			columnContents.push('');
		}

		return { config, columnContents };
	}

	createMultiColumnContainer(config: any, onResizeComplete?: () => void): HTMLElement {
		const container = document.createElement('div');
		container.className = 'multi-column-container';

		const settings = this.plugin.settingManager.getSettings();
		if (settings.showColumnBorders) {
			container.classList.add('show-borders');
		}

        // Add/Remove columns
        const editControls = this.createEditControls(container, config, onResizeComplete);
        container.appendChild(editControls);

		const contentWrapper = document.createElement('div');
		contentWrapper.className = 'multi-column-content';

		// Create columns with resizers between them
		for (let i = 0; i < config.columns; i++) {
			const column = document.createElement('div');
			column.className = 'multi-column-item';
			column.setAttribute('data-column', i.toString());

			// Use saved column width if available, otherwise use equal distribution
			let columnWidth: number;
			if (config.columnWidths && config.columnWidths[i] !== undefined) {
				columnWidth = config.columnWidths[i];
			} else {
				columnWidth = 100 / config.columns;
			}

			column.style.flexBasis = `${columnWidth}%`;
			column.style.minWidth = '100px'; // minimum column width
			contentWrapper.appendChild(column);

			// Add resizer between columns
			if (i < config.columns - 1) {
				const resizer = this.createColumnResizer(i, onResizeComplete);
				contentWrapper.appendChild(resizer);
			}
		}

		container.appendChild(contentWrapper);
		return container;
	}

	private createEditControls(container: HTMLElement, config: any, onResizeComplete?: () => void): HTMLElement {
		const controls = document.createElement('div');
		controls.className = 'multi-column-controls';

		// Add column button
		const addBtn = document.createElement('button');
		addBtn.textContent = '+';
		addBtn.title = 'Add column';
        addBtn.onclick = () => this.addColumn(container, config, onResizeComplete);

		// Remove column button
		const removeBtn = document.createElement('button');
		removeBtn.textContent = '−';
		removeBtn.title = 'Remove column';
		removeBtn.onclick = () => this.removeColumn(container, config, onResizeComplete);

		controls.appendChild(addBtn);
		controls.appendChild(removeBtn);

		return controls;
	}

	private createColumnResizer(columnIndex: number, onResizeComplete?: () => void): HTMLElement {
		const resizer = document.createElement('div');
		resizer.className = 'multi-column-resizer';
		resizer.setAttribute('data-resizer-index', columnIndex.toString());
		resizer.addEventListener('mousedown', (e) => this.startResize(e, columnIndex, onResizeComplete));
		return resizer;
	}

	private startResize(e: MouseEvent, resizerIndex: number, onResizeComplete?: () => void) {
		e.preventDefault();

		const contentWrapper = (e.target as HTMLElement).parentElement;
		if (!contentWrapper) return;

		const columns = Array.from(contentWrapper.querySelectorAll('.multi-column-item')) as HTMLElement[];
		const leftColumn = columns[resizerIndex];
		const rightColumn = columns[resizerIndex + 1];

		if (!leftColumn || !rightColumn) return;

		const startX = e.clientX;
		const containerRect = contentWrapper.getBoundingClientRect();
		const totalWidth = containerRect.width;

		// Get current flex-basis values or calculate from current widths
		const leftRect = leftColumn.getBoundingClientRect();
		const rightRect = rightColumn.getBoundingClientRect();
		const currentLeftPercent = (leftRect.width / totalWidth) * 100;
		const currentRightPercent = (rightRect.width / totalWidth) * 100;
		const totalPercent = currentLeftPercent + currentRightPercent;

		const minWidthPercent = (100 / totalWidth) * 100; // 100px minimum as percentage

		const onMouseMove = (e: MouseEvent) => {
			const deltaX = e.clientX - startX;
			const deltaPercent = (deltaX / totalWidth) * 100;

			let newLeftPercent = currentLeftPercent + deltaPercent;
			let newRightPercent = currentRightPercent - deltaPercent;

			// Enforce minimum widths
			if (newLeftPercent < minWidthPercent) {
				newLeftPercent = minWidthPercent;
				newRightPercent = totalPercent - newLeftPercent;
			} else if (newRightPercent < minWidthPercent) {
				newRightPercent = minWidthPercent;
				newLeftPercent = totalPercent - newRightPercent;
			}

			leftColumn.style.flexBasis = `${newLeftPercent}%`;
			rightColumn.style.flexBasis = `${newRightPercent}%`;
		};

		const onMouseUp = () => {
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
			document.body.style.cursor = '';
			document.body.style.userSelect = '';

			// Save the new column widths after resizing is complete
			if (onResizeComplete) {
				onResizeComplete();
			}
		};

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		document.body.style.cursor = 'col-resize';
		document.body.style.userSelect = 'none';
	}

    private addColumn(container: HTMLElement, config: any, onResizeComplete?: () => void) {
        const contentWrapper = container.querySelector('.multi-column-content') as HTMLElement;
        if (!contentWrapper) return;

        const currentColumns = Array.from(contentWrapper.querySelectorAll('.multi-column-item')) as HTMLElement[];
        if (currentColumns.length === 0) return;

        // Update config
        config.columns++;

        // Calculate new equal column width
        const newColumnWidth = 100 / config.columns;

        // Create the new column
        const newColumn = document.createElement('div');
        newColumn.className = 'multi-column-item';
        newColumn.setAttribute('data-column', (currentColumns.length).toString());
        newColumn.style.flexBasis = `${newColumnWidth}%`;
        newColumn.style.minWidth = '100px';

        // Add empty content placeholder
        const display = document.createElement('div');
        display.className = 'multi-column-display';
        display.textContent = '(empty)';
        display.style.opacity = '0.6';
        newColumn.appendChild(display);

        // Make it clickable (this will be handled by the render child later)
        newColumn.classList.add('multi-column-clickable');

        // Create a resizer before the new column (between last existing column and new column)
        const newResizer = this.createColumnResizer(currentColumns.length - 1, onResizeComplete);

        // Add resizer and new column to the DOM
        contentWrapper.appendChild(newResizer);
        contentWrapper.appendChild(newColumn);

        // Update all existing columns to have equal width
        currentColumns.forEach((column, index) => {
            column.style.flexBasis = `${newColumnWidth}%`;
        });

        // Update column widths in config to equal distribution
        config.columnWidths = new Array(config.columns).fill(newColumnWidth);

        // Trigger update callback to persist changes
        if (onResizeComplete) {
            onResizeComplete();
        }
    }

    private removeColumn(container: HTMLElement, config: any, onResizeComplete?: () => void) {
        const contentWrapper = container.querySelector('.multi-column-content') as HTMLElement;
        if (!contentWrapper) return;

        const currentColumns = Array.from(contentWrapper.querySelectorAll('.multi-column-item')) as HTMLElement[];
        const currentResizers = Array.from(contentWrapper.querySelectorAll('.multi-column-resizer')) as HTMLElement[];

        // Don't allow removing if only one column left
        if (currentColumns.length <= 1) return;

        // Remove the last column
        const lastColumn = currentColumns[currentColumns.length - 1];
        const lastResizer = currentResizers[currentResizers.length - 1]; // Resizer before the last column

        if (lastColumn) {
            lastColumn.remove();
        }
        if (lastResizer) {
            lastResizer.remove();
        }

        config.columns--;

        // Update all remaining columns to have equal width
        const newColumnWidth = 100 / config.columns;
        const remainingColumns = Array.from(contentWrapper.querySelectorAll('.multi-column-item')) as HTMLElement[];
        remainingColumns.forEach((column) => {
            column.style.flexBasis = `${newColumnWidth}%`;
        });

        config.columnWidths = new Array(config.columns).fill(newColumnWidth);

        // Trigger update callback to persist changes
        if (onResizeComplete) {
            onResizeComplete();
        }
    }

	cleanup() {
		// Clean up any event listeners or resources
	}
}

class MultiColumnRenderChild extends MarkdownRenderChild {
	private container: HTMLElement;
	private columnContents: string[];
	private originalSource: string;
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

		const processor = new MultiColumnProcessor(this.plugin);
		this.container = processor.createMultiColumnContainer(this.config, () => {
            this.updateColumnWidthsInConfig();
            this.updateSourceInFile();
        });
		this.loadColumnContents();
		this.containerEl.appendChild(this.container);
	}

	private loadColumnContents() {
        // Load and render column contents
        const columns = this.container.querySelectorAll('.multi-column-item');

        columns.forEach((col, idx) => {
			const el = col as HTMLElement;
			const display = document.createElement('div');
			el.innerHTML = '';
			display.className = 'multi-column-display';

			// Create column header with delete button (only show if more than 1 column)
			if (this.config.columns > 1) {
				const header = document.createElement('div');
				header.className = 'multi-column-header';

				const deleteBtn = document.createElement('button');
				deleteBtn.textContent = '×';
				deleteBtn.className = 'multi-column-delete-btn';
				deleteBtn.title = `Delete column ${idx + 1}`;
				deleteBtn.onclick = (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.removeSpecificColumn(idx);
				};

				header.appendChild(deleteBtn);
				el.appendChild(header);
			}

            // Render markdown content for nicer preview
			let md = this.columnContents[idx] ?? '';
			if (md.trim()) {
				// Preserve multiple consecutive empty lines by replacing them with HTML breaks
				// This prevents markdown renderer from collapsing them
                md = md.replace(/\n/g, '<br>');
				MarkdownRenderer.render(this.plugin.app, md, display, this.ctx.sourcePath, this.plugin);
			} else {
				display.textContent = '(empty)';
				display.style.opacity = '0.6';
			}

            el.appendChild(display);
			el.classList.add('multi-column-clickable');
			el.addEventListener('click', (e) => {
				// Don't trigger edit if clicking on delete button
				if ((e.target as HTMLElement).classList.contains('multi-column-delete-btn')) return;
				e.preventDefault();
				e.stopPropagation();
				this.openEditorOverlay(idx, el);
			});
		});
	}

	private openEditorOverlay(index: number, columnEl: HTMLElement) {
        // Popup overlay window for editing context in a column

		// Avoid reopening if same index already open
		if (this.currentEditIndex === index && this.overlayEl) return;
		this.closeOverlay(false);
		this.currentEditIndex = index;
		this.currentEditValue = this.columnContents[index] ?? '';

		const rect = columnEl.getBoundingClientRect();
		const overlay = document.createElement('div');
		overlay.className = 'multi-column-editor-overlay';
		// Keep dynamic positioning styles inline since they depend on column position
		overlay.style.top = `${rect.top + window.scrollY}px`;
		overlay.style.left = `${rect.left + window.scrollX}px`;
		overlay.style.minWidth = `${Math.max(rect.width, 260)}px`;
		overlay.style.maxWidth = '600px';

		const editorHost = document.createElement('div');
		editorHost.className = 'multi-column-editor-host';
		overlay.appendChild(editorHost);

		const actions = document.createElement('div');
		actions.className = 'multi-column-editor-actions';

		const leftGroup = document.createElement('div');
		leftGroup.className = 'multi-column-editor-actions-group';

		const rightGroup = document.createElement('div');
		rightGroup.className = 'multi-column-editor-actions-group';

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
		hint.className = 'multi-column-editor-hint';
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
		setTimeout(() => this.overlayEditor?.focus(), 5);

		// Overlay editor close (click outside or Esc)
		document.addEventListener('mousedown', this.handleOutsideClick, true);
		document.addEventListener('keydown', this.handleKeyDown);

		// Store cleanup references on element for safety
		(overlay as any)._cleanup = () => {
			document.removeEventListener('mousedown', this.handleOutsideClick, true);
			document.removeEventListener('keydown', this.handleKeyDown);
		};
	}

	// Event handler: outside click should save and close overlay
	private handleOutsideClick = (e: MouseEvent) => {
		if (!this.overlayEl || !this.overlayEl.contains(e.target as Node)) {
			this.closeOverlay(true);
		}
	};

	// Event handler: Escape key cancels edit
	private handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.preventDefault();
			this.closeOverlay(false);
		}
	};

	private closeOverlay(commit: boolean) {
		if (!this.overlayEl) return;

		// Cleanup handlers first to prevent multiple calls
		const cleanup = (this.overlayEl as any)._cleanup;
		if (cleanup) {
			cleanup();
		}

		if (commit && this.currentEditIndex != null) {
			// Persist change then re-render code block by updating file
			this.columnContents[this.currentEditIndex] = this.currentEditValue;
			this.updateSourceInFile();
		}

        // Destroy editor
		this.overlayEditor?.destroy();
		this.overlayEditor = null;

		// Remove overlay from DOM
		this.overlayEl.remove();
		this.overlayEl = null;
		this.currentEditIndex = null;
	}

	private removeSpecificColumn(columnIndex: number) {
		// Don't allow removing if only one column left
		if (this.config.columns <= 1) return;

		// Remove the column content from the array
		this.columnContents.splice(columnIndex, 1);

		// Update config
		this.config.columns--;

		// Calculate new equal column width
		const newColumnWidth = 100 / this.config.columns;
		this.config.columnWidths = new Array(this.config.columns).fill(newColumnWidth);

		// Update the source file to persist changes
		this.updateSourceInFile();
	}

	private updateSourceInFile() {
		// Capture current column widths before saving
		this.updateColumnWidthsInConfig();

		// Ensure columnContents array matches the current column count
		while (this.columnContents.length < this.config.columns) {
			this.columnContents.push('');
		}
		// If there are more contents than columns, truncate
		if (this.columnContents.length > this.config.columns) {
			this.columnContents = this.columnContents.slice(0, this.config.columns);
		}

		let newSource = `columns: ${this.config.columns}\n`;

		// Add column widths if they exist and are not equal distribution
		if (this.config.columnWidths) {
			const widthsString = this.config.columnWidths.map((w: number) => w.toFixed(1)).join(',');
			newSource += `columnWidths: ${widthsString}\n`;
		}

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

	private updateColumnWidthsInConfig() {
		if (!this.container) return;

		const columns = this.container.querySelectorAll('.multi-column-item');
		if (columns.length === 0) return;

		// Calculate the total container width
		const contentWrapper = this.container.querySelector('.multi-column-content');
		if (!contentWrapper) return;

		const containerWidth = (contentWrapper as HTMLElement).getBoundingClientRect().width;
		if (containerWidth === 0) return;

		// Read current column widths as percentages
		const widths: number[] = [];
		columns.forEach((column) => {
			const columnEl = column as HTMLElement;
			const columnWidth = columnEl.getBoundingClientRect().width;
			const percentage = (columnWidth / containerWidth) * 100;
			widths.push(Math.round(percentage * 10) / 10); // Round to 1 decimal place
		});

		// Only save if widths are significantly different from equal distribution
		const equalWidth = 100 / this.config.columns;
		const hasCustomWidths = widths.some(w => Math.abs(w - equalWidth) > 1); // more than 1% difference
		if (hasCustomWidths) {
			this.config.columnWidths = widths;
		}
	}

	private updateCodeBlockInFile(newSource: string) {
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) return;

		const editor = activeView.editor;
		const content = editor.getValue();

		// Create the new block content
		const newBlock = `\`\`\`multi-column\n${newSource}\n\`\`\``;

		// Find the original codeblock more reliably by looking for the exact original source
		const originalBlock = `\`\`\`multi-column\n${this.originalSource}\n\`\`\``;

		// Only update if find the exact original block
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
