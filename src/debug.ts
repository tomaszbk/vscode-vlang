import { window } from "vscode"

export const outputChannel = window.createOutputChannel("V", { log: true })
export const vlsOutputChannel = window.createOutputChannel("V Language Server", { log: true })

export function log(msg: string): void {
	// logging for devtools/debug
	console.log(`[vscode-vlang] ${msg}`)
	outputChannel.info(msg)
}
