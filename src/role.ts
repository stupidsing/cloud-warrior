import { PolicyDocument } from "./aws";
import { getStateFilename, prefix } from "./constants";
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
	`rm -f ${getStateFilename(key)}`,
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
			`  --tags Key=Name,Value='${prefix}-${name}' \\`,
			`  | jq .Role | tee ${getStateFilename(key)}`,
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
				`echo ${attributes[prop]} | tee ${getStateFilename(key)}#${prop}`,
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
		attributes.RoleName,
		attributes.Description,
	].join('_'),
	refresh: ({ RoleName }, key: string) => [
		`NAME=${RoleName}`,
		`aws iam get-role \\`,
		`  --role-name \${NAME} \\`,
		`  | jq .Role | tee ${getStateFilename(key)}`,
	],
	upsert,
};

import { create } from "./warrior";

export let createRole = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getRoleId: get => get(resource, 'RoleId'),
		getRoleName: get => get(resource, 'RoleName'),
	};
};
