import { createHash } from "crypto";
import { AttributesInput, Class, Resource_ } from "./types";
import { replace } from "./utils";

let class_ = 'record';

type Attributes = {
	HostedZoneId: string,
	Name: string,
	ResourceRecords: { Value: string }[],
	TTL: number,
	Type: string,
};

let delete_ = ({ HostedZoneId, Name, ResourceRecords, TTL, Type }) => [
	`CHANGE_ID=$(aws route53 change-resource-record-sets \\`,
	`  --change-batch '${JSON.stringify({
		Changes: [
			{
				Action: 'DELETE',
				ResourceRecordSet: {
					Name,
					ResourceRecords,
					TTL,
					Type,
				},
			}
		]
	})}' \\`,
	`  --hosted-zone-id ${HostedZoneId} \\`,
	`  | jq -r .ChangeInfo.Id) &&`,
	`aws route53 wait resource-record-sets-changed \\`,
			`  --id \${CHANGE_ID}`,
	`rm -f \${STATE} \${STATE}#HostedZoneId`,
];

let refreshByHostedZoneId = (HostedZoneId, Type, Name) => [
	`aws route53 list-resource-record-sets \\`,
	`  --hosted-zone-id ${HostedZoneId} \\`,
	`  | jq '.ResourceRecordSets[] | select(.Type == "${Type}" and .Name == "${Name}")' | tee \${STATE}`,
	`echo ${JSON.stringify(HostedZoneId)} > \${STATE}#HostedZoneId`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { HostedZoneId, Name, ResourceRecords, TTL, Type } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`CHANGE_ID=$(aws route53 change-resource-record-sets \\`,
			`  --change-batch '${JSON.stringify({
				Changes: [
					{
						Action: 'CREATE',
						ResourceRecordSet: {
							Name,
							ResourceRecords,
							TTL,
							Type,
						},
					}
				]
			})}'\\`,
			`  --hosted-zone-id ${HostedZoneId} \\`,
			`  | jq -r .ChangeInfo.Id) &&`,
			`aws route53 wait \\`,
			`  resource-record-sets-changed --id \${CHANGE_ID}`,
			...refreshByHostedZoneId(HostedZoneId, Type, Name),
		);
		state = { HostedZoneId, Name, ResourceRecords, TTL, Type };
	}

	return commands;
};

export let recordClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { HostedZoneId, Name, ResourceRecords, TTL, Type } }: Resource_<Attributes>) => [
		class_,
		name,
		replace(HostedZoneId),
		createHash('sha256').update([
			Name,
			ResourceRecords.map(r => r.Value).join(':'),
			TTL,
			Type,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ HostedZoneId, ResourceRecords, Type }) => refreshByHostedZoneId(HostedZoneId, ResourceRecords, Type),
	upsert,
};

import { create } from "./warrior";

export let createRecord = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRecord: get => get(resource, 'Record'),
	};
};
