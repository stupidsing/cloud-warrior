import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'eventSourceMapping';

type Attributes = {
	BatchSize?: number,
	Enabled?: boolean,
	FunctionName: string,
};

let delete_ = ({ UUID }) => [
	`aws lambda delete-event-source-mapping \\`,
	`  --uuid ${UUID} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { FunctionName } = attributes;
	let commands = [];

	let UUID = `$(cat ${statesDirectory}/\${KEY} | jq -r .UUID)`;

	if (state == null) {
		commands.push(
			`aws lambda create-event-source-mapping \\`,
			`  --function-name ${FunctionName} \\`,
			`  --tags '${JSON.stringify([
				{ Key: 'Name', Value: `${prefix}-${name}` },
			])}' \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
		);
		state = { FunctionName };
	}

	let updates = Object
	.entries({
		BatchSize: r => [`--batch-size ${r}`],
		Enabled: r => [r == null || r === true ? `--enabled` : `--no-enabled`],
		FunctionName: r => [`--function-name ${r}`],
	})
	.flatMap(([prop, transform]) => {
		let source = transform(state[prop]);
		let target = transform(attributes[prop]);
		let same = source.length === target.length;
		if (same) {
			for (let i = 0; i < source.length; i++) same &&= source[i] === target[i];
		}
		return !same ? transform(target).map(s => `  ${s} \\`) : [];
	});

	if (updates.length > 0) {
		updates.push(`  --uuid ${UUID} \\`);
		commands.push(
			`aws lambda update-event-source-mapping-configuration \\`,
			...updates.sort((a, b) => a.localeCompare(b)),
			`  | tee ${statesDirectory}/\${KEY}`,
		);
	}

	return commands;
};

export let eventSourceMappingClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {} }: Resource_<Attributes>) => [
		class_,
		name,
	].join('_'),
	refresh: ({ UUID }) => [
		`UUID=${UUID}`,
		`aws lambda get-event-source-mappings \\`,
		`  --uuid \${UUID} \\`,
		`  | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createEventSourceMapping = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getUUID: get => get(resource, 'UUID'),
	};
};
