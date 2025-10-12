import { Uri, window, workspace, WorkspaceFolder } from "vscode"
const defaultCommand = "v"

export const config = workspace.getConfiguration("v")
export const vlsConfig = workspace.getConfiguration("v.vls")

/** Get V executable command.
 * Will get from user setting configuration first.
 * If user don't specify it, then get default command
 */
export function getVExecCommand(): string {
	return config.get<string>("executablePath", defaultCommand)
}

/** Get current working directory.
 * @param uri The URI of document
 */
export function getCwd(uri?: Uri): string {
	const folder = getWorkspaceFolder(uri || null)
	return folder.uri.fsPath
}

/** Get workspace of current document.
 * @param uri The URI of document
 */
export function getWorkspaceFolder(uri?: Uri): WorkspaceFolder {
	if (uri) {
		return workspace.getWorkspaceFolder(uri)
	} else if (window.activeTextEditor && window.activeTextEditor.document) {
		return workspace.getWorkspaceFolder(window.activeTextEditor.document.uri)
	} else {
		return workspace.workspaceFolders[0]
	}
}
