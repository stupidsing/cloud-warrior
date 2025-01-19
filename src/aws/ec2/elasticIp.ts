import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'elastic-ip';

type Attributes = {
	Domain?: 'standard' | 'vpc',
};

let delete_ = ({ AllocationId }) => [
	`aws ec2 release-address \\`,
	`  --allocation-id ${AllocationId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Domain } = attributes;
	let commands = [];

	let AllocationId = `$(cat ${statesDirectory}/\${KEY} | jq -r .AllocationId)`;

	if (state == null) {
		commands.push(
			`aws ec2 allocate-address \\`,
			...Domain != null ? [`  --domain ${Domain} \\`] : [],
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
		);
		state = { Domain };
	}

	return commands;
};

export let elasticIpClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {} }: Resource_<Attributes>) => [
		class_,
		name,
	].join('_'),
	refresh: ({ AllocationId }) => [
		`ID=${AllocationId}`,
		`aws ec2 describe-addresses \\`,
		`  --allocation-ids \${ID} \\`,
		`  | jq .Addresses[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createElasticIp = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getAllocationId: (get: (resource: any, prop: string) => string) => get(resource, 'AllocationId'),
		getPublicIp: (get: (resource: any, prop: string) => string) => get(resource, 'PublicIp'),
	};
};
