import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'target';

type Attributes = {
	Target: { Id: string, Port?: number },
	TargetGroupArn: string,
};

let delete_ = ({ Id, Port, TargetGroupArn }, key: string) => [
	`aws elbv2 deregister-targets \\`,
	`  --target-group-arn ${TargetGroupArn} \\`,
	`  --targets Id=${Id}${Port != null ? `,Port=${Port}` : ``} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refresh_ = (key: string, { Target: { Id, Port }, TargetGroupArn }: Attributes) => [
	`aws elbv2 describe-target-health \\`,
	`  --target-group-arn ${TargetGroupArn} \\`,
	`  --targets Id=${Id}${Port != null ? `,Port=${Port}` : ``} \\`,
	`  | jq .TargetHealthDescriptions[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { Target: { Id, Port }, TargetGroupArn } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws elbv2 register-targets \\`,
			`  --target-group-arn ${TargetGroupArn} \\`,
			`  --targets Id=${Id}${Port != null ? `,Port=${Port}` : ``} \\`,
			`  | tee ${getStateFilename(key)}`,
			...refresh_(key, attributes),
		);
		state = { Target: { Id, Port }, TargetGroupArn };
	}

	return commands;
};

export let targetClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
		attributes.TargetGroupArn,
		attributes.Target.Id,
		attributes.Target.Port,
	].join('_'),
	refresh: (state: any, key: string) => refresh_(key, state),
	upsert,
};

import { create } from "./warrior";

export let createTarget = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getArn: get => get(resource, 'TargetGroupArn'),
	};
};
