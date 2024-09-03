import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'target-group';

type Attributes = {
	Name: string,
	Protocol: string,
	Port: number,
	TargetType: string,
	VpcId: string,
};

let delete_ = ({ TargetGroupArn }, key: string) => [
	`aws elbv2 delete-target-group \\`,
	`  --target-group-arn ${TargetGroupArn} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshByArn = (key, arn) => [
	`ARN=${arn}`,
	`aws elbv2 describe-target-groups \\`,
	`  --target-group-arns \${ARN} \\`,
	`  | jq .TargetGroups[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { Name, Protocol, Port, TargetType, VpcId } = attributes;
	let commands = [];

	let TargetGroupArn = `$(cat ${getStateFilename(key)} | jq -r .TargetGroupArn)`;

	if (state == null) {
		commands.push(
			`aws elbv2 create-target-group \\`,
			`  --name ${Name} \\`,
			`  --protocol ${Protocol} \\`,
			`  --port ${Port} \\`,
			`  --target-type ${TargetType} \\`,
			`  --vpc-id ${VpcId} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'target-group', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | tee ${getStateFilename(key)}`,
			`aws elbv2 wait target-group-exists --target-group-arns ${TargetGroupArn}`,
		);
		state = { Name, Protocol, Port, TargetType, VpcId };
	}

	return commands;
};

export let targetGroupClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
		attributes.VpcId,
		attributes.Name,
		attributes.Protocol,
		attributes.Port,
		attributes.TargetType,
	].join('_'),
	refresh: ({ TargetGroupArn }, key: string) => refreshByArn(key, TargetGroupArn),
	upsert,
};

import { create } from "./warrior";

export let createTargetGroup = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getArn: get => get(resource, 'TargetGroupArn'),
	};
};
