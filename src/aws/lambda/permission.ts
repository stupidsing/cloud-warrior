import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'permission';

type Attributes = {
	Action: string,
	FunctionName: string,
	Principal: string,
	SourceArn: string,
	StatementId: string,
};

let delete_ = ({ FunctionName, StatementId }) => [
	`aws lambda delete-permission \\`,
	`  --function-name ${FunctionName} \\`,
	`  --statement-id ${StatementId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Action, FunctionName, Principal, SourceArn, StatementId } = attributes;
	let commands = [];

	let UUID = `$(cat ${statesDirectory}/\${KEY} | jq -r .UUID)`;

	if (state == null) {
		commands.push(
			`aws lambda add-permission \\`,
			`  --action ${Action} \\`,
			`  --function-name ${FunctionName} \\`,
			`  --principal ${Principal} \\`,
			`  --source-arn ${SourceArn} \\`,
			`  --statement-id ${StatementId} \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
		);
		state = { Action, FunctionName, Principal, SourceArn, StatementId };
	}

	return commands;
};

export let permissionClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Action, FunctionName, Principal, SourceArn, StatementId } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Action,
			FunctionName,
			Principal,
			SourceArn,
			StatementId,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: () => [],
	upsert,
};

import { create } from "../../warrior";

export let createPermission = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
	};
};
