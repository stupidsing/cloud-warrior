import { getStateFilename, prefix } from "./constants";
import { Class, Resource } from "./types";

let class_ = 'security-group';

let delete_ = (state, key: string) => [
	`aws ec2 delete-security-group \\`,
	`  --group-id ${state.GroupId} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshById = (key, id) => [
	`ID=${id}`,
	`aws ec2 describe-security-groups \\`,
	`  --group-ids \${ID} \\`,
	`  | jq .SecurityGroups[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource) => {
	let { name, attributes: { Description, GroupName, VpcId }, key } = resource;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ec2 create-security-group \\`,
			`  --description ${Description} \\`,
			`  --group-name ${GroupName} \\`,
			`  --vpc-id ${VpcId} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'security-group', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' | tee ${getStateFilename(key)}`,
			...refreshById(key, `$(cat ${getStateFilename(key)} | jq -r .GroupId)`),
		);
		state = { Description, GroupName, VpcId };
	}

	let GroupId = `$(cat ${getStateFilename(key)} | jq -r .GroupId)`;

	return commands;
};

export let securityGroupClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource) => [
		prefix,
		class_,
		name,
		attributes.VpcId,
		attributes.GroupName,
		attributes.Description,
	].join('_'),
	refresh: ({ GroupId }, key: string) => refreshById(key, GroupId),
	upsert,
};

import { create } from "./warrior";

export let createSecurityGroup = (name, f) => create(class_, name, f);
