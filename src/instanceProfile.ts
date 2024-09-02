import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'instance-profile';

type Attributes = {
	InstanceProfileName: string,
};

let delete_ = (state, key: string) => [
	`aws iam delete-instance-profile \\`,
	`  --instance-profile-name ${state.InstanceProfileName} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes: { InstanceProfileName }, key } = resource;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws iam create-instance-profile \\`,
			`  --instance-profile-name ${InstanceProfileName} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'instance-profile', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' | jq .InstanceProfile | tee ${getStateFilename(key)}`,
			`aws iam wait instance-profile-exists --instance-profile-name ${InstanceProfileName}`,
		);
		state = { InstanceProfileName };
	}

	return commands;
};

export let instanceProfileClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
		attributes.InstanceProfileName,
	].join('_'),
	refresh: ({ InstanceProfileName }, key: string) => [
		`NAME=${InstanceProfileName}`,
		`aws iam get-instance-profile \\`,
		`  --instance-profile-name \${NAME} \\`,
		`  | jq .InstanceProfile | tee ${getStateFilename(key)}`,
	],
	upsert,
};

import { create } from "./warrior";

export let createInstanceProfile = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getArn: get => get(resource, 'Arn'),
		getInstanceProfileId: get => get(resource, 'InstanceProfileId'),
		getInstanceProfileName: get => get(resource, 'InstanceProfileName'),
	};
};
