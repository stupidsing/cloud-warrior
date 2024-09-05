import { createHash } from "crypto";
import { prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";
import { difference } from "./utils";

let class_ = 'instance-profile';

type Attributes = {
	InstanceProfileName: string,
	Roles: { RoleName: string }[],
};

let updateRoles = ({ InstanceProfileName }, roles0, roles1) => {
	let source = new Set<string>(roles0.map(r => r.RoleName));
	let target = new Set<string>(roles1.map(r => r.RoleName));
	let commands = [];
	let needRefresh = false;

	difference(target, source).forEach(RoleName => {
		commands.push(
			`aws iam add-role-to-instance-profile \\`,
			`  --instance-profile-name ${InstanceProfileName} \\`,
			`  --role-name ${RoleName}`,
		);
		needRefresh = true;
	});

	difference(source, target).forEach(RoleName => {
		commands.push(
			`aws iam remove-role-from-instance-profile \\`,
			`  --instance-profile-name ${InstanceProfileName} \\`,
			`  --role-name ${RoleName}`,
		);
		needRefresh = true;
	});

	return { commands, needRefresh };
};

let delete_ = (state, key: string) => [
	...updateRoles(state, state.Roles, []).commands,
	`aws iam delete-instance-profile \\`,
	`  --instance-profile-name ${state.InstanceProfileName} &&`,
	`rm -f \${STATE}`,
];

let refreshByName = (key, name) => [
		`NAME=${name}`,
		`aws iam get-instance-profile \\`,
		`  --instance-profile-name \${NAME} \\`,
		`  | jq .InstanceProfile | tee \${STATE}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { InstanceProfileName } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws iam create-instance-profile \\`,
			`  --instance-profile-name ${InstanceProfileName} \\`,
			`  --tags Key=Name,Value=${prefix}-${name} \\`,
			`  | jq .InstanceProfile | tee \${STATE}`,
			`aws iam wait instance-profile-exists --instance-profile-name ${InstanceProfileName}`,
		);
		state = { InstanceProfileName, Roles: [] };
	}

	{
		let prop = 'Roles';
		let { commands: commands_, needRefresh } = updateRoles(attributes, state[prop], attributes[prop]);

		if (needRefresh) {
			commands.push(...commands_, ...refreshByName(key, InstanceProfileName));
		}
	}

	return commands;
};

export let instanceProfileClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			attributes.InstanceProfileName,
		].join('_')).digest('base64').slice(0, 4),
	].join('_'),
	refresh: ({ InstanceProfileName }, key: string) => refreshByName(key, InstanceProfileName),
	upsert,
};

import { create } from "./warrior";

export let createInstanceProfile = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: get => get(resource, 'Arn'),
		getInstanceProfileId: get => get(resource, 'InstanceProfileId'),
		getInstanceProfileName: get => get(resource, 'InstanceProfileName'),
	};
};
