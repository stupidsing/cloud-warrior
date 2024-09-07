import { createHash } from "crypto";
import { AttributesInput, Class, Resource_ } from "../types";

let class_ = 'hostedZone';

type Attributes = {
	CallerReference: string,
	Name: string,
};

let delete_ = ({ Id }) => [
	`aws route53 delete-hosted-zone \\`,
	`  --id ${Id} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshById = id => [
	`ID=${id}`,
	`aws route53 get-hosted-zone \\`,
	`  --id \${ID} \\`,
	`  | jq .HostedZone | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { CallerReference, Name } = attributes;
	let commands = [];

	let HostedZoneId = `$(cat ${statesDirectory}/\${KEY} | jq -r .Id)`;

	if (state == null) {
		commands.push(
			`aws route53 create-hosted-zone \\`,
			`  --caller-reference ${CallerReference} \\`,
			`  --name ${Name} \\`,
			`  | jq .HostedZone | tee ${statesDirectory}/\${KEY}`,
		);
		state = { CallerReference, Name };
	}

	return commands;
};

export let hostedZoneClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { CallerReference, Name } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			CallerReference,
			Name,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ HostedZoneId }) => refreshById(HostedZoneId),
	upsert,
};

import { statesDirectory } from "../constants";
import { create } from "../warrior";

export let createHostedZone = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getId: get => get(resource, 'Id'),
	};
};
