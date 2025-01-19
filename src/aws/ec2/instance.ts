import { createHash } from "crypto";
import * as fs from 'fs';
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'instance';

type Attributes = {
	AssociatePublicIpAddress?: boolean,
	BlockDeviceMappings?: {
		DeviceName: string,
		Ebs: {
			DeleteOnTermination: boolean,
			VolumeSize: number,
			VolumeType: string,
		},
	}[],
	IamInstanceProfile?: { Arn: string },
	ImageId: string,
	InstanceType: string,
	KeyName?: string,
	SecurityGroups: { GroupId: string }[],
	SubnetId: string,
	UserData?: string,
};

let delete_ = ({ InstanceId }) => [
	`aws ec2 terminate-instances \\`,
	`  --instance-ids ${InstanceId} &&`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
	`  ${statesDirectory}/\${KEY}#BlockDeviceMappings`,
	`aws ec2 wait instance-terminated \\`,
	`  --instance-id ${InstanceId}`,
];

let refresh = InstanceId => [
	`ID=${InstanceId}`,
	`aws ec2 describe-instances \\`,
	`  --instance-ids \${ID} \\`,
	`  | jq .Reservations[0].Instances[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { AssociatePublicIpAddress, BlockDeviceMappings, ImageId, InstanceType, KeyName, SecurityGroups, SubnetId, UserData } = attributes;
	let commands = [];

	let InstanceId = `$(cat ${statesDirectory}/\${KEY} | jq -r .InstanceId)`;

	if (state == null) {
		commands.push(
			`aws ec2 run-instances \\`,
			...AssociatePublicIpAddress != null
				? [`  --${AssociatePublicIpAddress ? `` : `no-`}associate-public-ip-address \\`]
				: [],
			...BlockDeviceMappings != null
				? [`  --block-device-mappings '${JSON.stringify(BlockDeviceMappings)}' \\`]
				: [],
			...KeyName != null ? [`  --key-name ${KeyName} \\`] : [],
			`  --image-id ${ImageId} \\`,
			`  --instance-type ${InstanceType} \\`,
			...SecurityGroups.length > 0 ? [`  --security-group-ids ${SecurityGroups.map(r => r.GroupId).join(' ')} \\`] : [],
			`  --subnet-id ${SubnetId} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			...UserData != null ? [`  --user-data file://${UserData} \\`] : [],
			`  | jq .Instances[0] | tee ${statesDirectory}/\${KEY}`,
			`aws ec2 wait instance-exists \\`,
			`  --instance-id ${InstanceId}`,
			`echo '${JSON.stringify(BlockDeviceMappings)}' > ${statesDirectory}/\${KEY}#BlockDeviceMappings`,
		);
		state = { AssociatePublicIpAddress, BlockDeviceMappings, ImageId, InstanceType, SecurityGroups, SubnetId, UserData };
	}

	{
		let prop = 'BlockDeviceMappings';
		let source = JSON.stringify(state[prop]);
		let target = JSON.stringify(attributes[prop]);
		if (source !== target) {
			if (attributes[prop] != null) {
				commands.push(
					`aws ec2 modify-instance-attribute \\`,
					`  --instance-id ${InstanceId} \\`,
					`  --block-device-mappings '${target}'`,
					`echo '${target}' > ${statesDirectory}/\${KEY}#BlockDeviceMappings`,
				);
			}
		}
	}

	{
		let prop = 'IamInstanceProfile';
		let source = state[prop]?.Arn;
		let target = attributes[prop]?.Arn;
		if (source !== target) {
			if (source != null) {
				commands.push(
					`aws ec2 disassociate-iam-instance-profile \\`,
					`  --association-id $(aws ec2 describe-iam-instance-profile-associations --filters Name=instance-id,Values=${InstanceId} \\`,
					`  | jq -r '.IamInstanceProfileAssociations[] | select(.IamInstanceProfile.Arn == "${source}") | .AssociationId'`,
					...refresh(InstanceId),
				);
			}

			if (target != null) {
				commands.push(
					`aws ec2 associate-iam-instance-profile \\`,
					`  --iam-instance-profile Arn=${target} \\`,
					`  --instance-id ${InstanceId}`,
					...refresh(InstanceId),
				);
			}
		}
	}

	{
		let prop = 'SecurityGroups';
		let source = state[prop].map(r => r.GroupId).sort((a, b) => a.localeCompare(b)).join(' ');
		let target = attributes[prop].map(r => r.GroupId).sort((a, b) => a.localeCompare(b)).join(' ');
		if (source !== target) {
			if (target.length > 0) {
				commands.push(
					`aws ec2 modify-instance-attribute \\`,
					`  --instance-id ${InstanceId}`,
					...target.length > 0 ? [`  --security-group-ids ${target} \\`] : [],
					...refresh(InstanceId),
				);
			}
		}
	}

	return commands;
};

export let instanceClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { AssociatePublicIpAddress, ImageId, InstanceType, KeyName, SubnetId, UserData } }: Resource_<Attributes>) => [
		class_,
		name,
		ImageId,
		KeyName,
		SubnetId,
		createHash('sha256').update([
			AssociatePublicIpAddress,
			InstanceType,
			fs.readFileSync(UserData, 'utf8'),
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ InstanceId }) => refresh(InstanceId),
	upsert,
};

import { create } from "../../warrior";

export let createInstance = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getAvailabilityZone: (get: (resource: any, prop: string) => string) => get(resource, 'Placement.AvailabilityZone'),
		getInstanceId: (get: (resource: any, prop: string) => string) => get(resource, 'InstanceId'),
		getPublicIpAddress: (get: (resource: any, prop: string) => string) => get(resource, 'PublicIpAddress'),
	};
};
