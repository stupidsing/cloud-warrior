import { createHash } from "crypto";
import { prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'subnet';

type Attributes = {
	AvailabilityZone: string,
	CidrBlock?: string,
	MapPublicIpOnLaunch?: boolean,
	VpcId: string,
};

let delete_ = ({ SubnetId }, key: string) => [
	`aws ec2 delete-subnet \\`,
	`  --subnet-id ${SubnetId} &&`,
	`rm -f \${STATE}`,
];

let refreshById = (key, id) => [
	`ID=${id}`,
	`aws ec2 describe-subnets \\`,
	`  --subnet-ids \${ID} \\`,
	`  | jq .Subnets[0] | tee \${STATE}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { AvailabilityZone, CidrBlock, VpcId } = attributes;
	let commands = [];

	let SubnetId = `$(cat \${STATE} | jq -r .SubnetId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-subnet \\`,
			`  --availability-zone ${AvailabilityZone} \\`,
			...CidrBlock ? [`  --cidr-block ${CidrBlock} \\`] : [],
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  --vpc-id ${VpcId} \\`,
			`  | jq .Subnet | tee \${STATE}`,
			`aws ec2 wait subnet-available --subnet-id ${SubnetId}`,
		);
		state = { AvailabilityZone, CidrBlock, VpcId };
	}

	{
		let prop = 'MapPublicIpOnLaunch';
		if (state[prop] !== attributes[prop]) {
			commands.push(
				`aws ec2 modify-subnet-attribute \\`,
				`  --${attributes[prop] ? `` : `no-`}map-public-ip-on-launch \\`,
				`  --subnet-id ${SubnetId}`,
				...refreshById(key, SubnetId),
			);
		}
	}

	return commands;
};

export let subnetClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		class_,
		name,
		attributes.VpcId,
		createHash('sha256').update([
			attributes.AvailabilityZone,
			attributes.CidrBlock,
		].join('_')).digest('base64').slice(0, 4),
	].join('_'),
	refresh: ({ SubnetId }, key: string) => refreshById(key, SubnetId),
	upsert,
};

import { create } from "./warrior";

export let createSubnet = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getSubnetId: get => get(resource, 'SubnetId'),
	};
};
