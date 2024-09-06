import { AttributesInput, Class, Resource_ } from "./types";
import { replace } from "./utils";

let class_ = 'target';

type Attributes = {
	Target: { Id: string, Port?: number },
	TargetGroupArn: string,
};

let delete_ = ({ Target: { Id, Port }, TargetGroupArn }) => [
	`aws elbv2 deregister-targets \\`,
	`  --target-group-arn ${TargetGroupArn} \\`,
	`  --targets Id=${Id}${Port != null ? `,Port=${Port}` : ``} &&`,
	`rm -f \${STATE} \${STATE}#TargetGroupArn`,
];

let refresh = ({ Target: { Id, Port }, TargetGroupArn }: Attributes) => [
	`aws elbv2 describe-target-health \\`,
	`  --target-group-arn ${TargetGroupArn} \\`,
	`  --targets Id=${Id}${Port != null ? `,Port=${Port}` : ``} \\`,
	`  | jq .TargetHealthDescriptions[0] | tee \${STATE}`,
	`echo ${JSON.stringify(TargetGroupArn)} | tee \${STATE}#TargetGroupArn`,
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
			...refresh(attributes),
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
		replace(attributes.TargetGroupArn),
		attributes.Target.Id,
		attributes.Target.Port,
	].join('_'),
	refresh,
	upsert,
};

import { create } from "./warrior";

export let createTarget = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: get => get(resource, 'TargetGroupArn'),
	};
};
