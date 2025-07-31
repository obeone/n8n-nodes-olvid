import { ITriggerResponse, NodeOperationError, type ITriggerFunctions } from 'n8n-workflow';

import * as message from './message';
import * as attachment from './attachment';
import { OlvidClient } from '../../../client/OlvidClient';
import { defaultTriggerWaitTime, defaultTriggerRetryTime } from '../../../constants';
import { listenWithRetry, verifyDaemonConnection } from '../../../GenericFunctions';

export async function router(this: ITriggerFunctions): Promise<ITriggerResponse> {
	const credentials = (await this.getCredentials('olvidApi')) as {
		clientKey: string;
		daemonEndpoint: string;
	};
	const client = new OlvidClient(credentials.daemonEndpoint, credentials.clientKey);

	const listener = this.getNodeParameter('updates') as string;
	const useMockData = this.getNodeParameter('mockData') as boolean;

	const initializeListener = (
		callback?: () => void,
		returnMockData: boolean = false,
		endCallback?: (error?: Error) => void,
	): Function => {
		switch (listener) {
			case 'messageReceived':
				return message.messageReceived.call(this, client, callback, returnMockData, endCallback);
			case 'reactionAdded':
				return message.reactionAdded.call(this, client, callback, returnMockData, endCallback);
			case 'attachmentReceived':
				return attachment.attachmentReceived.call(
					this,
					client,
					callback,
					returnMockData,
					endCallback,
				);
			default:
				throw new NodeOperationError(this.getNode(), `Invalid trigger update type: ${listener}`);
		}
	};

	let closeListener: Function | undefined;
	if (this.getMode() !== 'manual') {
		closeListener = listenWithRetry(
			(endCb) => initializeListener(undefined, false, endCb),
			() => verifyDaemonConnection(client),
			defaultTriggerRetryTime,
		);
	}

	const closeFunction = async () => {
		closeListener?.();
	};

	const manualTriggerFunction = async () => {
		let manualCloseListener: Function = () => {};
		await new Promise((resolve, reject) => {
			const timeoutHandler = setTimeout(() => {
				resolve(
					new NodeOperationError(
						this.getNode(),
						`Aborted because no trigger arrived in last ${defaultTriggerWaitTime / 1000} seconds.`,
						{
							description: `This ${defaultTriggerWaitTime / 1000}-second timeout only applies to manually triggered executions. Active workflows listen indefinitely.`,
						},
					),
				);
			}, defaultTriggerWaitTime);

			const onCallback = () => {
				clearTimeout(timeoutHandler);
				resolve(true);
			};

			manualCloseListener = initializeListener(onCallback, useMockData);
		});
		manualCloseListener();
	};

	return {
		closeFunction,
		manualTriggerFunction,
	};
}
