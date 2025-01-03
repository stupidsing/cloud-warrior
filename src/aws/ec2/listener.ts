import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { replace } from "../../utils";

let class_ = 'listener';

type Attributes = {
	DefaultActions: { TargetGroupArn: string, Type: string }[],
	LoadBalancerArn: string,
	Port: number,
	Protocol: string,
};

let delete_ = ({ ListenerArn }) => [
	`aws elbv2 delete-listener \\`,
	`  --listener-arn ${ListenerArn} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = ListenerArn => [
	`ARN=${ListenerArn}`,
	`aws elbv2 describe-listeners \\`,
	`  --listener-arns \${ARN} \\`,
	`  | jq .Listeners[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { DefaultActions, LoadBalancerArn, Protocol, Port } = attributes;
	let commands = [];

	let ListenerArn = `$(cat ${statesDirectory}/\${KEY} | jq -r .ListenerArn)`;

	if (state == null) {
		commands.push(
			`aws elbv2 create-listener \\`,
			`  --default-actions ${DefaultActions.map(r => `Type=${r.Type},TargetGroupArn=${r.TargetGroupArn}`).join(',')} \\`,
			`  --load-balancer-arn ${LoadBalancerArn} \\`,
			`  --port ${Port} \\`,
			`  --protocol ${Protocol} \\`,
			`  --tags '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  | jq .Listeners[0] | tee ${statesDirectory}/\${KEY}`,
		);
		state = { DefaultActions, LoadBalancerArn, Port, Protocol };
	}

	{
		let prop = 'DefaultActions';
		let source = state[prop].map(r => `Type=${r.Type},TargetGroupArn=${r.TargetGroupArn}`).join(',');
		let target = attributes[prop].map(r => `Type=${r.Type},TargetGroupArn=${r.TargetGroupArn}`).join(',');
		if (source !== target) {
			commands.push(
				`aws elbv2 modify-listener \\`,
				`  --default-actions ${target} \\`,
				`  --listener-arns ${ListenerArn} \\`,
				`  | jq .Listeners[0] | tee ${statesDirectory}/\${KEY}`,
			);
		}
	}

	{
		let prop = 'Port';
		let source = state[prop];
		let target = attributes[prop];
		if (source !== target) {
			commands.push(
				`aws elbv2 modify-listener \\`,
				`  --port ${target} \\`,
				`  --listener-arns ${ListenerArn} \\`,
				`  | jq .Listeners[0] | tee ${statesDirectory}/\${KEY}`,
			);
		}
	}

	{
		let prop = 'Protocol';
		let source = state[prop];
		let target = attributes[prop];
		if (source !== target) {
			commands.push(
				`aws elbv2 modify-listener \\`,
				`  --protocol ${target} \\`,
				`  --listener-arns ${ListenerArn} \\`,
				`  | jq .Listeners[0] | tee ${statesDirectory}/\${KEY}`,
			);
		}
	}

	return commands;
};

export let listenerClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { LoadBalancerArn } }: Resource_<Attributes>) => [
		class_,
		name,
		replace(LoadBalancerArn),
	].join('_'),
	refresh: ({ ListenerArn }) => refresh(ListenerArn),
	upsert,
};

import { create } from "../../warrior";

export let createListener = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: (get: (resource: any, prop: string) => string) => get(resource, 'ListenerArn'),
	};
};
