import { getStateFilename } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'target';

type Attributes = {
	Target: { Id: string, Port?: number },
	TargetGroupArn: string,
};

let delete_ = ({ Target: { Id, Port }, TargetGroupArn }, key: string) => [
	`aws elbv2 deregister-targets \\`,
	`  --target-group-arn ${TargetGroupArn} \\`,
	`  --targets Id=${Id}${Port != null ? `,Port=${Port}` : ``} &&`,
	`rm -f ${getStateFilename(key)} ${getStateFilename(key)}#TargetGroupArn`,
];

let refresh_ = (key: string, { Target: { Id, Port }, TargetGroupArn }: Attributes) => [
	`aws elbv2 describe-target-health \\`,
	`  --target-group-arn ${TargetGroupArn} \\`,
	`  --targets Id=${Id}${Port != null ? `,Port=${Port}` : ``} \\`,
	`  | jq .TargetHealthDescriptions[0] | tee ${getStateFilename(key)}`,
	`echo ${JSON.stringify(TargetGroupArn)} | tee ${getStateFilename(key)}#TargetGroupArn`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { Target: { Id, Port }, TargetGroupArn } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws elbv2 register-targets \\`,
			`  --target-group-arn ${TargetGroupArn} \\`,
			`  --targets Id=${Id}${Port != null ? `,Port=${Port}` : ``}`,
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
		class_,
		name,
		attributes.TargetGroupArn.replaceAll('/', ':'),
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
