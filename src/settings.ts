import { App, PluginSettingTab, Setting } from "obsidian";
import FocusGaugePlugin from "./main";

export interface GaugeType {
	label: string;  // 단일 문자 타입 (C, W, R, L 등)
	name: string;   // 설명
	color: string;  // 색상 코드
}

export interface FocusGaugeSettings {
	enabledHeader: string;
	gaugeTypes: GaugeType[];
	syntaxPrefix: string;   // 시작 문자 (예: [, {, <)
	syntaxSuffix: string;   // 끝 문자 (예: ], }, >)
	syntaxSeparator: string; // 구분자 (예: 공백, :, -)
}

export const DEFAULT_SETTINGS: FocusGaugeSettings = {
	enabledHeader: '## TimeBlocks',
	gaugeTypes: [
		{ label: 'C', name: 'Concentration', color: '#b388ff' },
		{ label: 'W', name: 'Work', color: '#4dabf7' },
		{ label: 'L', name: 'Learning', color: '#69db7c' },
		{ label: 'R', name: 'Rest', color: '#ffa94d' },
	],
	syntaxPrefix: '[',
	syntaxSuffix: ']',
	syntaxSeparator: ' '
}

export class FocusGaugeSettingTab extends PluginSettingTab {
	plugin: FocusGaugePlugin;

	constructor(app: App, plugin: FocusGaugePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('활성화 헤더')
			.setDesc('이 헤더 이름 하위에서만 Focus Gauge가 동작합니다. 비워두면 모든 곳에서 동작합니다.')
			.addText(text => text
				.setPlaceholder('## TimeBlocks')
				.setValue(this.plugin.settings.enabledHeader)
				.onChange(async (value) => {
					this.plugin.settings.enabledHeader = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Syntax Settings' });

		new Setting(containerEl)
			.setName('시작 문자')
			.setDesc('게이지 패턴의 시작 문자 (예: [, {, <)')
			.addText(text => text
				.setPlaceholder('[')
				.setValue(this.plugin.settings.syntaxPrefix)
				.onChange(async (value) => {
					this.plugin.settings.syntaxPrefix = value;
					await this.plugin.saveSettings();
					this.plugin.refreshExtension();
				}));

		new Setting(containerEl)
			.setName('끝 문자')
			.setDesc('게이지 패턴의 끝 문자 (예: ], }, >)')
			.addText(text => text
				.setPlaceholder(']')
				.setValue(this.plugin.settings.syntaxSuffix)
				.onChange(async (value) => {
					this.plugin.settings.syntaxSuffix = value;
					await this.plugin.saveSettings();
					this.plugin.refreshExtension();
				}));

		new Setting(containerEl)
			.setName('구분자')
			.setDesc('타입과 값 사이의 구분자 (예: 공백, :, -)')
			.addText(text => text
				.setPlaceholder(' ')
				.setValue(this.plugin.settings.syntaxSeparator)
				.onChange(async (value) => {
					this.plugin.settings.syntaxSeparator = value;
					await this.plugin.saveSettings();
					this.plugin.refreshExtension();
				}));

		containerEl.createEl('h3', { text: 'Gauge Types' });

		this.plugin.settings.gaugeTypes.forEach((gaugeType, index) => {
			const setting = new Setting(containerEl)
				.setName(`Type: ${gaugeType.label}`)
				.setDesc(gaugeType.name)
				.addText(text => text
					.setPlaceholder('Label (1 char)')
					.setValue(gaugeType.label)
					.onChange(async (value) => {
						if (value.length <= 1 && this.plugin.settings.gaugeTypes[index]) {
							this.plugin.settings.gaugeTypes[index]!.label = value.toUpperCase();
							await this.plugin.saveSettings();
							this.plugin.refreshExtension();
						}
					}))
				.addText(text => text
					.setPlaceholder('Name')
					.setValue(gaugeType.name)
					.onChange(async (value) => {
						if (this.plugin.settings.gaugeTypes[index]) {
							this.plugin.settings.gaugeTypes[index]!.name = value;
							await this.plugin.saveSettings();
						}
					}))
				.addColorPicker(color => color
					.setValue(gaugeType.color)
					.onChange(async (value) => {
						if (this.plugin.settings.gaugeTypes[index]) {
							this.plugin.settings.gaugeTypes[index]!.color = value;
							await this.plugin.saveSettings();
							this.plugin.refreshExtension();
						}
					}))
				.addButton(button => button
					.setButtonText('삭제')
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.gaugeTypes.splice(index, 1);
						await this.plugin.saveSettings();
						this.plugin.refreshExtension();
						this.display();
					}));
		});

		new Setting(containerEl)
			.setName('새 타입 추가')
			.addButton(button => button
				.setButtonText('추가')
				.setCta()
				.onClick(async () => {
					this.plugin.settings.gaugeTypes.push({
						label: 'X',
						name: 'New Type',
						color: '#888888'
					});
					await this.plugin.saveSettings();
					this.plugin.refreshExtension();
					this.display();
				}));
	}
}
