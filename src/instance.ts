import { getStateFilename, prefix } from "./constants";
import { Class, Resource } from "./types";

let class_ = 'instance';

let getKey = ({ name, attributes }: Resource) => [
	prefix,
	class_,
	name,
	attributes.InstanceType,
	attributes.ImageId,
].join('_');

let getStateFilename_ = (resource: Resource) => getStateFilename(getKey(resource));

let delete_ = (state, key: string) => [
	`aws ec2 terminate-instances \\`,
	`  --instance-ids ${state.InstanceId}`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshById = (key, id) => [
	`aws ec2 describe-instances \\`,
	`  --instance-ids ${id} \\`,
	`  | jq .Reservations[0].Instances[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource) => {
	let { attributes } = resource;
	let commands = [];

	if (state == null) {
		let { name, attributes: { ImageId, InstanceType, SecurityGroups, SubnetId } } = resource;
		commands.push(
			`aws ec2 run-instances \\`,
			...(SecurityGroups.length > 0 ? [`  --security-groups ${SecurityGroups.join(',')} \\`] : []),
			`  --image-id ${ImageId} \\`,
			`  --instance-type ${InstanceType} \\`,
			`  --subnet-id ${SubnetId} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | jq .Instances[0] | tee ${getStateFilename_(resource)}`,
		);
		state = { SecurityGroups };
	}

	let InstanceId = `$(cat ${getStateFilename_(resource)} | jq -r .InstanceId)`;

	{
		let prop = 'SecurityGroups';
		if (state[prop] !== attributes[prop]) {
			let values = attributes[prop];
			if (values.length > 0)
				commands.push(
					`aws ec2 modify-instance-attribute \\`,
					...values.length > 0 ? [`  --groups ${values.join(',')} \\`] : [],
					`  --instance-id ${InstanceId}`,
					...refreshById(getKey(resource), InstanceId),
				);
			}
	}

	return commands;
};

export let instanceClass: () => Class = () => {
	return {
		class_,
		delete_,
		getKey,
		refresh: ({ InstanceId }, key: string) => refreshById(key, InstanceId),
		upsert,
	};
};
