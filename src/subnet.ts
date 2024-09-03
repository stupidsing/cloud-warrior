import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'subnet';

type Attributes = {
	AvailabilityZone: string,
	CidrBlock: string,
	MapPublicIpOnLaunch: boolean,
	VpcId: string,
};

let delete_ = ({ SubnetId }, key: string) => [
	`aws ec2 delete-subnet \\`,
	`  --subnet-id ${SubnetId} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshById = (key, id) => [
	`ID=${id}`,
	`aws ec2 describe-subnets \\`,
	`  --subnet-ids \${ID} \\`,
	`  | jq .Subnets[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { AvailabilityZone, CidrBlock, VpcId } = attributes;
	let commands = [];

	let SubnetId = `$(cat ${getStateFilename(key)} | jq -r .SubnetId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-subnet \\`,
			`  --availability-zone ${AvailabilityZone} \\`,
			...CidrBlock ? [`  --cidr-block ${CidrBlock} \\`] : [],
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  --vpc-id ${VpcId} \\`,
			`  | jq .Subnet | tee ${getStateFilename(key)}`,
			`aws ec2 wait subnet-available --subnet-id ${SubnetId}`,
		);
		state = {};
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
		prefix,
		class_,
		name,
		attributes.VpcId,
		attributes.AvailabilityZone,
		attributes.CidrBlock.replaceAll('/', ':'),
	].join('_'),
	refresh: ({ SubnetId }, key: string) => refreshById(key, SubnetId),
	upsert,
};

import { create } from "./warrior";

export let createSubnet = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getSubnetId: get => get(resource, 'SubnetId'),
	};
};
