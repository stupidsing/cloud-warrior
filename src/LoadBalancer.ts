import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'load-balancer';

type Attributes = {
	AvailabilityZone: { SubnetId: string }[],
	Name: string,
	SecurityGroups: string[],
};

let delete_ = ({ LoadBalancerArn }, key: string) => [
	`aws elbv2 delete-load-balancer \\`,
	`  --load-balancer-arn ${LoadBalancerArn} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshByArn = (key, arn) => [
	`ARN=${arn}`,
	`aws elbv2 describe-load-balancers \\`,
	`  --load-balancer-arns \${ARN} \\`,
	`  | jq .LoadBalancers[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { AvailabilityZone, Name, SecurityGroups } = attributes;
	let commands = [];

	let LoadBalancerArn = `$(cat ${getStateFilename(key)} | jq -r .LoadBalancerArn)`;

	if (state == null) {
		commands.push(
			`aws elbv2 create-load-balancer \\`,
			`  --name ${Name} \\`,
			`  --security-groups ${SecurityGroups} \\`,
			`  --subnets ${AvailabilityZone.map(r => r.SubnetId).join(' ')} \\`,
			`  --tag '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  | tee ${getStateFilename(key)}`,
			`aws elbv2 wait load-balancer-exists --load-balancer-arns ${LoadBalancerArn}`,
		);
		state = { AvailabilityZone, Name, SecurityGroups };
	}

	{
		let prop = 'AvailabilityZone';
		let source = state[prop].map(r => r.SubnetId).join(',');
		let target = attributes[prop].map(r => r.SubnetId).join(',');
		if (source !== target) {
			commands.push(
				`aws elbv2 set-subnets \\`,
				`  --load-balancer-arns \${ARN} \\`,
				`  --subnets ${target}`,
				...refreshByArn(key, LoadBalancerArn),
			);
		}
	}

	{
		let prop = 'SecurityGroups';
		let source = state[prop].join(',');
		let target = attributes[prop].join(',');
		if (source !== target) {
			commands.push(
				`aws elbv2 set-security-groups \\`,
				`  --load-balancer-arns ${LoadBalancerArn} \\`,
				`  --security-groups ${target}`,
				...refreshByArn(key, LoadBalancerArn),
			);
		}
	}

	return commands;
};

export let loadBalancerClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
		attributes.Name,
	].join('_'),
	refresh: ({ LoadBalancerArn }, key: string) => refreshByArn(key, LoadBalancerArn),
	upsert,
};

import { create } from "./warrior";

export let createLoadBalancer = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getArn: get => get(resource, 'LoadBalancerArn'),
	};
};
