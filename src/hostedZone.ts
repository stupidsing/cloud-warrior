import { createHash } from "crypto";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'hostedZone';

type Attributes = {
	CallerReference: string,
	Name: string,
};

let delete_ = ({ Id }, key: string) => [
	`aws route53 delete-hosted-zone \\`,
	`  --id ${Id} &&`,
	`rm -f \${STATE}`,
];

let refreshById = (key, id) => [
	`ID=${id}`,
	`aws route53 get-hosted-zone \\`,
	`  --id \${ID} \\`,
	`  | jq .HostedZone | tee \${STATE}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { CallerReference, Name } = attributes;
	let commands = [];

	let HostedZoneId = `$(cat \${STATE} | jq -r .Id)`;

	if (state == null) {
		commands.push(
			`aws route53 create-hosted-zone \\`,
			`  --caller-reference ${CallerReference} \\`,
			`  --name ${Name} \\`,
			`  | jq .HostedZone | tee \${STATE}`,
		);
		state = { CallerReference, Name };
	}

	return commands;
};

export let hostedZoneClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			attributes.CallerReference,
			attributes.Name,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ HostedZoneId }, key: string) => refreshById(key, HostedZoneId),
	upsert,
};

import { create } from "./warrior";

export let createHostedZone = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getId: get => get(resource, 'Id'),
	};
};
