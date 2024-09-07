import { prefix, statesDirectory } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'function';

type Attributes = {
	Name: string,
	Role: string,
	Runtime?: string,
};

let delete_ = ({ Name }) => [
	`aws function delete-function \\`,
	`  --name ${Name} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Name, Role, Runtime } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws function create-function \\`,
			`  --function-name ${Name} \\`,
			`  --role ${Role} \\`,
			...Runtime != null ? [`  --runtime ${Runtime}`] : [],
			`  --tags '${JSON.stringify([
				{ Key: 'Name', Value: `${prefix}-${name}` },
			])}' \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
			`aws function wait function-exists \\`,
			`  --function-name ${Name}`,
		);
		state = { Name, Role, Runtime };
	}

	{
		let prop = 'Role';
		if (state[prop] !== attributes[prop]) {
			commands.push(
				`aws function update-function-configuration \\`,
				`  --function-name ${Name} \\`,
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
				`  --function-name ${Name} \\`,
				`  --runtime ${attributes[prop]} \\`,
				`  | tee ${statesDirectory}/\${KEY}`,
			);
		}
	}

	return commands;
};

export let internetGatewayClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {} }: Resource_<Attributes>) => [
		class_,
		name,
	].join('_'),
	refresh: ({ Name }) => [
		`NAME=${Name}`,
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
