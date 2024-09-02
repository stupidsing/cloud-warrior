import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'security-group';

type Attributes = {
	Description: string,
	GroupName: string,
	VpcId: string,
};

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

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes: { Description, GroupName, VpcId }, key } = resource;
	let commands = [];

	let GroupId = `$(cat ${getStateFilename(key)} | jq -r .GroupId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-security-group \\`,
			`  --description ${Description} \\`,
			`  --group-name ${GroupName} \\`,
			`  --vpc-id ${VpcId} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'security-group', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | tee ${getStateFilename(key)}`,
			`aws ec2 wait security-group-exists --group-ids ${GroupId}`,
			...refreshById(key, GroupId),
		);
		state = { Description, GroupName, VpcId };
	}

	return commands;
};

export let securityGroupClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
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

export let createSecurityGroup = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getSecurityGroupId: get => get(resource, 'GroupId'),
	};
};
