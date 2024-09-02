import { getStateFilename, prefix } from "./constants";
import { Class, Resource } from "./types";

let class_ = 'vpc';

let delete_ = (state, key: string) => {
	let stateFilename = getStateFilename(key);
	return [
		`aws ec2 delete-vpc --vpc-id ${state.VpcId} &&`,
		`rm -f \\`,
		`  ${stateFilename} \\`,
		`  ${stateFilename}#EnableDnsHostnames \\`,
		`  ${stateFilename}#EnableDnsSupport`,
	];
};

let upsert = (state, resource: Resource) => {
	let { name, attributes, key } = resource;
	let { CidrBlockAssociationSet } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ec2 create-vpc \\`,
			`  --cidr-block ${CidrBlockAssociationSet[0].CidrBlock} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' | \\`,
			`  jq .Vpc | tee ${getStateFilename(key)}`,
		);
		state = { CidrBlockAssociationSet: [{ CidrBlock: attributes['CidrBlockAssociationSet'][0]['CidrBlock'] }] };
	}

	// let VpcId = `$(aws ec2 describe-vpcs --filter Name:${name} | jq -r .Vpcs[0].VpcId)`;
	let VpcId = `$(cat ${getStateFilename(key)} | jq -r .VpcId)`;

	{
		let prop = 'CidrBlockAssociationSet';
		let map0 = Object.fromEntries(state[prop].map(({ CidrBlock, AssociationId }) => [CidrBlock, AssociationId]));
		let map1 = Object.fromEntries(attributes[prop].map(({ CidrBlock, AssociationId }) => [CidrBlock, AssociationId]));
		for (let [CidrBlock, AssociationId] of Object.entries(map0)) {
			if (!map1.hasOwnProperty(CidrBlock)) {
				commands.push(
					`aws ec2 disassociate-vpc-cidr-block \\`,
					`  --association-id ${AssociationId}`,
					`  --vpc-id ${VpcId} \\`,
				);
			}
		}
		for (let [CidrBlock, AssociationId] of Object.entries(map1)) {
			if (!map0.hasOwnProperty(CidrBlock)) {
				commands.push(
					`aws ec2 associate-vpc-cidr-block\\`,
					`  --cidr-block ${CidrBlock}`,
					`  --vpc-id ${VpcId}\\`,
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
				`echo ${attributes[prop]} | tee ${getStateFilename(key)}#${prop}`);
		}
	}
	{
		let prop = 'EnableDnsSupport';
		if (state[prop] !== attributes[prop]) {
			commands.push(
				`aws ec2 modify-vpc-attribute \\`,
				`  --${attributes[prop] ? `` : `no-`}enable-dns-support \\`,
				`  --vpc-id ${VpcId}`,
				`echo ${attributes[prop]} | tee ${getStateFilename(key)}#${prop}`);
		}
	}

	return commands;
};

export let vpcClass: Class = {
	class_,
	delete_,
	getKey: ({ name }: Resource) => [
		prefix,
		class_,
		name,
	].join('_'),
	refresh: ({ VpcId }, key: string) => [
		`ID=${VpcId}`,
		`aws ec2 describe-vpcs \\`,
		`  --vpc-ids \${ID} \\`,
		`  | jq .Vpcs[0] | tee ${getStateFilename(key)}`,
		`aws ec2 describe-vpc-attribute \\`,
		`  --attribute enableDnsHostnames \\`,
		`  --vpc-id \${ID} \\`,
		`  | jq -r .EnableDnsHostnames.Value | tee ${getStateFilename(key)}#EnableDnsHostnames`,
		`aws ec2 describe-vpc-attribute \\`,
		`  --attribute enableDnsSupport \\`,
		`  --vpc-id \${ID} \\`,
		`  | jq -r .EnableDnsSupport.Value | tee ${getStateFilename(key)}#EnableDnsSupport`,
	],
	upsert,
};

import { create } from "./warrior";

export let createVpc = (name, f) => create(class_, name, f);
