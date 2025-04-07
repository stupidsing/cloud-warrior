import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { replace, shellEscape } from "../../utils";

let class_ = 'record';

type Attributes = {
	AliasTarget?: {
		DNSName: string,
		EvaluateTargetHealth: boolean,
		HostedZoneId: string,
	},
	HostedZoneId: string,
	Name: string,
	ResourceRecords?: { Value: string }[],
	TTL?: number,
	Type: string,
};

let delete_ = ({ AliasTarget, HostedZoneId, Name, ResourceRecords, TTL, Type }) => [
	`CHANGE_ID=$(aws route53 change-resource-record-sets \\`,
	`  --change-batch ${shellEscape(JSON.stringify({
		Changes: [
			{
				Action: 'DELETE',
				ResourceRecordSet: { AliasTarget, Name, ResourceRecords, TTL, Type },
			}
		]
	}))} \\`,
	`  --hosted-zone-id ${HostedZoneId} \\`,
	`  | jq -r .ChangeInfo.Id) &&`,
	`aws route53 wait resource-record-sets-changed \\`,
			`  --id \${CHANGE_ID}`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
	`  ${statesDirectory}/\${KEY}#HostedZoneId`,
];

let refresh = (HostedZoneId, Type, Name) => [
	`aws route53 list-resource-record-sets \\`,
	`  --hosted-zone-id ${HostedZoneId} \\`,
	`  | jq '.ResourceRecordSets[] | select(.Type == "${Type}" and .Name == "${Name}")' | tee ${statesDirectory}/\${KEY}`,
	`echo ${HostedZoneId} | jq -R > ${statesDirectory}/\${KEY}#HostedZoneId`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { AliasTarget, HostedZoneId, Name, ResourceRecords, TTL, Type } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`CHANGE_ID=$(aws route53 change-resource-record-sets \\`,
			`  --change-batch ${shellEscape(JSON.stringify({
				Changes: [
					{
						Action: 'CREATE',
						ResourceRecordSet: { AliasTarget, Name, ResourceRecords, TTL, Type },
					}
				]
			}))} \\`,
			`  --hosted-zone-id ${HostedZoneId} \\`,
			`  | jq -r .ChangeInfo.Id) &&`,
			`aws route53 wait \\`,
			`  resource-record-sets-changed --id \${CHANGE_ID}`,
			...refresh(HostedZoneId, Type, Name),
		);
		state = { AliasTarget, HostedZoneId, Name, ResourceRecords, TTL, Type };
	}

	return commands;
};

export let recordClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { AliasTarget, HostedZoneId, Name, ResourceRecords, TTL, Type } }: Resource_<Attributes>) => [
		class_,
		name,
		replace(HostedZoneId),
		createHash('sha256').update([
			...AliasTarget != null ? [AliasTarget.DNSName, AliasTarget.EvaluateTargetHealth, AliasTarget.HostedZoneId] : [],
			Name,
			(ResourceRecords ?? []).map(r => r.Value).join(':'),
			TTL,
			Type,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ HostedZoneId, ResourceRecords, Type }) => refresh(HostedZoneId, ResourceRecords, Type),
	upsert,
};

import { create } from "../../warrior";

export let createRecord = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRecord: (get: (resource: any, prop: string) => string) => get(resource, 'Record'),
	};
};
