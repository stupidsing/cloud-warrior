import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'volume';

type Attributes = {
	AvailabilityZone: string,
	Size: number,
};

let delete_ = ({ VolumeId }) => [
	`aws ec2 delete-volume \\`,
	`  --volume-id ${VolumeId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { AvailabilityZone, Size } = attributes;
	let commands = [];

	let VolumeId = `$(cat ${statesDirectory}/\${KEY} | jq -r .VolumeId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-volume \\`,
			`  --availability-zone ${AvailabilityZone} \\`,
			`  --size ${Size} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
			`aws ec2 wait volume-available \\`,
			`  --volume-ids ${VolumeId}`,
		);
		state = { AvailabilityZone, Size };
	}

	return commands;
};

export let volumeClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { AvailabilityZone, Size } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			AvailabilityZone,
			Size,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ VolumeId }) => [
		`ID=${VolumeId}`,
		`aws ec2 describe-volumes \\`,
		`  --volume-ids \${ID} \\`,
		`  | jq .[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createVolume = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getVolumeId: (get: (resource: any, prop: string) => string) => get(resource, 'VolumeId'),
	};
};
