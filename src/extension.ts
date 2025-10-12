import { outputChannel, vlsOutputChannel } from "debug"
import { getVlsPath } from "langserver"
import vscode, { ConfigurationChangeEvent, ExtensionContext, workspace } from "vscode"
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node"
import * as commands from "./commands"

export let client: LanguageClient
/**
 * This method is called when the extension is activated.
 * @param context The extension context
 */
export async function activate(context: ExtensionContext): Promise<void> {
	// Get the configuration for our server.
	const vlsPath = await getVlsPath()

	// ServerOptions tells the client how to launch our server.
	// We are launching it as a normal process and communicating via stdio.
	const serverOptions: ServerOptions = {
		run: { command: vlsPath },
		debug: { command: vlsPath }, // You can specify different flags for debugging
	}

	// ClientOptions controls the client-side of the connection.
	const clientOptions: LanguageClientOptions = {
		// Register the server for `v` documents.
		documentSelector: [{ scheme: "file", language: "v" }],
		outputChannel: vlsOutputChannel,
		// Synchronize the 'files' section of settings between client and server.
		synchronize: {
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.v"),
		},
	}

	// Create the language client.
	client = new LanguageClient("vls", "V Language Server", serverOptions, clientOptions)

	workspace.onDidChangeConfiguration(async (e: ConfigurationChangeEvent) => {
		if (e.affectsConfiguration("v.vls.enable")) {
			if (workspace.getConfiguration("v.vls").get("enable")) {
				await client.restart()
			} else {
				await client.stop()
			}
		} else if (
			e.affectsConfiguration("v.vls") &&
			workspace.getConfiguration("v.vls").get("enable")
		) {
			void vscode.window
				.showInformationMessage(
					"VLS: Restart is required for changes to take effect. Would you like to proceed?",
					"Yes",
					"No",
				)
				.then(async (selected) => {
					if (selected == "Yes") {
						await client.restart()
					}
				})
		}
	})

	// Register commands and add them to the extension context so they are
	// disposed automatically when the extension deactivates.
	context.subscriptions.push(
		outputChannel,
		vlsOutputChannel,
		vscode.commands.registerCommand("v.run", commands.run),
		vscode.commands.registerCommand("v.fmt", commands.fmt),
		vscode.commands.registerCommand("v.ver", commands.ver),
		vscode.commands.registerCommand("v.prod", commands.prod),

		// Pass the language client to commands that need it.

		vscode.commands.registerCommand("v.vls.update", () => commands.updateVls(client)),
		vscode.commands.registerCommand("v.vls.restart", () => commands.restartVls(client)),
		vscode.commands.registerCommand("v.vls.openOutput", () => {
			vlsOutputChannel.show()
		}),
	)

	// Start the client. This will also launch the server.
	vscode.window.showInformationMessage("V Language Server is starting.")
	await client.start()
	vscode.window.showInformationMessage("V Language Server is now active.")
}

export function deactivate(): Promise<void> | undefined {
	if (!client) {
		return undefined
	}
	// Stop the client. This will also terminate the server process.
	return client.stop()
}
