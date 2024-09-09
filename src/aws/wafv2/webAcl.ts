import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'web-acl';

type Attributes = {
	DefaultAction: {
		Allow: {
			CustomRequestHandling: {
				InsertHeaders: { Name: string, Value: string }[],
			},
		},
		Block: {
			CustomResponse: {
				CustomResponseBodyKey: string,
				ResponseCode: number,
				ResponseHeaders: { Name: string, Value: string }[],
			},
		},
	},
	Name: string,
	Scope: string,
};

let delete_ = ({ Id, Name, Scope }) => [
	`aws wafv2 delete-web-acl \\`,
	`  --id ${Id} \\`,
	`  --name ${Name} \\`,
	`  --scope ${Scope} &&`,
	`rm -f ${statesDirectory}/\${KEY} ${statesDirectory}/\${KEY}#Scope`,
];

let refreshById = (id, name, scope) => [
	`ID=${id} NAME=${name} SCOPE=${scope}`,
	`aws wafv2 get-web-acl \\`,
	`  --id \${ID} \\`,
	`  --name \${NAME} \\`,
	`  --scope \${SCOPE} \\`,
	`  | jq .WebACL | tee ${statesDirectory}/\${KEY}`,
	`echo ${scope} > ${statesDirectory}/\${KEY}#Scope`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { DefaultAction, Name, Scope } = attributes;
	let commands = [];

	let Id = `$(cat ${statesDirectory}/\${KEY} | jq -r .Id)`;

	if (state == null) {
		commands.push(
			`aws wafv2 create-web-acl \\`,
			`  --default-action '${JSON.stringify(DefaultAction)}' \\`,
			`  --name ${Name} \\`,
			`  --scope ${Scope} \\`,
			`  --tags Key=Name,Value=${prefix}-${name} \\`,
			`  | jq .Summary | tee ${statesDirectory}/\${KEY}`,
			...refreshById(Id, Name, Scope),
		);
		state = { DefaultAction, Name, Scope };
	}

	{
		let prop = 'DefaultAction';
		let source = JSON.stringify(state[prop]);
		let target = JSON.stringify(attributes[prop]);
		if (source !== target) {
			commands.push(
				`aws wafv2 update-web-acl \\`,
				`  --default-action '${target}' \\`,
				`  --id \${ID} \\`,
				`  --name ${Name} \\`,
				`  --scope ${Scope}`,
				...refreshById(Id, Name, Scope),
		);
		}
	}

	return commands;
};

export let webAclClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { DefaultAction, Name, Scope } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Name,
			Scope,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ Id, Name, Scope }) => refreshById(Id, Name, Scope),
	upsert,
};

import { create } from "../../warrior";

export let createWebAcl = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getId: get => get(resource, 'Id'),
	};
};
