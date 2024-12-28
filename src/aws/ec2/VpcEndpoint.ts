import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'vpc-endpoint';

type Attributes = {
	PrivateDnsEnabled: boolean,
	SecurityGroupIds: string[],
	ServiceName: string,
	SubnetIds: string[],
	VpcEndpointType: 'Gateway' | 'GatewayLoadBalancer' | 'Interface',
	VpcId: string,
};

let delete_ = ({ VpcEndpointId }) => [
	`aws ec2 delete-vpc-endpoints \\`,
	`  --vpc-endpoint-ids ${VpcEndpointId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { PrivateDnsEnabled, SecurityGroupIds, ServiceName, SubnetIds, VpcEndpointType, VpcId } = attributes;
	let commands = [];

	let VpcEndpointId = `$(cat ${statesDirectory}/\${KEY} | jq -r .VpcEndpointId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-vpc-endpoint \\`,
			PrivateDnsEnabled ? `  --private-dns-enabled` : `  --no-private-dns-enabled`,
			`  --security-group-ids ${SecurityGroupIds.join(' ')}`,
			`  --service-name ${ServiceName}`,
			`  --subnet-ids ${attributes.SubnetIds.join(' ')}`,
			`  --vpc-endpoint-type ${VpcEndpointType}`,
			`  --vpc-id ${VpcId}`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'vpcendpoint', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}'`,
			`  | jq .VpcEndpoint | tee ${statesDirectory}/\${KEY}`,
		);
		state = { PrivateDnsEnabled, SecurityGroupIds, ServiceName, SubnetIds, VpcEndpointType, VpcId };
	}

	return commands;
};

export let vpcEndpointClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {
		PrivateDnsEnabled,
		SecurityGroupIds,
		ServiceName,
		SubnetIds,
		VpcEndpointType,
		VpcId,
	} }: Resource_<Attributes>) => [
		class_,
		name,
		PrivateDnsEnabled,
		SecurityGroupIds,
		ServiceName,
		SubnetIds,
		VpcEndpointType,
		VpcId,
	].join('_'),
	refresh: ({ VpcEndpointId }) => [
		`ID=${VpcEndpointId}`,
		`aws ec2 describe-vpc-endpoints \\`,
		`  --vpc-endpoint-ids \${ID} \\`,
		`  | jq .VpcEndpoints[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createVpcEndpoint = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getVpcEndpointId: get => get(resource, 'VpcEndpointId'),
	};
};
