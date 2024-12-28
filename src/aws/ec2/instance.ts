import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'instance';

type Attributes = {
	IamInstanceProfile?: { Arn: string },
	ImageId: string,
	InstanceType: string,
	SecurityGroups: { GroupId: string }[],
	SubnetId: string,
};

let delete_ = ({ InstanceId }) => [
	`aws ec2 terminate-instances \\`,
	`  --instance-ids ${InstanceId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
	`aws ec2 wait instance-terminated \\`,
	`  --instance-id ${InstanceId}`,
];

let refreshById = id => [
	`ID=${id}`,
	`aws ec2 describe-instances \\`,
	`  --instance-ids \${ID} \\`,
	`  | jq .Reservations[0].Instances[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { ImageId, InstanceType, SecurityGroups, SubnetId } = attributes;
	let commands = [];

	let InstanceId = `$(cat ${statesDirectory}/\${KEY} | jq -r .InstanceId)`;

	if (state == null) {
		commands.push(
			`aws ec2 run-instances \\`,
			...SecurityGroups.length > 0 ? [`  --security-group-ids ${SecurityGroups.map(r => r.GroupId).join(' ')} \\`] : [],
			`  --image-id ${ImageId} \\`,
			`  --instance-type ${InstanceType} \\`,
			`  --subnet-id ${SubnetId} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | jq .Instances[0] | tee ${statesDirectory}/\${KEY}`,
			`aws ec2 wait instance-exists \\`,
			`  --instance-id ${InstanceId}`,
		);
		state = { ImageId, InstanceType, SecurityGroups, SubnetId };
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
					...target.length > 0 ? [`  --security-group-ids ${target} \\`] : [],
					...refreshById(InstanceId),
				);
			}

			if (target != null) {
				commands.push(
					`aws ec2 associate-iam-instance-profile \\`,
					`  --iam-instance-profile Arn=${target} \\`,
					`  --instance-id ${InstanceId}`,
					...refreshById(InstanceId),
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
					...refreshById(InstanceId),
				);
			}
		}
	}

	return commands;
};

export let instanceClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { ImageId, InstanceType, SubnetId } }: Resource_<Attributes>) => [
		class_,
		name,
		SubnetId,
		ImageId,
		createHash('sha256').update([
			InstanceType,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ InstanceId }) => refreshById(InstanceId),
	upsert,
};

import { create } from "../../warrior";

export let createInstance = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getInstanceId: get => get(resource, 'InstanceId'),
	};
};
