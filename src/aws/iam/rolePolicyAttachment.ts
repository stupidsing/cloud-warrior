import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'role-policy-attachment';

type Attributes = {
	PolicyArn: string,
	RoleName: string,
};

let delete_ = ({ PolicyArn, RoleName }) => [
	`aws iam detach-role-policy \\`,
	`  --policy-arn ${PolicyArn} \\`,
	`  --role-name ${RoleName} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = (PolicyArn, RoleName) => [
	// ??? get-role-policy is for inline policies only
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { PolicyArn, RoleName } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws iam attach-role-policy \\`,
			`  --policy-arn ${PolicyArn} \\`,
			`  --role-name ${RoleName}`,
			`echo '{ "PolicyArn": "${PolicyArn}", "RoleName": "${RoleName}" }' | jq . > ${statesDirectory}/\${KEY}`,
		);
		state = { RoleName, PolicyArn };
	}

	return commands;
};

export let rolePolicyAttachmentClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { PolicyArn, RoleName } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			PolicyArn,
			RoleName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ PolicyArn, RoleName }) => refresh(PolicyArn, RoleName),
	upsert,
};

import { create } from "../../warrior";

export let createRolePolicyAttachment = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
	};
};
