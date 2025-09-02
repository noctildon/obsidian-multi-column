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
	// Drag and drop state
	private draggedColumnIndex: number | null = null;
	private dropTargetIndex: number | null = null;

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

    // Load and render column contents
	private loadColumnContents() {
        const columns = this.container.querySelectorAll('.multi-column-item');

        columns.forEach((col, idx) => {
			const el = col as HTMLElement;
			const display = document.createElement('div');
			el.innerHTML = '';
			display.className = 'multi-column-display';

			// Make column draggable for reordering
			el.draggable = true;
			el.setAttribute('data-column-index', idx.toString());

			// Add drag event listeners
			el.addEventListener('dragstart', (e) => this.handleDragStart(e, idx));
			el.addEventListener('dragover', (e) => this.handleDragOver(e, idx));
			el.addEventListener('dragenter', (e) => this.handleDragEnter(e, idx));
			el.addEventListener('dragleave', (e) => this.handleDragLeave(e, idx));
			el.addEventListener('drop', (e) => this.handleDrop(e, idx));
			el.addEventListener('dragend', (e) => this.handleDragEnd(e));

			const header = document.createElement('div');
			header.className = 'multi-column-header';

			// Create button container for better layout
			const buttonContainer = document.createElement('div');
			buttonContainer.className = 'multi-column-button-container';

			const settings = this.plugin.settingManager.getSettings();
			const sizeScale = settings.buttonSize;

			// Add column left button
			const addLeftBtn = document.createElement('button');
			addLeftBtn.textContent = '◀';
			addLeftBtn.className = 'multi-column-btn multi-column-add-btn';
			addLeftBtn.title = `Add column to the left`;
			this.applyButtonSizing(addLeftBtn, sizeScale);
			addLeftBtn.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.addColumn(idx, 'left');
			};

            // Add column right button
			const addRightBtn = document.createElement('button');
			addRightBtn.textContent = '▶';
			addRightBtn.className = 'multi-column-btn multi-column-add-btn';
			addRightBtn.title = `Add column to the right`;
			this.applyButtonSizing(addRightBtn, sizeScale);
			addRightBtn.onclick = (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.addColumn(idx, 'right');
			};

			// Delete button (only show if more than 1 column)
			let deleteBtn: HTMLButtonElement | null = null;
			if (this.config.columns > 1) {
				deleteBtn = document.createElement('button');
				deleteBtn.textContent = '×';
				deleteBtn.className = 'multi-column-btn multi-column-delete-btn';
				deleteBtn.title = `Delete column ${idx + 1}`;
				this.applyButtonSizing(deleteBtn, sizeScale);
				deleteBtn.onclick = (e) => {
					e.preventDefault();
					e.stopPropagation();
					this.removeColumn(idx);
				};
			}

			// Append buttons in order: left, delete (if exists), right
			buttonContainer.appendChild(addLeftBtn);
			if (deleteBtn) {
				buttonContainer.appendChild(deleteBtn);
			}
			buttonContainer.appendChild(addRightBtn);
			header.appendChild(buttonContainer);
			el.appendChild(header);

            // Render markdown content for nicer preview
			let md = this.columnContents[idx] ?? '';
			if (md.trim()) {
                md = md.replace(/\n/g, '<br>');
				MarkdownRenderer.render(this.plugin.app, md, display, this.ctx.sourcePath, this.plugin);
			} else {
				display.textContent = '(empty)';
				display.style.opacity = '0.6';
			}

            el.appendChild(display);
			el.classList.add('multi-column-clickable');
			el.addEventListener('click', (e) => {
				// Don't trigger edit if clicking on control buttons
				const target = e.target as HTMLElement;
				if (target.classList.contains('multi-column-btn')) return;

				// Don't trigger edit if clicking on links or other interactive elements
				if (target.tagName === 'A' || target.closest('a')) return;

				e.preventDefault();
				e.stopPropagation();
				this.openEditorOverlay(idx, el);
			});
		});
	}

    // Popup overlay window for editing context in a column
	private openEditorOverlay(index: number, columnEl: HTMLElement) {
		// Avoid reopening if same index already open
		if (this.currentEditIndex === index && this.overlayEl) return;
		this.closeOverlay(false);
		this.currentEditIndex = index;
		this.currentEditValue = this.columnContents[index] ?? '';

		const rect = columnEl.getBoundingClientRect();
		const overlay = document.createElement('div');
		overlay.className = 'multi-column-editor-overlay';
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

		// Close overlay editor (click outside or Esc)
		document.addEventListener('mousedown', this.handleOutsideClick, true);
		document.addEventListener('keydown', this.handleKeyDown);

		// Store cleanup references on element for safety
		(overlay as any)._cleanup = () => {
			document.removeEventListener('mousedown', this.handleOutsideClick, true);
			document.removeEventListener('keydown', this.handleKeyDown);
		};
	}

	// Outside click saves and closes overlay
	private handleOutsideClick = (e: MouseEvent) => {
		if (!this.overlayEl || !this.overlayEl.contains(e.target as Node)) {
			this.closeOverlay(true);
		}
	};

	// Escape key cancels edit
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

		this.overlayEditor?.destroy();
		this.overlayEditor = null;
		this.overlayEl.remove();
		this.overlayEl = null;
		this.currentEditIndex = null;
	}

	private removeColumn(columnIndex: number) {
		// Don't allow removing if only one column left
		if (this.config.columns <= 1) return;
		this.columnContents.splice(columnIndex, 1);
		this.config.columns--;

		// Calculate new equal column width
		const newColumnWidth = 100 / this.config.columns;
		this.config.columnWidths = new Array(this.config.columns).fill(newColumnWidth);
		this.updateSourceInFile();
	}

	private addColumn(columnIndex: number, position: 'left' | 'right') {
		const insertIndex = position === 'left' ? columnIndex : columnIndex + 1;

		// Insert empty content at the specified position
		this.columnContents.splice(insertIndex, 0, '');
		this.config.columns++;

		// Calculate new equal column width
		const newColumnWidth = 100 / this.config.columns;
		this.config.columnWidths = new Array(this.config.columns).fill(newColumnWidth);
		this.updateSourceInFile();
	}

    // apply sizing setting to the buttons
    private applyButtonSizing(button: HTMLButtonElement, sizeScale: number) {
        const baseFontSize = 8;
		const basePaddingVertical = 2;
		const basePaddingHorizontal = 5;
		const baseBorderRadius = 2;
        const baseWidth = 20;
        const baseHeight = 20;

		const scaledFontSize = Math.round(baseFontSize * sizeScale);
		const scaledPaddingV = Math.max(1, Math.round(basePaddingVertical * sizeScale));
		const scaledPaddingH = Math.max(2, Math.round(basePaddingHorizontal * sizeScale));
		const scaledBorderRadius = Math.max(1, Math.round(baseBorderRadius * sizeScale));
        const scaledWidth = Math.round(baseWidth * sizeScale);
        const scaledHeight = Math.round(baseHeight * sizeScale);

		button.style.fontSize = `${scaledFontSize}px`;
		button.style.padding = `${scaledPaddingV}px ${scaledPaddingH}px`;
		button.style.borderRadius = `${scaledBorderRadius}px`;
        button.style.width = `${scaledWidth}px`;
        button.style.height = `${scaledHeight}px`;
	}

    private handleDragStart(e: DragEvent, columnIndex: number) {
		this.draggedColumnIndex = columnIndex;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/plain', columnIndex.toString());
		}

		const columnEl = e.target as HTMLElement;
		columnEl.classList.add('multi-column-dragging');

		// Prevent opening editor during drag
		e.stopPropagation();
	}

	private handleDragOver(e: DragEvent, columnIndex: number) {
		e.preventDefault();
		if (e.dataTransfer) {
			e.dataTransfer.dropEffect = 'move';
		}
	}

	private handleDragEnter(e: DragEvent, columnIndex: number) {
		e.preventDefault();

		// Don't highlight the dragged column itself
		if (this.draggedColumnIndex === columnIndex) return;

		// Add drop target highlight
		const columnEl = e.currentTarget as HTMLElement;
		columnEl.classList.add('multi-column-drop-target');
		this.dropTargetIndex = columnIndex;
	}

	private handleDragLeave(e: DragEvent, columnIndex: number) {
		// Only remove highlight if we're actually leaving this element
		// (not just moving to a child element)
		const columnEl = e.currentTarget as HTMLElement;
		if (!columnEl.contains(e.relatedTarget as Node)) {
			columnEl.classList.remove('multi-column-drop-target');
			if (this.dropTargetIndex === columnIndex) {
				this.dropTargetIndex = null;
			}
		}
	}

	private handleDrop(e: DragEvent, dropIndex: number) {
		e.preventDefault();
		e.stopPropagation();

		const columnEl = e.currentTarget as HTMLElement;
		columnEl.classList.remove('multi-column-drop-target');

		// Don't do anything if dropping on the same column
		if (this.draggedColumnIndex === null || this.draggedColumnIndex === dropIndex) {
			return;
		}

		this.reorderColumn(this.draggedColumnIndex, dropIndex);
	}

    private reorderColumn(fromIndex: number, toIndex: number) {
		// Move the column content
		const movedContent = this.columnContents[fromIndex] || '';
		this.columnContents.splice(fromIndex, 1);
		this.columnContents.splice(toIndex, 0, movedContent);

		// If we have explicit column widths, reorder them too
		if (this.config.columnWidths && this.config.columnWidths.length > Math.max(fromIndex, toIndex)) {
			const movedWidth = this.config.columnWidths[fromIndex];
			this.config.columnWidths.splice(fromIndex, 1);
			this.config.columnWidths.splice(toIndex, 0, movedWidth);
		}

		// Update the source file, which will trigger a re-render
		this.updateSourceInFile();
	}

	private handleDragEnd(e: DragEvent) {
		// Clean up drag state and visual feedback
		const columnEl = e.target as HTMLElement;
		columnEl.classList.remove('multi-column-dragging');

		// Remove all drop target highlights
		const allColumns = this.container.querySelectorAll('.multi-column-item');
		allColumns.forEach(col => {
			col.classList.remove('multi-column-drop-target');
		});

		// Reset drag state
		this.draggedColumnIndex = null;
		this.dropTargetIndex = null;

		// BUG: the re-rendering is not working
		setTimeout(() => {
			this.render();
		}, 50);
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
