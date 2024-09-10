import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'ip-set';

type Attributes = {
	Addresses: string[],
	Description?: string,
	IPAddressVersion: 'IPV4' | 'IPV6',
	Name: string,
	Scope: 'CLOUDFRONT' | 'REGIONAL',
};

let delete_ = ({ Id, Name, Scope }) => [
	`aws wafv2 delete-ip-set \\`,
	`  --id ${Id} \\`,
	`--lock-token \$(aws wafv2 get-ip-set --id ${Id} --name ${Name} --scope ${Scope} | jq -r .LockToken)`,
	`  --name ${Name} \\`,
	`  --scope ${Scope} &&`,
	`rm -f ${statesDirectory}/\${KEY} ${statesDirectory}/\${KEY}#Scope`,
];

let refreshById = (id, name, scope) => [
	`ID=${id} NAME=${name} SCOPE=${scope}`,
	`aws wafv2 get-ip-set \\`,
	`  --id \${ID} \\`,
	`  --name \${NAME} \\`,
	`  --scope \${SCOPE} \\`,
	`  | jq .IPSet | tee ${statesDirectory}/\${KEY}`,
	`echo ${scope} > ${statesDirectory}/\${KEY}#Scope`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Addresses, IPAddressVersion, Name, Scope } = attributes;
	let commands = [];

	let Id = `$(cat ${statesDirectory}/\${KEY} | jq -r .Id)`;

	if (state == null) {
		commands.push(
			`aws wafv2 create-ip-set \\`,
			`  --addresses ${Addresses} \\`,
			`  --ip-address-version ${IPAddressVersion} \\`,
			`  --name ${Name} \\`,
			`  --scope ${Scope} \\`,
			`  --tags Key=Name,Value=${prefix}-${name} \\`,
			`  | jq .Summary | tee ${statesDirectory}/\${KEY}`,
			...refreshById(Id, Name, Scope),
		);
		state = { Addresses, IPAddressVersion, Name, Scope };
	}

	let updates = Object
	.entries({
		Description: r => [`--description '${r}'`],
	})
	.flatMap(([prop, transform]) => {
		let source = transform(state[prop]);
		let target = transform(attributes[prop]);
		let same = source.length === target.length;
		if (same) {
			for (let i = 0; i < source.length; i++) same &&= source[i] === target[i];
		}
		return !same ? transform(target) : [];
	});

	if (updates.length > 0) {
		updates.push(`--addresses ${Addresses}`);
		updates.push(`--id ${Id}`);
		updates.push(`--lock-token \$(aws wafv2 get-ip-set --id ${Id} --name ${Name} --scope ${Scope} | jq -r .LockToken)`);
		updates.push(`--name ${Name}`);
		updates.push(`--scope ${Scope}`);
		commands.push(
			`aws wafv2 update-ip-set \\`,
			...updates.sort((a, b) => a.localeCompare(b)).map(s => `  ${s} \\`).map(s => `  ${s} \\`),
			`  | tee ${statesDirectory}/\${KEY}`,
		);
	}

	return commands;
};

export let ipSetClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { IPAddressVersion, Name, Scope } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			IPAddressVersion,
			Name,
			Scope,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ Id, Name, Scope }) => refreshById(Id, Name, Scope),
	upsert,
};

import { create } from "../../warrior";

export let createIpSet = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getId: get => get(resource, 'Id'),
	};
};
