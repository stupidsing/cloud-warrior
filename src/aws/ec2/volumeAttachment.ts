import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { difference, replace } from "../../utils";

let class_ = 'volume-attachment';

type Attributes = {
	Attachments: { Device: string, InstanceId: string }[],
	VolumeId: string,
};

let updateAttachments = ({ VolumeId }, attachments0, attachments1) => {
	let source = new Set<string>(attachments0.map(a => JSON.stringify({ Device: a.Device, InstanceId: a.InstanceId })));
	let target = new Set<string>(attachments1.map(a => JSON.stringify({ Device: a.Device, InstanceId: a.InstanceId })));
	let commands = [];
	let needRefresh = false;

	difference(target, source).forEach(json => {
		let { Device, InstanceId } = JSON.parse(json);
		commands.push(
			`aws ec2 attach-volume \\`,
			`  --device ${Device} \\`,
			`  --volume-id ${VolumeId} \\`,
			`  --instance-id ${InstanceId} &&`,
			`aws ec2 wait volume-in-use --volume-ids ${VolumeId}`,
		);
		needRefresh = true;
	});

	difference(source, target).forEach(json => {
		let { Device, InstanceId } = JSON.parse(json);
		commands.push(
			`aws ec2 detach-volume \\`,
			`  --device ${Device} \\`,
			`  --volume-id ${VolumeId} \\`,
			`  --instance-id ${InstanceId} &&`,
			`aws ec2 wait volume-available --volume-ids ${VolumeId}`,
		);
		needRefresh = true;
	});

	return { commands, needRefresh };
};

let delete_ = (state: { Attachments, VolumeId }) => [
	...updateAttachments(state, state.Attachments, []).commands,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = volumeId => [
	`aws ec2 describe-volumes \\`,
	`  --volume-id ${volumeId} \\`,
	`  | jq .Volumes[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { VolumeId, Attachments } = attributes;
	let commands = [];

	if (state == null) {
		state = { Attachments: [], VolumeId };
	}

	{
		let prop = 'Attachments';
		let { commands: commands_, needRefresh } = updateAttachments(attributes, state[prop], attributes[prop]);

		if (needRefresh) {
			commands.push(...commands_, ...refresh(VolumeId));
		}
	}

	return commands;
};

export let volumeAttachmentClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { VolumeId } }: Resource_<Attributes>) => [
		class_,
		name,
		replace(VolumeId),
	].join('_'),
	refresh: ({ VolumeId }) => refresh(VolumeId),
	upsert,
};

import { create } from "../../warrior";

export let createVolumeAttachment = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getVolumeId: (get: (resource: any, prop: string) => string) => get(resource, 'VolumeId'),
	};
};
