import { createHash } from "crypto";
import { prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'security-group-rule-ingress';

type Attributes = {
	CidrIpv4?: string,
	FromPort: number,
	GroupId: string,
	IpProtocol: string,
	SourceGroup?: string,
	ToPort: number,
};

let delete_ = ({ GroupId, SecurityGroupRuleId }) => [
	`aws ec2 revoke-security-group-ingress \\`,
	`  --group-id ${GroupId} \\`,
	`  --security-group-rule-ids ${SecurityGroupRuleId} &&`,
	`rm -f \${STATE}`,
];

let refreshById = (key, id) => [
	`ID=${id}`,
	`aws ec2 describe-security-group-rules \\`,
	`  --security-group-rule-ids \${ID} \\`,
	`  | jq .SecurityGroupRules[0] | tee \${STATE}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { CidrIpv4, FromPort, GroupId, IpProtocol, SourceGroup, ToPort } = attributes;
	let commands = [];

	let SecurityGroupRuleId = `$(cat \${STATE} | jq -r .SecurityGroupRuleId)`;

	if (state == null) {
		commands.push(
			`aws ec2 authorize-security-group-ingress \\`,
			`  --group-id ${GroupId} \\`,
			`  --ip-permissions FromPort=${FromPort}${IpProtocol != null ? `,IpProtocol=${IpProtocol}` : ``},IpRanges=[{CidrIp=${CidrIpv4}}],ToPort=${ToPort}${SourceGroup != null ? `,UserIdGroupPairs=[{GroupId=${SourceGroup}}]` : ``} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'security-group-rule', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | jq .SecurityGroupRules[0] | tee \${STATE}`,
			...refreshById(key, SecurityGroupRuleId),
		);
		state = {  CidrIpv4, FromPort, GroupId, IpProtocol, SourceGroup, ToPort };
	}

	return commands;
};

export let securityGroupRuleIngressClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		class_,
		name,
		attributes.GroupId,
		attributes.SourceGroup,
		createHash('sha256').update([
			attributes.CidrIpv4,
			attributes.FromPort,
			attributes.IpProtocol,
			attributes.ToPort,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ SecurityGroupRuleId }, key: string) => refreshById(key, SecurityGroupRuleId),
	upsert,
};

import { create } from "./warrior";

export let createSecurityGroupRuleIngress = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getSecurityGroupRuleId: get => get(resource, 'SecurityGroupRuleId'),
	};
};
