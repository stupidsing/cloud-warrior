import { createHash } from "crypto";
import { prefix, statesDirectory } from "../constants";
import { AttributesInput, Class, Resource_ } from "../types";
import { PolicyDocument } from "./aws";

let class_ = 'role';

type Attributes = {
	AssumeRolePolicyDocument: PolicyDocument,
	Description?: string,
	RoleName: string,
};

let delete_ = ({ RoleName }) => [
	`aws iam delete-role \\`,
	`  --role-name ${RoleName} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { AssumeRolePolicyDocument, Description, RoleName } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws iam create-role \\`,
			`  --assume-role-policy-document '${JSON.stringify(AssumeRolePolicyDocument)}' \\`,
			...Description != null ? [`  --description ${Description} \\`] : [],
			`  --role-name ${RoleName} \\`,
			`  --tags Key=Name,Value=${prefix}-${name} \\`,
			`  | jq .Role | tee ${statesDirectory}/\${KEY}`,
			`aws iam wait \\`,
			`  role-exists --role-name ${RoleName}`,
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
				`echo ${attributes[prop]} | tee ${statesDirectory}/\${KEY}#${prop}`,
			);
		}
	}

	return commands;
};

export let roleClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Description, RoleName } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Description,
			RoleName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ RoleName }) => [
		`NAME=${RoleName}`,
		`aws iam get-role \\`,
		`  --role-name \${NAME} \\`,
		`  | jq .Role | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../warrior";

export let createRole = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRoleId: get => get(resource, 'RoleId'),
		getRoleName: get => get(resource, 'RoleName'),
	};
};
