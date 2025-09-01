import {
	App,
	Editor,
	EventRef,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import "@total-typescript/ts-reset";
import "@total-typescript/ts-reset/dom";
import { MySettingManager } from "@/SettingManager";
import { MultiColumnProcessor } from "./processors/MultiColumnProcessor";

interface MultiColumnSettings {
	defaultColumns: number;
	showColumnBorders: boolean;
}

const DEFAULT_SETTINGS: MultiColumnSettings = {
	defaultColumns: 2,
	showColumnBorders: false,
};

export default class MultiColumnPlugin extends Plugin {
	settingManager: MySettingManager;
	private eventRefs: EventRef[] = [];
	private processor: MultiColumnProcessor;

	async onload() {
		this.settingManager = new MySettingManager(this);
		await this.settingManager.loadSettings();

		this.processor = new MultiColumnProcessor(this);

		// Register markdown code block processor for multi-column
		this.registerMarkdownCodeBlockProcessor("multi-column", (source, el, ctx) => {
			this.processor.processCodeBlock(source, el, ctx);
		});

		this.addCommand({
			id: "insert-multi-column-block",
			name: "Insert Multi-Column Block",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				const multiColumnBlock = this.generateMultiColumnBlock();
				editor.replaceRange(multiColumnBlock, cursor);
			},
		});

		// Add settings tab
		this.addSettingTab(new MultiColumnSettingTab(this.app, this));
	}

	onunload() {
		super.onunload();
		for (const eventRef of this.eventRefs) {
			this.app.workspace.offref(eventRef);
		}

		this.processor?.cleanup();
	}

	private generateMultiColumnBlock(): string {
		const settings = this.settingManager.getSettings();
		const columns = settings.defaultColumns || 2;

		let block = "```multi-column\n";
		block += `columns: ${columns}\n`;
        block += `columnWidths: 50.0,50.0\n`;

		// Add empty column placeholders
		for (let i = 0; i < columns; i++) {
			block += "===column===\n";
			block += `Column ${i + 1} content here...\n`;
		}

		block += "```\n";
		return block;
	}
}

class MultiColumnSettingTab extends PluginSettingTab {
	plugin: MultiColumnPlugin;

	constructor(app: App, plugin: MultiColumnPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Multi-Column Layout Settings" });

		new Setting(containerEl)
			.setName("Default Columns")
			.setDesc("Default number of columns when creating new multi-column blocks")
			.addSlider((slider) =>
				slider
					.setLimits(1, 6, 1)
					.setValue(this.plugin.settingManager.getSettings().defaultColumns)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settingManager.updateSettings((setting) => {
							setting.value.defaultColumns = value;
						});
					})
			);

		new Setting(containerEl)
			.setName("Show Column Borders")
			.setDesc("Display borders around columns for better visualization")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settingManager.getSettings().showColumnBorders)
					.onChange(async (value) => {
						this.plugin.settingManager.updateSettings((setting) => {
							setting.value.showColumnBorders = value;
						});
					})
			);
	}
}
