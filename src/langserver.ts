import * as os from "os"
import * as path from "path"
import { window } from "vscode"
import { log } from "./logger"
import { vlsConfig } from "./utils"

import { exec as _exec } from "child_process"
import { promises as fs } from "fs"
import { promisify } from "util"
import { config } from "utils"

const exec = promisify(_exec)

export const EXTENSION_ROOT_DIR =
	path.basename(__dirname) === "common"
		? path.dirname(path.dirname(__dirname))
		: path.dirname(__dirname)

export const BINARY_NAME = process.platform === "win32" ? "vls.exe" : "vls"

export const DEFAULT_VLS_PATH = config.get<boolean>("tmp")
	? path.join("/tmp", BINARY_NAME)
	: path.join(os.homedir(), ".local", "bin", BINARY_NAME) // ~/.local/bin/vls if not tmp enabled

export async function getVlsPath(): Promise<string> {
	const build = vlsConfig.get<boolean>("build")
	if (await isVlsInstalled()) {
		return DEFAULT_VLS_PATH
	}
	const selected = await window.showInformationMessage(
		"VLS is not installed. Do you want to install it now?",
		"Yes",
		"No",
	)
	if (selected === "No") {
		throw new Error("VLS is required but not installed.")
	}

	if (!build) {
		return await installVls()
	}
	return await buildVls()
}

export function isVlsEnabled(): boolean {
	return vlsConfig.get<boolean>("enable") ?? false
}

export async function isVlsInstalled(): Promise<boolean> {
	try {
		// Check if file exists
		await fs.access(DEFAULT_VLS_PATH)
		log(`Using existing VLS at ${DEFAULT_VLS_PATH}`)
		return true
	} catch {
		// File doesn't exist — ignore and proceed to build/install
		return false
	}
}

export function installVls(): Promise<string> {
	// TODO: Install latest vls from github once there are releases
	return Promise.reject(
		new Error("VLS builds not yet available. Please enable vls.build in settings."),
	)
}

export async function buildVls(): Promise<string> {
	const tmpDir = "/tmp/vls"
	try {
		log("Building VLS...")
		window.showInformationMessage("Building VLS...")
		await exec(`rm -rf ${tmpDir}`)
		await exec(`git clone https://github.com/vlang/vls.git ${tmpDir}`)
		await exec(`cd ${tmpDir} && v .`)

		// Ensure target dir exists
		await fs.mkdir(path.dirname(DEFAULT_VLS_PATH), { recursive: true })

		// Copy binary
		await exec(`cp ${path.join(tmpDir, BINARY_NAME)} ${DEFAULT_VLS_PATH}`)

		log(`VLS built and installed at ${DEFAULT_VLS_PATH}`)
		return DEFAULT_VLS_PATH
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err)
		throw new Error(`Failed to build or install VLS: ${message}`)
	}
}
