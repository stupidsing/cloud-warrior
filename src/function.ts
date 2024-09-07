import { createHash } from "crypto";
import { prefix, statesDirectory } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'function';

type Attributes = {
	Environment?: Record<string, string>,
	FunctionName: string,
	Handler?: string,
	MemorySize?: number,
	Role: string,
	Runtime?: string,
	Timeout?: number,
};

let delete_ = ({ FunctionName }) => [
	`aws function delete-function \\`,
	`  --name ${FunctionName} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { FunctionName, Role } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws function create-function \\`,
			`  --function-name ${FunctionName} \\`,
			`  --role ${Role} \\`,
			`  --tags '${JSON.stringify([
				{ Key: 'Name', Value: `${prefix}-${name}` },
			])}' \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
			`aws function wait function-exists \\`,
			`  --function-name ${FunctionName}`,
		);
		state = { FunctionName, Role };
	}

	let updates = Object.entries({
		Handler: 'handler',
		MemorySize: 'memory-size',
		Role: 'role',
		Runtime: 'runtime',
		Timeout: 'timeout',
	}).flatMap(([prop, arg]) => {
		if (state[prop] !== attributes[prop]) {
			return [`  --${arg} ${attributes[prop]} \\`];
		} else {
			return [];
		}
	});

	{
		let prop = 'Environment';
		let source = JSON.stringify(state[prop] ?? {});
		let target = JSON.stringify(attributes[prop] ?? {});
		if (source !== target) {
			updates.push(`  --environment ${target} \\`);
		}
	}

	if (updates.length > 0) {
		updates.push(`  --function-name ${FunctionName} \\`);
		commands.push(
			`aws function update-function-configuration \\`,
			...updates.sort((a, b) => a.localeCompare(b)),
			`  | tee ${statesDirectory}/\${KEY}`,
		);
	}

	return commands;
};

export let functionClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { FunctionName } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			FunctionName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ FunctionName }) => [
		`NAME=${FunctionName}`,
		`aws function get-functions \\`,
		`  --function-name \${NAME} \\`,
		`  | jq .Configuration | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "./warrior";

export let createFunction = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: get => get(resource, 'FunctionArn'),
		getName: get => get(resource, 'FunctionName'),
	};
};
