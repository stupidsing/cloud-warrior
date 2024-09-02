import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'policy';

type Attributes = {
	Description: string,
	PolicyDocument: string,
	PolicyName: string,
};

let delete_ = (state, key: string) => [
	`aws iam delete-policy \\`,
	`  --policy-arn ${state.Arn} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes: { Description, PolicyDocument, PolicyName }, key } = resource;
	let commands = [];

	let PolicyArn = `$(cat ${getStateFilename(key)} | jq -r .Arn)`;

	if (state == null) {
		commands.push(
			`aws iam create-policy \\`,
			`  --description ${Description} \\`,
			`  --policy-document ${PolicyDocument} \\`,
			`  --policy-name ${PolicyName} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'policy', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' | jq .Policy | tee ${getStateFilename(key)}`,
			`aws iam wait policy-exists --policy-arn ${PolicyArn}`,
		);
		state = { Description, PolicyDocument, PolicyName };
	}

	return commands;
};

export let policyClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
		attributes.PolicyName,
		attributes.Description,
	].join('_'),
	refresh: ({ PolicyArn }, key: string) => [
		`ARN=${PolicyArn}`,
		`aws iam get-policy \\`,
		`  --policy-arn \${ARN} \\`,
		`  | jq .Policy | tee ${getStateFilename(key)}`,
	],
	upsert,
};

import { create } from "./warrior";

export let createPolicy = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getArn: get => get(resource, 'Arn'),
	};
};
