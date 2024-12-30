import { createHash } from "crypto";
import * as fs from 'fs';
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'key-pair';

type Attributes = {
	Filename: string,
	KeyName: string,
};

let delete_ = ({ KeyName }) => [
	`aws ec2 delete-key-pair \\`,
	`  --key-name ${KeyName} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Filename, KeyName } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ec2 import-key-pair \\`,
			`  --key-name ${KeyName} \\`,
			`  --public-key-material fileb://${Filename} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'key-pair', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
		);
		state = { Filename, KeyName };
	}

	return commands;
};

export let keyPairClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Filename, KeyName } }: Resource_<Attributes>) => [
		class_,
		name,
		KeyName,
		createHash('sha256').update([
			fs.readFileSync(Filename),
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ KeyName }) => [
		`NAME=${KeyName}`,
		`aws ec2 describe-key-pairs \\`,
		`  --key-names \${NAME} \\`,
		`  | jq .KeyPairs[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createKeyPair = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getKeyName: (get: (resource: any, prop: string) => string) => get(resource, 'KeyName'),
	};
};
