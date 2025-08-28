import { MarkdownView } from "obsidian";
import MultiColumnPlugin from "../main";

export class LivePreviewEditor {
	constructor(private plugin: MultiColumnPlugin) {
		this.setupLivePreviewHandling();
	}

	private setupLivePreviewHandling() {
		// Set up event handlers for live preview mode
		this.plugin.registerDomEvent(document, 'click', (evt) => {
			const target = evt.target as HTMLElement;
			if (target.closest('.multi-column-container')) {
				this.handleMultiColumnClick(evt);
			}
		});
	}

	private handleMultiColumnClick(evt: MouseEvent) {
		const settings = this.plugin.settingManager.getSettings();
		if (!settings.enableInteractiveEditing) return;

		// Just allow normal editing - no need for overlay controls
		// The built-in controls in the MultiColumnProcessor handle add/remove column functionality
	}

	refreshViews() {
		// Refresh all multi-column containers in active views
		const activeView = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			const containers = activeView.containerEl.querySelectorAll('.multi-column-container');
			containers.forEach(container => {
				// Refresh container styling or content as needed
			});
		}
	}

	cleanup() {
		// Clean up event listeners
	}
}
