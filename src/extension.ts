import { registerCommands, registerVlsCommands } from "commands"
import { getVlsPath, isVlsEnabled } from "langserver"
import { log, outputChannel, vlsOutputChannel } from "logger"
import { vlsConfig } from "utils"
import vscode, { ConfigurationChangeEvent, ExtensionContext, workspace } from "vscode"
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node"

export let client: LanguageClient | undefined

async function createAndStartClient(): Promise<void> {
	const vlsPath = await getVlsPath()

	const serverOptions: ServerOptions = {
		run: { command: vlsPath },
		debug: { command: vlsPath },
	}

	const clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: "file", language: "v" }],
		outputChannel: vlsOutputChannel,
		synchronize: {
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.v"),
		},
	}

	client = new LanguageClient("vls", "V Language Server", serverOptions, clientOptions)
	vscode.window.showInformationMessage("V Language Server is starting.")
	await client.start()
	vscode.window.showInformationMessage("V Language Server is now active.")
}

export async function activate(context: ExtensionContext): Promise<void> {
	// Register output channels so users can open them even without VLS.
	context.subscriptions.push(outputChannel, vlsOutputChannel)

	// Register commands regardless of whether VLS is enabled. Some commands
	// (run/fmt/prod/ver) don't require the language server at all.
	await registerCommands(context)

	// Only start the language server if the user enabled it in settings.
	if (isVlsEnabled()) {
		try {
			await createAndStartClient()
			registerVlsCommands(context, client)
		} catch (err) {
			// If starting the client fails, log and continue. Users can still
			// use non-LSP features of the extension.
			console.error("Failed to start VLS:", err)
			vscode.window.showErrorMessage("Failed to start VLS. See output for details.")
			outputChannel.show()
		}
	} else {
		log("VLS is disabled in settings.")
	}

	// React to configuration changes: enable/disable or request restart.
	workspace.onDidChangeConfiguration(async (e: ConfigurationChangeEvent) => {
		const vlsEnabled = vlsConfig.get<boolean>("enable")

		if (e.affectsConfiguration("v.vls.enable")) {
			if (vlsEnabled && !client) {
				// Start the client now that the user enabled it.
				try {
					await createAndStartClient()
				} catch (err) {
					console.error("Failed to start VLS:", err)
					vscode.window.showErrorMessage("Failed to start VLS. See output for details.")
					outputChannel.show()
				}
			} else if (!vlsEnabled && client) {
				// Stop the client if it was running and the user disabled it.
				try {
					await client.stop()
				} catch {
					// ignore
				}
				client = undefined
			}
		} else if (e.affectsConfiguration("v.vls") && vlsEnabled && client) {
			void vscode.window
				.showInformationMessage(
					"VLS: Restart is required for changes to take effect. Would you like to proceed?",
					"Yes",
					"No",
				)
				.then(async (selected) => {
					if (selected == "Yes") {
						try {
							if (client) {
								await client.restart()
							}
						} catch {
							void vscode.window.showErrorMessage("Failed to restart VLS.")
						}
					}
				})
		}
	})
}

export function deactivate(): Promise<void> | undefined {
	if (!client) return undefined
	return client.stop()
}
