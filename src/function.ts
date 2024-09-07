import { createHash } from "crypto";
import { prefix, statesDirectory } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'function';

type Attributes = {
	FunctionName: string,
	Role: string,
	Runtime?: string,
};

let delete_ = ({ FunctionName }) => [
	`aws function delete-function \\`,
	`  --name ${FunctionName} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { FunctionName, Role, Runtime } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws function create-function \\`,
			`  --function-name ${FunctionName} \\`,
			`  --role ${Role} \\`,
			...Runtime != null ? [`  --runtime ${Runtime}`] : [],
			`  --tags '${JSON.stringify([
				{ Key: 'Name', Value: `${prefix}-${name}` },
			])}' \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
			`aws function wait function-exists \\`,
			`  --function-name ${FunctionName}`,
		);
		state = { FunctionName, Role, Runtime };
	}

	{
		let prop = 'Role';
		if (state[prop] !== attributes[prop]) {
			commands.push(
				`aws function update-function-configuration \\`,
				`  --function-name ${FunctionName} \\`,
				`  --role ${attributes[prop]} \\`,
				`  | tee ${statesDirectory}/\${KEY}`,
			);
		}
	}

	{
		let prop = 'Runtime';
		if (state[prop] !== attributes[prop]) {
			commands.push(
				`aws function update-function-configuration \\`,
				`  --function-name ${FunctionName} \\`,
				`  --runtime ${attributes[prop]} \\`,
				`  | tee ${statesDirectory}/\${KEY}`,
			);
		}
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
