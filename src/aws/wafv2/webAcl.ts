import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'web-acl';

type Attributes = {
	DefaultAction: {
		Allow?: {
			CustomRequestHandling?: {
				InsertHeaders: { Name: string, Value: string }[],
			},
		},
		Block?: {
			CustomResponse?: {
				CustomResponseBodyKey: string,
				ResponseCode: number,
				ResponseHeaders: { Name: string, Value: string }[],
			},
		},
	},
	Name: string,
	Region?: string,
	Rules?: {
		Name: string,
		Priority: number,
		Statement: {
			AndStatement?: any,
			ByteMatchStatement?: any,
			GeoMatchStatement?: any,
			IPSetReferenceStatement?: any,
			LabelMatchStatement?: any,
			ManagedRuleGroupStatement?: any,
			NotStatement?: any,
			OrStatement?: any,
			RateBasedStatement?: any,
			RegexMatchStatement?: any,
			RegexPatternSetReferenceStatement?: any,
			RuleGroupReferenceStatement?: any,
			SizeConstraintStatement?: any,
			SqliMatchStatement?: any,
			XssMatchStatement?: any,
		},
	}[],
	Scope: 'CLOUDFRONT' | 'REGIONAL',
	VisibilityConfig: {
		CloudWatchMetricsEnabled: boolean,
		MetricName: string,
		SampledRequestsEnabled: boolean,
	},
};

let delete_ = ({ Id, Name, Region, Scope }) => [
	`aws wafv2 delete-web-acl \\`,
	`  --id ${Id} \\`,
	`  --lock-token \$(aws wafv2 get-web-acl --id ${Id} --name ${Name}${Region != null ? ` --region=${Region}` : ``} --scope ${Scope} | jq -r .LockToken) \\`,
	`  --name ${Name} \\`,
	...Region != null ? [`  --region ${Region} \\`] : [],
	`  --scope ${Scope} &&`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
	`  ${statesDirectory}/\${KEY}#Name \\`,
	`  ${statesDirectory}/\${KEY}#Region \\`,
	`  ${statesDirectory}/\${KEY}#Scope`,
];

let refresh = (Id, Name, Region, Scope) => [
	`ID=${Id} NAME=${Name} REGION=${Region} SCOPE=${Scope}`,
	`aws wafv2 get-web-acl \\`,
	`  --id \${ID} \\`,
	`  --name \${NAME} \\`,
	...Region != null ? [`  --region \${REGION} \\`] : [],
	`  --scope \${SCOPE} \\`,
	`  | jq .WebACL | tee ${statesDirectory}/\${KEY}`,
	`echo '${JSON.stringify(Name)}' > ${statesDirectory}/\${KEY}#Name`,
	`echo '${JSON.stringify(Region ?? null)}' > ${statesDirectory}/\${KEY}#Region`,
	`echo '${JSON.stringify(Scope)}' > ${statesDirectory}/\${KEY}#Scope`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { DefaultAction, Name, Region, Scope, VisibilityConfig } = attributes;
	let commands = [];

	let Id = `$(cat ${statesDirectory}/\${KEY} | jq -r .Id)`;

	if (state == null) {
		commands.push(
			`aws wafv2 create-web-acl \\`,
			`  --default-action '${JSON.stringify(DefaultAction)}' \\`,
			`  --name ${Name} \\`,
			...Region != null ? [`  --region ${Region} \\`] : [],
			`  --scope ${Scope} \\`,
			`  --tags Key=Name,Value=${prefix}-${name} \\`,
			`  --visibility-config '${JSON.stringify(VisibilityConfig)}' \\`,
			`  | jq .Summary | tee ${statesDirectory}/\${KEY}`,
			...refresh(Id, Name, Region, Scope),
		);
		state = { DefaultAction, Name, Region, Scope, VisibilityConfig };
	}

	let updates = Object
	.entries({
		DefaultAction: r => [`--default-action ${JSON.stringify(r)}`],
		Region: r => [`--region ${r}`],
		Rules: r => [`--rules ${JSON.stringify(r)}`],
	})
	.flatMap(([prop, transform]) => {
		let source = transform(state[prop]);
		let target = transform(attributes[prop]);
				let same = source.length === target.length;
		if (same) {
			for (let i = 0; i < source.length; i++) same &&= source[i] === target[i];
		}
		return same ? [] : target;
	});

	if (updates.length > 0) {
		updates.push(`--id ${Id}`);
		updates.push(`--lock-token \$(aws wafv2 get-web-acl --id ${Id} --name ${Name}${Region != null ? ` --region=${Region}` : ``} --scope ${Scope} | jq -r .LockToken)`);
		updates.push(`--name ${Name}`);
		updates.push(...Region != null ? [`--region ${Region}`] : []);
		updates.push(`--scope ${Scope}`);
		commands.push(
			`aws wafv2 update-web-acl \\`,
			...updates.sort((a, b) => a.localeCompare(b)).map(s => `  ${s} \\`),
			`  | tee ${statesDirectory}/\${KEY}`,
		);
	}

	return commands;
};

export let webAclClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { DefaultAction, Name, Region, Scope } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Name,
			Region,
			Scope,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ Id, Name, Region, Scope }) => refresh(Id, Name, Region, Scope),
	upsert,
};

import { create } from "../../warrior";

export let createWebAcl = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getId: (get: (resource: any, prop: string) => string) => get(resource, 'Id'),
	};
};
