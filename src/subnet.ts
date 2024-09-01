import { getStateFilename, prefix } from "./constants";
import { Class, Resource } from "./types";

let class_ = 'subnet';

let delete_ = (state, key: string) => [
	`aws ec2 delete-subnet \\`,
	`  --subnet-id ${state.SubnetId}`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshById = (key, id) => [
	`aws ec2 describe-subnets \\`,
	`  --subnet-ids ${id} \\`,
	`  | jq .Subnets[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource) => {
	let { name, attributes, key } = resource;
	let { AvailabilityZone, CidrBlock, VpcId } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ec2 create-subnet \\`,
			`  --availability-zone ${AvailabilityZone} \\`,
			...(CidrBlock ? [`  --cidr-block ${CidrBlock} \\`] : []),
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  --vpc-id ${VpcId} \\`,
			`  | jq .Subnet | tee ${getStateFilename(key)}`,
		);
		state = {};
	}

	let SubnetId = `$(cat ${getStateFilename(key)} | jq -r .SubnetId)`;

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

export let subnetClass: () => Class = () => {
	return {
		class_,
		delete_,
		getKey: ({ name, attributes }: Resource) => [
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
};
