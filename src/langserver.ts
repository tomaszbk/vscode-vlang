import cp from "child_process"
import { once } from "events"
import * as path from "path"
import { ProgressLocation, window } from "vscode"
import { log, outputChannel } from "./debug"
import { getVExecCommand, getWorkspaceConfig } from "./utils"
export interface VlsLaunchConfiguration {
	mode: "stdio" | "tcp"
	command: string
	args: string[]
	tcpPort: number
	useRemoteServer: boolean
}

import { exec as _exec } from "child_process"
import { promises as fs } from "fs"
import os from "os"
import { promisify } from "util"

const exec = promisify(_exec)
const DEFAULT_VLS_PATH = path.join(os.homedir(), ".local", "bin", "vls")

type LauncherErrorPayload = { code: number; message: string }
type LauncherPayload = { message: string; error?: LauncherErrorPayload }

function isLauncherErrorPayload(value: unknown): value is LauncherErrorPayload {
	if (typeof value !== "object" || value === null) {
		return false
	}
	const candidate = value as { code?: unknown; message?: unknown }
	return typeof candidate.code === "number" && typeof candidate.message === "string"
}

function parseLauncherPayload(serialized: string): LauncherPayload | null {
	try {
		const parsed = JSON.parse(serialized) as unknown
		if (typeof parsed !== "object" || parsed === null) {
			return null
		}
		const candidate = parsed as { message?: unknown; error?: unknown }
		if (typeof candidate.message !== "string") {
			return null
		}
		if (candidate.error !== undefined && !isLauncherErrorPayload(candidate.error)) {
			return null
		}
		return {
			message: candidate.message,
			error: candidate.error as LauncherErrorPayload | undefined,
		}
	} catch {
		return null
	}
}

// Path to the root directory of this extension.
export const EXTENSION_ROOT_DIR =
	path.basename(__dirname) === "common"
		? path.dirname(path.dirname(__dirname))
		: path.dirname(__dirname)

// Name of the `vls` binary based on the current platform.
export const BINARY_NAME = process.platform === "win32" ? "vls.exe" : "vls"

// Path to the `vls` executable that is bundled with the extension.
export const BUNDLED_EXECUTABLE = path.join(EXTENSION_ROOT_DIR, "libs", "bin", BINARY_NAME)

export async function getVlsPath(): Promise<string> {
	const buildVls = getWorkspaceConfig().get<boolean>("vls.autoBuild", false)
	try {
		// Check if file exists
		await fs.access(DEFAULT_VLS_PATH)
		return DEFAULT_VLS_PATH
	} catch {
		// File doesn't exist — ignore and proceed to build/install
	}

	if (!buildVls) {
		// TODO: Install latest vls from github once there are releases
		throw new Error('VLS builds not yet available. Please enable "vls.autoBuild" in settings.')
	}
	const tmpDir = "/tmp/vls"
	try {
		console.log("Building VLS...")
		await exec(`rm -rf ${tmpDir}`)
		await exec(`git clone https://github.com/vlang/vls.git ${tmpDir}`)
		await exec(`cd ${tmpDir} && v .`)

		// Ensure target dir exists
		await fs.mkdir(path.dirname(DEFAULT_VLS_PATH), { recursive: true })

		// Copy binary
		await exec(`cp ${path.join(tmpDir, "vls")} ${DEFAULT_VLS_PATH}`)

		console.log(`✅ VLS built and installed at ${DEFAULT_VLS_PATH}`)
		return DEFAULT_VLS_PATH
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		throw new Error(`Failed to build or install VLS: ${message}`)
	}
}

function createLauncherArgs(...extra: string[]): string[] {
	const args = ["ls", "--json"]
	const customPath = getWorkspaceConfig().get<string>("vls.customPath")?.trim()
	if (customPath) {
		args.push("--path", customPath)
	}
	args.push(...extra)
	return args
}

function spawnLauncher(...args: string[]): cp.ChildProcess {
	const vexe = getVExecCommand()
	const finalArgs = createLauncherArgs(...args)
	log(`Spawning ${vexe} ${finalArgs.join(" ")}...`)
	return cp.spawn(vexe, finalArgs, { shell: true })
}

function receiveLauncherJsonData(cb: (payload: LauncherPayload) => void) {
	return (rawData: string | Buffer) => {
		const data = typeof rawData === "string" ? rawData : rawData.toString("utf8")
		const escaped = data.replace(/\\/g, "/")
		log(`[v ls] new data: ${data}\tescaped: ${escaped}`)
		const payload = parseLauncherPayload(escaped)
		if (!payload) {
			log(`[v ls] invalid payload: ${escaped}`)
			return
		}
		cb(payload)
	}
}

function receiveLauncherError(rawData: string | Buffer) {
	const msg = typeof rawData === "string" ? rawData : rawData.toString("utf8")
	const launcherMessage = `[v ls] error: ${msg}`
	log(launcherMessage)
	void window.showErrorMessage(launcherMessage)
}

export function isVlsEnabled(): boolean {
	return getWorkspaceConfig().get<boolean>("vls.enable") ?? false
}

export async function isVlsInstalled(): Promise<boolean> {
	let isInstalled = false
	const launcher = spawnLauncher("--check")

	launcher.stdout.on(
		"data",
		receiveLauncherJsonData(({ error, message }) => {
			if (error) {
				void window.showErrorMessage(`Error (${error.code}): ${error.message}`)
				return
			}
			if (!message.includes("not installed")) {
				isInstalled = true
			}
		}),
	)

	launcher.stderr.on("data", receiveLauncherError)
	await once(launcher, "close")
	return isInstalled
}

export async function checkVlsInstallation(): Promise<boolean> {
	const vlsInstalled = await isVlsInstalled()
	if (vlsInstalled) {
		return true
	}

	const selected = await window.showInformationMessage(
		"VLS is not installed. Do you want to install it now?",
		"Yes",
		"No",
	)
	if (selected === "Yes") {
		await installVls()
		return await isVlsInstalled()
	}
	return false
}

export async function installVls(update = false): Promise<void> {
	try {
		await window.withProgress(
			{
				location: ProgressLocation.Notification,
				title: update ? "Updating VLS" : "Installing VLS",
				cancellable: true,
			},
			async (progress, token) => {
				const launcher = spawnLauncher(update ? "--update" : "--install")
				token.onCancellationRequested(() => launcher.kill())

				launcher.stdout.on(
					"data",
					receiveLauncherJsonData((payload) => {
						if (payload.error) {
							void window.showErrorMessage(
								`Error (${payload.error.code}): ${payload.error.message}`,
							)
							return
						}
						if (
							payload.message.includes("was updated") ||
							payload.message.includes("was already updated")
						) {
							void window.showInformationMessage(payload.message)
						} else {
							progress.report({ message: payload.message })
						}
					}),
				)

				launcher.stderr.on("data", receiveLauncherError)
				await once(launcher, "close")
			},
		)
	} catch (error) {
		log(String(error))
		outputChannel.show()
		if (error instanceof Error) {
			await window.showErrorMessage(error.message)
		} else {
			await window.showErrorMessage("Failed installing VLS. See output for more information.")
		}
	}
}
