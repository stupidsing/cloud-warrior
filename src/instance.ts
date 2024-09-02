import { getStateFilename, prefix } from "./constants";
import { Class, Resource, Resource_ } from "./types";

let class_ = 'instance';

let delete_ = ({ InstanceId }, key: string) => [
	`aws ec2 terminate-instances \\`,
	`  --instance-ids ${InstanceId} &&`,
	`rm -f ${getStateFilename(key)}`,
	`aws ec2 wait instance-terminated --instance-id ${InstanceId}`,
];

let refreshById = (key, id) => [
	`ID=${id}`,
	`aws ec2 describe-instances \\`,
	`  --instance-ids \${ID} \\`,
	`  | jq .Reservations[0].Instances[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource) => {
	let { name, attributes, key } = resource;
	let { ImageId, InstanceType, SecurityGroups, SubnetId } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ec2 run-instances \\`,
			...(SecurityGroups.length > 0 ? [`  --security-group-ids ${SecurityGroups.join(',')} \\`] : []),
			`  --image-id ${ImageId} \\`,
			`  --instance-type ${InstanceType} \\`,
			`  --subnet-id ${SubnetId} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | jq .Instances[0] | tee ${getStateFilename(key)}`,
		);
		state = { SecurityGroups };
	}

	let InstanceId = `$(cat ${getStateFilename(key)} | jq -r .InstanceId)`;

	{
		let prop = 'SecurityGroups';
		let source = state[prop].map(r => r.GroupId).sort((a, b) => a.localeCompare(b)).join(',');
		let target = attributes[prop].map(r => r.GroupId).sort((a, b) => a.localeCompare(b)).join(',');
		if (source !== target) {
			if (target.length > 0)
				commands.push(
					`aws ec2 modify-instance-attribute \\`,
					`  --instance-id ${InstanceId}`,
					...target.length > 0 ? [`  --security-group-ids ${target} \\`] : [],
					...refreshById(key, InstanceId),
				);
			}
	}

	return commands;
};

export let instanceClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource) => [
		prefix,
		class_,
		name,
		attributes.InstanceType,
		attributes.ImageId,
	].join('_'),
	refresh: ({ InstanceId }, key: string) => refreshById(key, InstanceId),
	upsert,
};

import { create } from "./warrior";

type Attributes = {
	ImageId: string,
	InstanceType: string,
	SecurityGroups: { GroupId: string }[],
	SubnetId: string,
};

export let createInstance: (name: string, f: (get: (referredResource: Resource, prop: string) => string) => Attributes) => Resource_<Attributes> = (name, f) => create(class_, name, f) as Resource_<Attributes>;
