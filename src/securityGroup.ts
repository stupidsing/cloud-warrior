import { getStateFilename, prefix } from "./constants";
import { Class, Resource } from "./types";

let class_ = 'security-group';

let getKey = ({ name, attributes }: Resource) => [
	prefix,
	class_,
	name,
	attributes.VpcId,
	attributes.GroupName,
	attributes.Description,
].join('_');

let getStateFilename_ = (resource: Resource) => getStateFilename(getKey(resource));

let delete_ = (state, key: string) => [
	`aws ec2 delete-security-group \\`,
	`  --group-name ${state.GroupName}`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshByGroupName = (key, groupName) => [
	`aws ec2 describe-security-groups \\`,
	`  --group-names ${groupName} \\`,
	`  | jq .SecurityGroups[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state, resource: Resource) => {
	let { attributes } = resource;
	let commands = [];

	if (state == null) {
		let { name, attributes: { Description, GroupName, VpcId } } = resource;
		commands.push(
			`aws ec2 create-security-group \\`,
			`  --description ${Description} \\`,
			`  --group-name ${GroupName} \\`,
			`  --vpc-id ${VpcId} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'securityGroup', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}'`,
			...refreshByGroupName(getKey(resource), GroupName),
		);
		state = { Description, GroupName, VpcId };
	}

	let GroupId = `$(cat ${getStateFilename_(resource)} | jq -r .GroupId)`;

	return commands;
};

export let securityGroupClass: () => Class = () => {
	return {
		class_,
		delete_,
		getKey,
		refresh: ({ GroupName }, key: string) => refreshByGroupName(key, GroupName),
		upsert,
	};
};
