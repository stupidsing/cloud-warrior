import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'internet-gateway';

type Attributes = {
};

let delete_ = ({ InternetGatewayId }, key: string) => [
	`aws ec2 delete-internet-gateway \\`,
	`  --internet-gateway-id ${InternetGatewayId} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes: {}, key } = resource;
	let commands = [];

	let InternetGatewayId = `$(cat ${getStateFilename(key)} | jq -r .InternetGatewayId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-internet-gateway \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'internet-gateway', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | jq .InternetGateways[0] | tee ${getStateFilename(key)}`,
			`aws ec2 wait internet-gateway-exists --internet-gateway-ids ${InternetGatewayId}`,
		);
		state = {};
	}

	return commands;
};

export let internetGatewayClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
	].join('_'),
	refresh: ({ InternetGatewayId }, key: string) => [
		`ID=${InternetGatewayId}`,
		`aws ec2 describe-internet-gateways \\`,
		`  --internet-gateway-ids \${ID} \\`,
		`  | jq .InternetGateways[0] | tee ${getStateFilename(key)}`,
	],
	upsert,
};

import { create } from "./warrior";

export let createInternetGateway = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getInternetGatewayId: get => get(resource, 'InternetGatewayId'),
	};
};
