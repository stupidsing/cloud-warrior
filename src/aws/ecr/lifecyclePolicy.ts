import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'lifecycle-policy';

type Attributes = {
	lifecyclePolicyText: string,
	repositoryName: string,
};

let delete_ = ({ repositoryName }) => [
	`aws ecr delete-lifecycle-policy \\`,
	`  --repository-name ${repositoryName} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshByName = name => [
	`NAME=${name}`,
	`aws ecr get-lifecycle-policy \\`,
	`  --repository-name \${NAME} \\`,
	`  | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { lifecyclePolicyText, repositoryName } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ecr put-lifecycle-policy \\`,
			...lifecyclePolicyText != null ? [`  --lifecycle-policy-text '${lifecyclePolicyText}' \\`] : [],
			`  | tee ${statesDirectory}/\${KEY}`,
		);
		state = { lifecyclePolicyText, repositoryName };
	}

	return commands;
};

export let lifecyclePolicyClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { lifecyclePolicyText, repositoryName } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			lifecyclePolicyText,
			repositoryName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ repositoryName }) => refreshByName(repositoryName),
	upsert,
};

import { create } from "../../warrior";

export let createLifecyclePolicy = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
	};
};
