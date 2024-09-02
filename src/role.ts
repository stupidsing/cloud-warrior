import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource, Resource_ } from "./types";

let class_ = 'role';

type Attributes = {
	Description: string,
	RoleName: string,
};

let delete_ = (state, key: string) => [
	`aws iam delete-role \\`,
	`  --role-name ${state.RoleName} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshByName = (key, RoleName) => [
	`NAME=${RoleName}`,
	`aws iam get-role \\`,
	`  --role-name \${NAME} \\`,
	`  | jq .Role[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes: { Description, RoleName }, key } = resource;
	let commands = [];

	let RoleId = `$(cat ${getStateFilename(key)} | jq -r .RoleId)`;

	if (state == null) {
		commands.push(
			`aws iam create-role \\`,
			`  --description ${Description} \\`,
			`  --role-name ${RoleName} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'role', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' | tee ${getStateFilename(key)}`,
			`aws iam wait role-exists --role-name ${RoleName}`,
			...refreshByName(key, RoleName),
		);
		state = { Description, RoleName };
	}

	return commands;
};

export let roleClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource) => [
		prefix,
		class_,
		name,
		attributes.RoleName,
		attributes.Description,
	].join('_'),
	refresh: ({ RoleName }, key: string) => refreshByName(key, RoleName),
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
