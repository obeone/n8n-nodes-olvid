import { OlvidClient } from './client/OlvidClient';

export function formatFileSize(bytes: bigint): string {
	const sizes = ['bytes', 'kB', 'MB', 'GB'];
	let sizeIndex = 0;
	let fileSize = Number(bytes);

	while (fileSize >= 1000 && sizeIndex < sizes.length - 1) {
		fileSize /= 1000;
		sizeIndex++;
	}

	const formattedSize = sizeIndex === 0 ? `${fileSize.toFixed(0)}` : `${fileSize.toFixed(2)}`;

	return `${formattedSize} ${sizes[sizeIndex]}`;
}

/**
 * Verify that the Olvid daemon is reachable.
 *
 * Args:
 *     client (OlvidClient): Client used to query the daemon.
 *
 * Returns:
 *     boolean: True if the daemon responds, false otherwise.
 */
export async function verifyDaemonConnection(client: OlvidClient): Promise<boolean> {
	try {
		await client.identityGet({});
		return true;
	} catch {
		return false;
	}
}

/**
 * Start a listener and automatically retry if it stops.
 *
 * Args:
 *     start (Function): Function creating the listener. It receives an end
 *         callback that must be called when the listener ends and returns a
 *         function to stop the listener.
 *     check (Function): Function verifying that the daemon connection is
 *         active.
 *     interval (number): Delay in milliseconds between retries.
 *
 * Returns:
 *     Function: Function used to stop the listener and pending retries.
 */
export function listenWithRetry(
	start: (onEnd: (error?: Error) => void) => Function,
	check: () => Promise<boolean>,
	interval: number,
): Function {
	let stopFn: Function | undefined;
	let stopped = false;

	const run = async (): Promise<void> => {
		if (stopped) return;
		if (!(await check())) {
			setTimeout(() => void run(), interval);
			return;
		}
		stopFn = start(() => {
			if (!stopped) {
				setTimeout(() => void run(), interval);
			}
		});
	};

	void run();

	return () => {
		stopped = true;
		stopFn?.();
	};
}
