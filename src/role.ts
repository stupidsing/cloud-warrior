import { createHash } from "crypto";
import { PolicyDocument } from "./aws";
import { prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'role';

type Attributes = {
	AssumeRolePolicyDocument: PolicyDocument,
	Description?: string,
	RoleName: string,
};

let delete_ = ({ RoleName }, key: string) => [
	`aws iam delete-role \\`,
	`  --role-name ${RoleName} &&`,
	`rm -f \${STATE}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { AssumeRolePolicyDocument, Description, RoleName } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws iam create-role \\`,
			`  --assume-role-policy-document '${JSON.stringify(AssumeRolePolicyDocument)}' \\`,
			...Description != null ? [`  --description ${Description} \\`] : [],
			`  --role-name ${RoleName} \\`,
			`  --tags Key=Name,Value=${prefix}-${name} \\`,
			`  | jq .Role | tee \${STATE}`,
			`aws iam wait role-exists --role-name ${RoleName}`,
		);
		state = { AssumeRolePolicyDocument, Description, RoleName };
	}

	{
		let prop = 'AssumeRolePolicyDocument';
		let source = JSON.stringify(state[prop]);
		let target = JSON.stringify(attributes[prop]);
		if (source !== target) {
			commands.push(
				`aws iam update-assume-role-policy \\`,
				`  --policy-document '${JSON.stringify(AssumeRolePolicyDocument)}'`,
				`  --role-name ${RoleName}`,
				`echo ${attributes[prop]} | tee \${STATE}#${prop}`,
			);
		}
	}

	return commands;
};

export let roleClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			attributes.Description,
			attributes.RoleName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ RoleName }, key: string) => [
		`NAME=${RoleName}`,
		`aws iam get-role \\`,
		`  --role-name \${NAME} \\`,
		`  | jq .Role | tee \${STATE}`,
	],
	upsert,
};

import { create } from "./warrior";

export let createRole = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRoleId: get => get(resource, 'RoleId'),
		getRoleName: get => get(resource, 'RoleName'),
	};
};
