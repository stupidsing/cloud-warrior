import { createHash } from "crypto";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'bucket';

type Attributes = {
	Name: string,
	Region: string,
};

let delete_ = ({ Name }) => [
	`aws s3api delete-bucket \\`,
	`  --bucket ${Name} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshByName = name => [
	`NAME=${name}`,
	`aws s3api list-buckets \\`,
	`  --query "Buckets[?Name == '\${NAME}']" \\`,
	`  | jq .[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Name, Region } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws s3api create-bucket \\`,
			`  --bucket ${Name} \\`,
			`  --create-bucket-configuration LocationConstraint=${Region} \\`,
			`  --region ${Region}`,
			`aws s3api wait bucket-exists \\`,
			`  --bucket ${Name}`,
			...refreshByName(Name),
		);
		state = { Name, Region };
	}

	return commands;
};

export let bucketClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Name } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Name,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ Name }) => refreshByName(Name),
	upsert,
};

import { create } from "./warrior";
import { statesDirectory } from "./constants";

export let createBucket = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getBucket: get => get(resource, 'Bucket'),
	};
};
