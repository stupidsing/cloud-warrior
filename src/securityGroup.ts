import { getStateFilename, prefix } from "./constants";
import { Class, Resource } from "./types";

let class_ = 'security-group';

let delete_ = (state, key: string) => [
	`aws ec2 delete-security-group \\`,
	`  --group-name ${state.GroupName}`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshByGroupName = (key, groupName) => [
	`aws ec2 describe-security-groups \\`,
	`  --group-names ${groupName} \\`,
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
				{ ResourceType: 'securityGroup', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}'`,
			...refreshByGroupName(key, GroupName),
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
	refresh: ({ GroupName }, key: string) => refreshByGroupName(key, GroupName),
	upsert,
};

import { create } from "./warrior";

export let createSecurityGroup = (name, f) => create(class_, name, f);
