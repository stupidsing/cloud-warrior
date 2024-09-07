import { statesDirectory } from "../constants";
import { AttributesInput, Class, Resource_ } from "../types";
import { difference, replace } from "../utils";

let class_ = 'internet-gateway-attachment';

type Attributes = {
	InternetGatewayId: string,
	Attachments: { VpcId: string }[],
};

let updateAttachments = ({ InternetGatewayId }, attachments0, attachments1) => {
	let source = new Set<string>(attachments0.map(r => r.VpcId));
	let target = new Set<string>(attachments1.map(r => r.VpcId));
	let commands = [];
	let needRefresh = false;

	difference(target, source).forEach(VpcId => {
		commands.push(
			`aws ec2 attach-internet-gateway \\`,
			`  --internet-gateway-id ${InternetGatewayId} \\`,
			`  --vpc-id ${VpcId}`,
		);
		needRefresh = true;
	});

	difference(source, target).forEach(VpcId => {
		commands.push(
			`aws ec2 detach-internet-gateway \\`,
			`  --internet-gateway-id ${InternetGatewayId} \\`,
			`  --vpc-id ${VpcId}`,
		);
		needRefresh = true;
	});

	return { commands, needRefresh };
};

let delete_ = (state: { Attachments, InternetGatewayId }) => [
	...updateAttachments(state, state.Attachments, []).commands,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshById = internetGatewayId => [
	`aws ec2 describe-internet-gateways \\`,
	`  --internet-gateway-id ${internetGatewayId} \\`,
	`  | jq .InternetGateways[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { InternetGatewayId, Attachments } = attributes;
	let commands = [];

	if (state == null) {
		state = { Attachments: [], InternetGatewayId };
	}

	{
		let prop = 'Attachments';
		let { commands: commands_, needRefresh } = updateAttachments(attributes, state[prop], attributes[prop]);

		if (needRefresh) {
			commands.push(...commands_, ...refreshById(InternetGatewayId));
		}
	}

	return commands;
};

export let internetGatewayAttachmentClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { InternetGatewayId } }: Resource_<Attributes>) => [
		class_,
		name,
		replace(InternetGatewayId),
	].join('_'),
	refresh: ({ InternetGatewayId }) => refreshById(InternetGatewayId),
	upsert,
};

import { create } from "./warrior";

export let createInternetGatewayAttachment = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getInternetGatewayId: get => get(resource, 'InternetGatewayId'),
	};
};
