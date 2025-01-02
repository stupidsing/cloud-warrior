import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'route-table';

type Attributes = {
	VpcId: string,
};

let delete_ = ({ RouteTableId }) => [
	`aws ec2 delete-route-table \\`,
	`  --route-table-id ${RouteTableId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { VpcId } = attributes;
	let commands = [];

	let RouteTableId = `$(cat ${statesDirectory}/\${KEY} | jq -r .RouteTableId)`;

	if (state == null) {
		commands.push(
			`aws ec2 create-route-table \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: class_, Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  --vpc-id ${VpcId} \\`,
			`  | jq .RouteTable | tee ${statesDirectory}/\${KEY}`,
		);
		state = { VpcId };
	}

	return commands;
};

export let routeTableClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { VpcId } }: Resource_<Attributes>) => [
		class_,
		name,
		VpcId,
	].join('_'),
	refresh: ({ RouteTableId }) => [
		`ID=${RouteTableId}`,
		`aws ec2 describe-route-tables \\`,
		`  --route-table-ids \${ID} \\`,
		`  | jq .RouteTables[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createRouteTable = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRouteTableId: (get: (resource: any, prop: string) => string) => get(resource, 'RouteTableId'),
	};
};
