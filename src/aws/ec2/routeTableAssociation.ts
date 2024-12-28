import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { difference, replace } from "../../utils";

let class_ = 'route-table-association';

type Attributes = {
	Associations: { SubnetId: string }[],
	RouteTableId: string,
};

let updateAssociations = ({ RouteTableId }, associations0, associations1) => {
	let source = new Set<string>(associations0.map(r => r.SubnetId));
	let target = new Set<string>(associations1.map(r => r.SubnetId));
	let commands = [];
	let needRefresh = false;

	difference(target, source).forEach(subnetId => {
		commands.push(
			`aws ec2 associate-route-table \\`,
			`  --route-table-id ${RouteTableId} \\`,
			`  --subnet-id ${subnetId}`,
		);
		needRefresh = true;
	});

	difference(source, target).forEach(subnetId => {
		commands.push(
			`aws ec2 disassociate-route-table \\`,
			`  --route-table-id ${RouteTableId} \\`,
			`  --subnet-id ${subnetId}`,
		);
		needRefresh = true;
	});

	return { commands, needRefresh };
};

let delete_ = (state: { Associations, RouteTableId }) => [
	...updateAssociations(state, state.Associations, []).commands,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshById = routeTableId => [
	`aws ec2 describe-route-tables \\`,
	`  --route-table-id ${routeTableId} \\`,
	`  | jq .RouteTables[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Associations, RouteTableId } = attributes;
	let commands = [];

	if (state == null) {
		state = { Associations: [], RouteTableId };
	}

	{
		let prop = 'Associations';
		let { commands: commands_, needRefresh } = updateAssociations(attributes, state[prop], attributes[prop]);

		if (needRefresh) {
			commands.push(...commands_, ...refreshById(RouteTableId));
		}
	}

	return commands;
};

export let routeTableAssociationClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { RouteTableId } }: Resource_<Attributes>) => [
		class_,
		name,
		replace(RouteTableId),
	].join('_'),
	refresh: ({ RouteTableId }) => refreshById(RouteTableId),
	upsert,
};

import { create } from "../../warrior";

export let createRouteTableAssociation = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRouteTableId: (get: (resource: any, prop: string) => string) => get(resource, 'RouteTableId'),
	};
};
