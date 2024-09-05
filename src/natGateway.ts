import { prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'nat-gateway';

type Attributes = {
	SubnetId: string,
};

let delete_ = ({ NatGatewayId }, key: string) => [
	`aws ec2 delete-nat-gateway \\`,
	`  --nat-gateway-id ${NatGatewayId} &&`,
	`rm -f \${STATE}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { SubnetId } = attributes;
	let commands = [];

	let NatGatewayId = `$(cat \${STATE} | jq -r .NatGatewayId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-nat-gateway \\`,
			`  --subnet-id ${SubnetId} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'nat-gateway', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | jq .NatGateway | tee \${STATE}`,
			`aws ec2 wait nat-gateway-available --nat-gateway-ids ${NatGatewayId}`,
		);
		state = { SubnetId };
	}

	return commands;
};

export let natGatewayClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		class_,
		name,
		attributes.SubnetId,
	].join('_'),
	refresh: ({ NatGatewayId }, key: string) => [
		`ID=${NatGatewayId}`,
		`aws ec2 describe-nat-gateways \\`,
		`  --nat-gateway-ids \${ID} \\`,
		`  | jq .NatGateways[0] | tee \${STATE}`,
	],
	upsert,
};

import { create } from "./warrior";

export let createNatGateway = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getNatGatewayId: get => get(resource, 'NatGatewayId'),
	};
};
