import { createHash } from "crypto";
import { getStateFilename } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'record';

type Attributes = {
	HostedZoneId: string,
	Name: string,
	TTL: number,
	Type: string,
	Value: string,
};

let delete_ = ({ HostedZoneId, Name, TTL, Type, Value }, key: string) => [
	`CHANGE_ID=$(aws route53 change-resource-record-sets \\`,
	`  --change-batch '${JSON.stringify({
		Changes: [
			{
				Action: 'DELETE',
				ResourceRecordSet: {
					Name,
					ResourceRecords: [
						{ Value },
					],
					TTL,
					Type,
				},
			}
		]
	})}' \\`,
	`  --hosted-zone-id ${HostedZoneId} \\`,
	`  | jq -r .ChangeInfo.Id) &&`,
	`aws route53 wait resource-record-sets-changed --id \${CHANGE_ID}`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshByHostedZoneId = (key, HostedZoneId, Type, Name) => [
	`aws route53 list-resource-record-sets \\`,
	`  --hosted-zone-id ${HostedZoneId} \\`,
	`  | jq '.ResourceRecordSets[] | select(.Type == "${Type}" && .Name == "${Name}")' | tee ${getStateFilename(key)}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { HostedZoneId, Name, TTL, Type, Value } = attributes;
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
							ResourceRecords: [
								{ Value },
							],
							TTL,
							Type,
						},
					}
				]
			})}'\\`,
			`  --hosted-zone-id ${HostedZoneId} \\`,
			`  | jq -r .ChangeInfo.Id) &&`,
			`aws route53 wait resource-record-sets-changed --id \${CHANGE_ID}`,
			...refreshByHostedZoneId(key, HostedZoneId, Type, Name),
		);
		state = { HostedZoneId, Name, TTL, Type, Value };
	}

	return commands;
};

export let recordClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		class_,
		name,
		attributes.HostedZoneId,
		createHash('sha256').update([
			attributes.Name,
			attributes.TTL,
			attributes.Type,
			attributes.Value,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ HostedZoneId, Type, Name }, key: string) => refreshByHostedZoneId(key, HostedZoneId, Type, Name),
	upsert,
};

import { create } from "./warrior";

export let createRecord = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRecord: get => get(resource, 'Record'),
	};
};
