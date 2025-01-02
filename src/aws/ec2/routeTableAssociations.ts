import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { difference, replace } from "../../utils";

let class_ = 'route-table-association';

type Attributes = {
	Associations: {
		RouteTableAssociationId?: string,
		SubnetId: string,
	}[],
	RouteTableId: string,
};

let updateAssociations = ({ RouteTableId }, associations0, associations1) => {
	let associationBySubnetId0 = {};
	let associationBySubnetId1 = {};
	for (let association of associations0) associationBySubnetId0[association.SubnetId] = association;
	for (let association of associations1) associationBySubnetId1[association.SubnetId] = association;
	let source = new Set<string>(Object.keys(associationBySubnetId0));
	let target = new Set<string>(Object.keys(associationBySubnetId1));
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
			`  --association-id ${associationBySubnetId0[subnetId].RouteTableAssociationId}`,
		);
		needRefresh = true;
	});

	return { commands, needRefresh };
};

let delete_ = (state: { Associations, RouteTableId }) => [
	...updateAssociations(state, state.Associations, []).commands,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = RouteTableId => [
	`aws ec2 describe-route-tables \\`,
	`  --route-table-id ${RouteTableId} \\`,
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
			commands.push(...commands_, ...refresh(RouteTableId));
		}
	}

	return commands;
};

export let routeTableAssociationsClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { RouteTableId } }: Resource_<Attributes>) => [
		class_,
		name,
		replace(RouteTableId),
	].join('_'),
	refresh: ({ RouteTableId }) => refresh(RouteTableId),
	upsert,
};

import { create } from "../../warrior";

export let createRouteTableAssociations = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRouteTableId: (get: (resource: any, prop: string) => string) => get(resource, 'RouteTableId'),
	};
};
