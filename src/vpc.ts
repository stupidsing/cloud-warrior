import { prefix, statesDirectory } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'vpc';

type Attributes = {
	CidrBlockAssociationSet: { CidrBlock: string }[],
	EnableDnsHostnames?: boolean,
	EnableDnsSupport?: boolean,
};

let delete_ = ({ VpcId }) => {
	return [
		`aws ec2 delete-vpc --vpc-id ${VpcId} &&`,
		`rm -f \\`,
		`  ${statesDirectory}/\${KEY} \\`,
		`  ${statesDirectory}/\${KEY}#EnableDnsHostnames \\`,
		`  ${statesDirectory}/\${KEY}#EnableDnsSupport`,
	];
};

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { CidrBlockAssociationSet } = attributes;
	let commands = [];

	// let VpcId = `$(aws ec2 describe-vpcs --filter Name:${name} | jq -r .Vpcs[0].VpcId)`;
	let VpcId = `$(cat ${statesDirectory}/\${KEY} | jq -r .VpcId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-vpc \\`,
			`  --cidr-block ${CidrBlockAssociationSet[0].CidrBlock} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | jq .Vpc | tee ${statesDirectory}/\${KEY}`,
			`aws ec2 wait \\`,
			`  vpc-available --vpc-id ${VpcId}`,
		);
		state = { CidrBlockAssociationSet: [{ CidrBlock: attributes['CidrBlockAssociationSet'][0]['CidrBlock'] }] };
	}

	{
		let prop = 'CidrBlockAssociationSet';
		let map0 = Object.fromEntries(state[prop].map(({ CidrBlock, AssociationId }) => [CidrBlock, AssociationId]));
		let map1 = Object.fromEntries(attributes[prop].map(({ CidrBlock, AssociationId }) => [CidrBlock, AssociationId]));
		for (let [CidrBlock, AssociationId] of Object.entries(map0)) {
			if (!map1.hasOwnProperty(CidrBlock)) {
				commands.push(
					`aws ec2 disassociate-vpc-cidr-block \\`,
					`  --association-id ${AssociationId} \\`,
					`  --vpc-id ${VpcId}`,
				);
			}
		}
		for (let [CidrBlock, AssociationId] of Object.entries(map1)) {
			if (!map0.hasOwnProperty(CidrBlock)) {
				commands.push(
					`aws ec2 associate-vpc-cidr-block\\`,
					`  --cidr-block ${CidrBlock} \\`,
					`  --vpc-id ${VpcId}`,
				);
			}
		}
	}

	{
		let prop = 'EnableDnsHostnames';
		if (state[prop] !== attributes[prop]) {
			commands.push(
				`aws ec2 modify-vpc-attribute \\`,
				`  --${attributes[prop] ? `` : `no-`}enable-dns-hostnames \\`,
				`  --vpc-id ${VpcId}`,
				`echo ${attributes[prop]} | tee ${statesDirectory}/\${KEY}#${prop}`,
			);
		}
	}

	{
		let prop = 'EnableDnsSupport';
		if (state[prop] !== attributes[prop]) {
			commands.push(
				`aws ec2 modify-vpc-attribute \\`,
				`  --${attributes[prop] ? `` : `no-`}enable-dns-support \\`,
				`  --vpc-id ${VpcId}`,
				`echo ${attributes[prop]} | tee ${statesDirectory}/\${KEY}#${prop}`,
			);
		}
	}

	return commands;
};

export let vpcClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {} }: Resource_<Attributes>) => [
		class_,
		name,
	].join('_'),
	refresh: ({ VpcId }) => [
		`ID=${VpcId}`,
		`aws ec2 describe-vpcs \\`,
		`  --vpc-ids \${ID} \\`,
		`  | jq .Vpcs[0] | tee ${statesDirectory}/\${KEY}`,
		`aws ec2 describe-vpc-attribute \\`,
		`  --attribute enableDnsHostnames \\`,
		`  --vpc-id \${ID} \\`,
		`  | jq -r .EnableDnsHostnames.Value | tee ${statesDirectory}/\${KEY}#EnableDnsHostnames`,
		`aws ec2 describe-vpc-attribute \\`,
		`  --attribute enableDnsSupport \\`,
		`  --vpc-id \${ID} \\`,
		`  | jq -r .EnableDnsSupport.Value | tee ${statesDirectory}/\${KEY}#EnableDnsSupport`,
	],
	upsert,
};

import { create } from "./warrior";

export let createVpc = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getVpcId: get => get(resource, 'VpcId'),
	};
};
