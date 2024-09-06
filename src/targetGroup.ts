import { createHash } from "crypto";
import { prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'target-group';

type Attributes = {
	Name: string,
	Protocol: string,
	Port: number,
	TargetType: string,
	VpcId: string,
};

let delete_ = ({ TargetGroupArn }) => [
	`aws elbv2 delete-target-group \\`,
	`  --target-group-arn ${TargetGroupArn} &&`,
	`rm -f \${STATE}`,
];

let refreshByArn = (key, arn) => [
	`ARN=${arn}`,
	`aws elbv2 describe-target-groups \\`,
	`  --target-group-arns \${ARN} \\`,
	`  | jq .TargetGroups[0] | tee \${STATE}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { Name, Protocol, Port, TargetType, VpcId } = attributes;
	let commands = [];

	let TargetGroupArn = `$(cat \${STATE} | jq -r .TargetGroupArn)`;

	if (state == null) {
		commands.push(
			`aws elbv2 create-target-group \\`,
			`  --name ${Name} \\`,
			`  --protocol ${Protocol} \\`,
			`  --port ${Port} \\`,
			`  --tags '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  --target-type ${TargetType} \\`,
			`  --vpc-id ${VpcId} \\`,
			`  | jq .TargetGroups[0] | tee \${STATE}`,
		);
		state = { Name, Protocol, Port, TargetType, VpcId };
	}

	return commands;
};

export let targetGroupClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		class_,
		name,
		attributes.VpcId,
		createHash('sha256').update([
			attributes.Name,
			attributes.Port,
			attributes.Protocol,
			attributes.TargetType,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ TargetGroupArn }, key: string) => refreshByArn(key, TargetGroupArn),
	upsert,
};

import { create } from "./warrior";

export let createTargetGroup = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: get => get(resource, 'TargetGroupArn'),
	};
};
