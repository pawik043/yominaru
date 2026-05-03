import { Editor, Plugin, Notice } from 'obsidian'

export default class YomiNaru extends Plugin {
	async onload() {
		console.log("Loading YomiNaru")
		this.addCommand({
			id: "yn-process-note",
			name: "Kanjify",
			hotkeys: [{ modifiers: ['Mod'], key:'y'}],
			editorCallback: async (editor: Editor) => {
				const file = this.app.workspace.getActiveFile()
				if (file) {
					const note = await this.app.vault.read(file)
				}
			}
		})
	}

	async onunload() {
		console.log("Unloading YomiNaru :(")
	}


}