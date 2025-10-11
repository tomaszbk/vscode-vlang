import { getVlsPath } from "langserver";
import vscode, { ExtensionContext } from "vscode";
import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
} from "vscode-languageclient/node";
import * as commands from "./commands";

export let client: LanguageClient;
/**
 * This method is called when the extension is activated.
 * @param context The extension context
 */
export async function activate(context: ExtensionContext): Promise<void> {
	// Get the configuration for our server.
	const config = vscode.workspace.getConfiguration("vls");
	const vlsPath = await getVlsPath();

	// ServerOptions tells the client how to launch our server.
	// We are launching it as a normal process and communicating via stdio.
	const serverOptions: ServerOptions = {
		run: { command: vlsPath },
		debug: { command: vlsPath }, // You can specify different flags for debugging
	};

	// ClientOptions controls the client-side of the connection.
	const clientOptions: LanguageClientOptions = {
		// Register the server for `v` documents.
		documentSelector: [{ scheme: "file", language: "v" }],
		// Synchronize the 'files' section of settings between client and server.
		synchronize: {
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.v"),
		},
	};

	// Create the language client.
	client = new LanguageClient("vls", "V Language Server", serverOptions, clientOptions);

	// Register commands and add them to the extension context so they are
	// disposed automatically when the extension deactivates.
	context.subscriptions.push(vscode.commands.registerCommand("v.run", commands.run));
	context.subscriptions.push(vscode.commands.registerCommand("v.fmt", commands.fmt));
	context.subscriptions.push(vscode.commands.registerCommand("v.ver", commands.ver));
	context.subscriptions.push(vscode.commands.registerCommand("v.prod", commands.prod));
	// Pass the language client to commands that need it.
	context.subscriptions.push(vscode.commands.registerCommand("v.vls.update", () => commands.updateVls(client)));
	context.subscriptions.push(vscode.commands.registerCommand("v.vls.restart", () => commands.restartVls(client)));

	// Start the client. This will also launch the server.
	vscode.window.showInformationMessage("V Language Server is starting.");
	await client.start();
	vscode.window.showInformationMessage("V Language Server is now active.");
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	// Stop the client. This will also terminate the server process.
	return client.stop();
}
