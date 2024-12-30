import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'group';

type Attributes = {
	GroupName: string,
	Precedence?: number,
	RoleArn?: string,
	UserPoolId: string,
};

let delete_ = ({ GroupName, UserPoolId }) => [
	`aws cognito-idp delete-group \\`,
	`  --group-name ${GroupName} \\`,
	`  --user-pool-id ${UserPoolId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshByName = (groupName, userPoolId) => [
	`GROUP_NAME=${groupName}`,
	`USER_POOL_ID=${userPoolId}`,
	`aws cognito-idp list-groups \\`,
	`  --group-name \${GROUP_NAME} \\`,
	`  --user-pool-id \${USER_POOL_ID} \\`,
	`  | jq '.Groups[] | select (.GroupName == "\${GROUP_NAME}")' | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { GroupName, Precedence, RoleArn, UserPoolId } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws cognito-idp create-group \\`,
			`  --group-name ${GroupName} \\`,
			...Precedence != null ? [`  --precedence ${Precedence} \\`] : [],
			...RoleArn != null ? [`  --role-arn ${RoleArn} \\`] : [],
			`  --user-pool-id ${UserPoolId} \\`,
			`  | jq .Group | tee ${statesDirectory}/\${KEY}`,
		);
		state = { GroupName, Precedence, UserPoolId };
	}

	let updates = Object
	.entries({
		Precedence: r => r != null ? [`--precedence ${r}`] : [],
		RoleArn: r => r != null ? [`--role-arn ${r}`] : [],
	})
	.flatMap(([prop, transform]) => {
		let source = transform(state[prop]);
		let target = transform(attributes[prop]);
		let same = source.length === target.length;
		if (same) {
			for (let i = 0; i < source.length; i++) same &&= source[i] === target[i];
		}
		return same ? [] : target;
	});

	if (updates.length > 0) {
		updates.push(`--group-name ${GroupName}`);
		updates.push(`--user-pool-id ${UserPoolId}`);
		commands.push(
			`aws cognito-idp update-group \\`,
			...updates.sort((a, b) => a.localeCompare(b)).map(s => `  ${s} \\`),
			`  | jq -r .Group | tee ${statesDirectory}/\${KEY}`,
		);
	}

	return commands;
};

export let groupClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { GroupName, UserPoolId } }: Resource_<Attributes>) => [
		class_,
		name,
		UserPoolId,
		createHash('sha256').update([
			GroupName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ GroupName, UserPoolId }) => refreshByName(GroupName, UserPoolId),
	upsert,
};

import { create } from "../../warrior";

export let createGroup = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getId: (get: (resource: any, prop: string) => string) => get(resource, 'Id'),
	};
};
