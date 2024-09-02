import { getStateFilename, prefix } from "./constants";
import { Class, Resource } from "./types";

let class_ = 'instance';

let delete_ = (state, key: string) => [
	`aws ec2 terminate-instances \\`,
	`  --instance-ids ${state.InstanceId}`,
	`rm -f ${getStateFilename(key)}`,
	`# wait for instance to terminate`,
];

let refreshById = (key, id) => [
	`aws ec2 describe-instances \\`,
	`  --instance-ids ${id} \\`,
	`  | jq .Reservations[0].Instances[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource) => {
	let { name, attributes, key } = resource;
	let { ImageId, InstanceType, SecurityGroups, SubnetId } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ec2 run-instances \\`,
			...(SecurityGroups.length > 0 ? [`  --security-groups ${SecurityGroups.join(',')} \\`] : []),
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
		if (state[prop] !== attributes[prop]) {
			let values = attributes[prop];
			if (values.length > 0)
				commands.push(
					`aws ec2 modify-instance-attribute \\`,
					...values.length > 0 ? [`  --groups ${values.join(',')} \\`] : [],
					`  --instance-id ${InstanceId}`,
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

export let createInstance = (name, f) => create(class_, name, f);
