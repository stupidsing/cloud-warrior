import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { shellEscape } from "../../utils";

let class_ = 'address-association';

type Attributes = {
	AllocationId: string,
	InstanceId: string,
};

let delete_ = ({ AssociationId }) => [
	`aws ec2 disassociate-address \\`,
	`  --association-id ${AssociationId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = (AllocationId, InstanceId) => [
	`ALLOCATION_ID=${AllocationId}`,
	`INSTANCE_ID=${InstanceId}`,
	`aws ec2 describe-addresses \\`,
	`  --allocation-ids \${ALLOCATION_ID} \\`,
	`  --filters "Name=instance-id,Value=\${INSTANCE_ID}" \\`,
	`  | jq .Addresses[0] | tee ${statesDirectory}/\${KEY}`
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { AllocationId, InstanceId } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`ASSOCIATION_ID=$(aws ec2 associate-address \\`,
			`  --allocation-id ${AllocationId} \\`,
			`  --instance-id ${InstanceId} | jq -r .AssociationId)`,
			`echo ${shellEscape(JSON.stringify({ AllocationId, AssociationId: '${ASSOCIATION_ID}', InstanceId }))} | jq . > ${statesDirectory}/\${KEY}`,
		);
		state = { InstanceId, AllocationId };
	}

	return commands;
};

export let addressAssociationClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { AllocationId, InstanceId } }: Resource_<Attributes>) => [
		class_,
		name,
		AllocationId,
		InstanceId,
	].join('_'),
	refresh: ({ AllocationId, InstanceId }) => refresh(AllocationId, InstanceId),
	upsert,
};

import { create } from "../../warrior";

export let createAddressAssociation = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
	};
};
