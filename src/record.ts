import { createHash } from "crypto";
import { getStateFilename } from "./constants";
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

let delete_ = ({ HostedZoneId, Name, ResourceRecords, TTL, Type }, key: string) => [
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
	`aws route53 wait resource-record-sets-changed --id \${CHANGE_ID}`,
	`rm -f ${getStateFilename(key)} ${getStateFilename(key)}#HostedZoneId`,
];

let refreshByHostedZoneId = (key, HostedZoneId, Type, Name) => [
	`aws route53 list-resource-record-sets \\`,
	`  --hosted-zone-id ${HostedZoneId} \\`,
	`  | jq '.ResourceRecordSets[] | select(.Type == "${Type}" and .Name == "${Name}")' | tee ${getStateFilename(key)}`,
	`echo ${JSON.stringify(HostedZoneId)} > ${getStateFilename(key)}#HostedZoneId`,
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
			`aws route53 wait resource-record-sets-changed --id \${CHANGE_ID}`,
			...refreshByHostedZoneId(key, HostedZoneId, Type, Name),
		);
		state = { HostedZoneId, Name, ResourceRecords, TTL, Type };
	}

	return commands;
};

export let recordClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		class_,
		name,
		replace(attributes.HostedZoneId),
		createHash('sha256').update([
			attributes.Name,
			attributes.ResourceRecords.map(r => r.Value).join(':'),
			attributes.TTL,
			attributes.Type,
		].join('_')).digest('base64').slice(0, 4),
	].join('_'),
	refresh: ({ HostedZoneId, ResourceRecords, Type }, key: string) => refreshByHostedZoneId(key, HostedZoneId, ResourceRecords, Type),
	upsert,
};

import { create } from "./warrior";

export let createRecord = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRecord: get => get(resource, 'Record'),
	};
};
