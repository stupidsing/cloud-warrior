import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'load-balancer';

type Attributes = {
	AvailabilityZones: { SubnetId: string }[],
	Name: string,
	SecurityGroups: string[],
};

let delete_ = ({ LoadBalancerArn }) => [
	`aws elbv2 delete-load-balancer \\`,
	`  --load-balancer-arn ${LoadBalancerArn} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshByArn = arn => [
	`ARN=${arn}`,
	`aws elbv2 describe-load-balancers \\`,
	`  --load-balancer-arns \${ARN} \\`,
	`  | jq .LoadBalancers[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { AvailabilityZones, Name, SecurityGroups } = attributes;
	let commands = [];

	let LoadBalancerArn = `$(cat ${statesDirectory}/\${KEY} | jq -r .LoadBalancerArn)`;

	if (state == null) {
		commands.push(
			`aws elbv2 create-load-balancer \\`,
			`  --name ${Name} \\`,
			`  --security-groups ${SecurityGroups} \\`,
			`  --subnets ${AvailabilityZones.map(r => r.SubnetId).join(' ')} \\`,
			`  --tag '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  | jq .LoadBalancers[0] | tee ${statesDirectory}/\${KEY}`,
			`aws elbv2 wait load-balancer-exists \\`,
			`  --load-balancer-arns ${LoadBalancerArn}`,
		);
		state = { AvailabilityZones, Name, SecurityGroups };
	}

	{
		let prop = 'AvailabilityZones';
		let source = state[prop].map(r => r.SubnetId).sort((a, b) => a.localeCompare(b)).join(' ');
		let target = attributes[prop].map(r => r.SubnetId).sort((a, b) => a.localeCompare(b)).join(' ');
		if (source !== target) {
			commands.push(
				`aws elbv2 set-subnets \\`,
				`  --load-balancer-arns \${ARN} \\`,
				`  --subnets ${target}`,
				...refreshByArn(LoadBalancerArn),
			);
		}
	}

	{
		let prop = 'SecurityGroups';
		let source = state[prop].join(' ');
		let target = attributes[prop].join(' ');
		if (source !== target) {
			commands.push(
				`aws elbv2 set-security-groups \\`,
				`  --load-balancer-arns ${LoadBalancerArn} \\`,
				`  --security-groups ${target}`,
				...refreshByArn(LoadBalancerArn),
			);
		}
	}

	return commands;
};

export let loadBalancerClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Name } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Name,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ LoadBalancerArn }) => refreshByArn(LoadBalancerArn),
	upsert,
};

import { create } from "../../warrior";

export let createLoadBalancer = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: get => get(resource, 'LoadBalancerArn'),
	};
};
