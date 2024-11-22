import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'user-pool';

type Attributes = {
	Id?: string,
	MfaConfiguration?: string,
	Name: string,
};

let delete_ = ({ Id }) => [
	`aws cognito-idp delete-user-pool \\`,
	`  --user-pool-id ${Id} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshById = id => [
	`ID=${id}`,
	`aws cognito-idp describe-user-pool \\`,
	`  --user-pool-id \${ID} \\`,
	`  | jq .UserPool | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Name } = attributes;
	let commands = [];

	let Id = `$(cat ${statesDirectory}/\${KEY} | jq -r .Id)`;

	if (state == null) {
		commands.push(
			`aws cognito-idp create-user-pool \\`,
			`  --pool-name ${Name} \\`,
			`  --user-pool-tags Key=Name,Value=${prefix}-${name} \\`,
			`  | jq .UserPool | tee ${statesDirectory}/\${KEY}`,
		);
		state = { Name };
	}

	{
		let prop = 'MfaConfiguration';
		let source = state[prop];
		let target = attributes[prop];
		if (source !== target) {
			commands.push(
				`aws cognito-idp update-user-pool \\`,
				`  --mfa-configuration ${target} \\`,
				`  --user-pool-id ${Id} \\`,
				`  | jq .UserPool | tee ${statesDirectory}/\${KEY}`,
			);
		}
	}

	return commands;
};

export let userPoolClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Name } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Name,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ Name }) => refreshById(Name),
	upsert,
};

import { create } from "../../warrior";

export let createUserPool = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getId: get => get(resource, 'Id'),
	};
};
