import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { replace } from "../../utils";

let class_ = 'volume-attachment';

type Attributes = {
	Device: string,
	InstanceId: string,
	VolumeId: string,
};

let delete_ = ({ Device, InstanceId, VolumeId }) => [
	`aws ec2 detach-volume \\`,
	`  --device ${Device} \\`,
	`  --volume-id ${VolumeId} \\`,
	`  --instance-id ${InstanceId} &&`,
	`aws ec2 wait volume-available --volume-ids ${VolumeId}`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = (Device, InstanceId, VolumeId) => [
	`aws ec2 describe-volumes \\`,
	`  --volume-id ${VolumeId} \\`,
	`  | jq '.Volumes[] | .Attachments[] | select(.Device == "${Device}" and .InstanceId == "'${InstanceId}'")' | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Device, InstanceId, VolumeId } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ec2 attach-volume \\`,
			`  --device ${Device} \\`,
			`  --instance-id ${InstanceId} \\`,
			`  --volume-id ${VolumeId} &&`,
			`aws ec2 wait volume-in-use --volume-ids ${VolumeId}`,
			...refresh(Device, InstanceId, VolumeId),
		);
		state = { Device, InstanceId, VolumeId };
	}

	return commands;
};

export let volumeAttachmentClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Device, InstanceId, VolumeId } }: Resource_<Attributes>) => [
		class_,
		name,
		replace(Device),
		InstanceId,
		VolumeId,
	].join('_'),
	refresh: ({ Device, InstanceId, VolumeId }) => refresh(Device, InstanceId, VolumeId),
	upsert,
};

import { create } from "../../warrior";

export let createVolumeAttachment = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getVolumeId: (get: (resource: any, prop: string) => string) => get(resource, 'VolumeId'),
	};
};
