import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'db-subnet-group';

type Attributes = {
	DBSubnetGroupDescription: string,
	DBSubnetGroupName: string,
	Subnets: { SubnetIdentifier: string }[],
};

let delete_ = ({ DBSubnetGroupName }) => [
	`aws ec2 delete-db-subnet-group \\`,
	`  --db-subnet-group-name ${DBSubnetGroupName} &&`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let {
		DBSubnetGroupDescription,
		DBSubnetGroupName,
		Subnets,
	} = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ec2 create-db-subnet-group \\`,
			`  --db-subnet-group-description ${DBSubnetGroupDescription} \\`,
			`  --db-subnet-group-name ${DBSubnetGroupName} \\`,
			` --subnet-ids ${Subnets.map(r => r.SubnetIdentifier).join(' ')} \\`,
			`  --tag '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  | jq .DBSubnetGroup | tee ${statesDirectory}/\${KEY}`,
		);
		state = { DBSubnetGroupDescription, DBSubnetGroupName, Subnets };
	}

	let updates = Object
	.entries({
		DBSubnetGroupDescription: r => [`--db-subnet-group-description ${r}`],
		Subnets: r => [`--subnet-ids ${Subnets.map(r => r.SubnetIdentifier).join(' ')}`],
	})
	.flatMap(([prop, transform]) => {
		let source = transform(state[prop]);
		let target = transform(attributes[prop]);
		let same = source.length === target.length;
		if (same) {
			for (let i = 0; i < source.length; i++) same &&= source[i] === target[i];
		}
		return !same ? transform(target) : [];
	});

	if (updates.length > 0) {
		updates.push(`--db-subnet-group-name ${DBSubnetGroupName}`);
		commands.push(
			`aws rds modify-db-subnet-group \\`,
			...updates.sort((a, b) => a.localeCompare(b)).map(s => `  ${s} \\`),
			`  | jq -r .DBSubnetGroup | tee ${statesDirectory}/\${KEY}`,
		);
	}

	return commands;
};

export let dbSubnetGroupClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {} }: Resource_<Attributes>) => [
		class_,
		name,
	].join('_'),
	refresh: ({ DBSubnetGroupName }) => [
		`ID=${DBSubnetGroupName}`,
		`aws ec2 describe-db-subnet-groups \\`,
		`  --db-subnet-group-name \${ID} \\`,
		`  | jq .DBSubnetGroups[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createDbSubnetGroup = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getDBSubnetGroupName: get => get(resource, 'DBSubnetGroupName'),
	};
};
