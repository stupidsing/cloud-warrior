import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'security-group';

type Attributes = {
	Description: string,
	GroupName: string,
	VpcId: string,
};

let delete_ = ({ GroupId }) => [
	`aws ec2 delete-security-group \\`,
	`  --group-id ${GroupId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = GroupId => [
	`ID=${GroupId}`,
	`aws ec2 describe-security-groups \\`,
	`  --group-ids \${ID} \\`,
	`  | jq .SecurityGroups[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Description, GroupName, VpcId } = attributes;
	let commands = [];

	let GroupId = `$(cat ${statesDirectory}/\${KEY} | jq -r .GroupId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-security-group \\`,
			`  --description '${Description}' \\`,
			`  --group-name ${GroupName} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  --vpc-id ${VpcId} \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
			`aws ec2 wait \\`,
			`  security-group-exists --group-ids ${GroupId}`,
			...refresh(GroupId),
		);
		state = { Description, GroupName, VpcId };
	}

	return commands;
};

export let securityGroupClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Description, GroupName, VpcId } }: Resource_<Attributes>) => [
		class_,
		name,
		VpcId,
		createHash('sha256').update([
			Description,
			GroupName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ GroupId }) => refresh(GroupId),
	upsert,
};

import { create } from "../../warrior";

export let createSecurityGroup = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getSecurityGroupId: (get: (resource: any, prop: string) => string) => get(resource, 'GroupId'),
	};
};
