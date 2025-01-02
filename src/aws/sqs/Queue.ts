import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'queue';

type Attributes = {
	Attributes?: {
		ContentBasedDeduplication?: boolean,
		DeduplicationScope?: 'message' | 'queue',
		DelaySeconds?: number,
		FifoQueue?: boolean,
		FifoThroughputLimit?: 'perMessageGroupId' | 'perQueue',
		KmsDataKeyReusePeriodSeconds?: number,
		KmsMasterKeyId?: string,
		MaximumMessageSize?: number,
		MessageRetentionPeriod?: number,
		Policy?: string,
		ReceiveMessageWaitTimeSeconds?: number,
		RedrivePolicy?: string,
		RedriveAllowPolicy?: string,
		SqsManagedSseEnabled?: boolean,
		VisibilityTimeout?: number,
	},
	QueueName: string,
};

let delete_ = ({ QueueUrl }) => [
	`aws sqs delete-queue \\`,
	`  --queue-url ${QueueUrl} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = Name => [
	/*
	`NAME=${Name}`,
	`aws sqs list-queues \\`,
	`  --queue-name-prefix \${NAME} \\`,
	`  | tee ${statesDirectory}/\${KEY}`,
	*/
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Attributes, QueueName } = attributes;
	let commands = [];

	let queueUrl = `$(cat ${statesDirectory}/\${KEY} | jq -r .QueueUrl)`;

	if (state == null) {
		commands.push(
			`aws sqs create-queue \\`,
			...Attributes != null ? [`  --attributes '${JSON.stringify(attributes.Attributes)}' \\`] : [],
			`  --queue-name ${QueueName}`,
			`echo '${JSON.stringify(attributes)}' > ${statesDirectory}/\${KEY}`,
		);
		state = { Attributes, QueueName };
	}

	return commands;
};

export let queueClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Attributes, QueueName } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			JSON.stringify(Attributes),
			QueueName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ QueueUrl }) => refresh(QueueUrl),
	upsert,
};

import { create } from "../../warrior";

export let createQueue = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getId: (get: (resource: any, prop: string) => string) => get(resource, 'Id'),
	};
};
