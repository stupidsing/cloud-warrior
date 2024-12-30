import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { difference, replace } from "../../utils";

let class_ = 'route';

type Attributes = {
	Routes: {
		DestinationCidrBlock?: string,
		GatewayId?: string,
		NatGatewayId?: string,
		VpcEndpointId?: string,
	}[],
	RouteTableId: string,
};

let updateRoutes = ({ RouteTableId }, routes0, routes1) => {
	let routes0_ = routes0.filter(r => r.Origin === 'CreateRoute');
	let routes1_ = routes1;
	let source = new Set<string>(routes0_.map(r => JSON.stringify({
		DestinationCidrBlock: r.DestinationCidrBlock,
		GatewayId: r.GatewayId,
		NatGatewayId: r.NatGatewayId,
		VpcEndpointId: r.VpcEndpointId,
	})));
	let target = new Set<string>(routes1_.map(r => JSON.stringify({
		DestinationCidrBlock: r.DestinationCidrBlock,
		GatewayId: r.GatewayId,
		NatGatewayId: r.NatGatewayId,
		VpcEndpointId: r.VpcEndpointId,
	})));
	let commands = [];
	let needRefresh = false;

	difference(target, source).forEach(json => {
		let { DestinationCidrBlock, GatewayId, NatGatewayId, VpcEndpointId } = JSON.parse(json);
		commands.push(
			`aws ec2 create-route \\`,
			...DestinationCidrBlock != null ? [`  --destination-cidr-block ${DestinationCidrBlock} \\`] : [],
			...GatewayId != null ? [`  --gateway-id ${GatewayId} \\`] : [],
			...NatGatewayId != null ? [`  --nat-gateway-id ${NatGatewayId} \\`] : [],
			...VpcEndpointId != null ? [`  --vpc-endpoint-id ${VpcEndpointId} \\`] : [],
			`  --route-table-id ${RouteTableId}`,
		);
		needRefresh = true;
	});

	difference(source, target).forEach(json => {
		let { DestinationCidrBlock, GatewayId, NatGatewayId, VpcEndpointId } = JSON.parse(json);
		commands.push(
			`aws ec2 delete-route \\`,
			...DestinationCidrBlock != null ? [`  --destination-cidr-block ${DestinationCidrBlock} \\`] : [],
			`  --route-table-id ${RouteTableId}`,
		);
		needRefresh = true;
	});

	return { commands, needRefresh };
};

let delete_ = (state: { Routes, RouteTableId }) => [
	...updateRoutes(state, state.Routes, []).commands,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshById = routeTableId => [
	`aws ec2 describe-route-tables \\`,
	`  --route-table-id ${routeTableId} \\`,
	`  | jq .RouteTables[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Routes, RouteTableId } = attributes;
	let commands = [];

	if (state == null) {
		state = { Routes: [], RouteTableId };
	}

	{
		let prop = 'Routes';
		let { commands: commands_, needRefresh } = updateRoutes(attributes, state[prop], attributes[prop]);

		if (needRefresh) {
			commands.push(...commands_, ...refreshById(RouteTableId));
		}
	}

	return commands;
};

export let routesClass: Class = {
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

export let createRoutes = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRouteTableId: (get: (resource: any, prop: string) => string) => get(resource, 'RouteTableId'),
	};
};
