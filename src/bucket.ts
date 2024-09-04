import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'bucket';

type Attributes = {
	Name: string,
	Region: string,
};

let delete_ = ({ Name }, key: string) => [
	`aws s3api delete-bucket \\`,
	`  --bucket ${Name} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshByName = (key, name) => [
	`NAME=${name}`,
	`aws s3api list-buckets \\`,
	`  --query "Buckets[?Name == '\${NAME}']" \\`,
	`  | jq .[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes: { Name, Region }, key } = resource;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws s3api create-bucket \\`,
			`  --bucket ${Name} \\`,
			`  --create-bucket-configuration LocationConstraint=${Region} \\`,
			`  --region ${Region}`,
			`aws s3api wait bucket-exists --bucket ${Name}`,
			...refreshByName(key, Name),
		);
		state = { Name, Region };
	}

	return commands;
};

export let bucketClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
		attributes.Name,
	].join('_'),
	refresh: ({ Name }, key: string) => refreshByName(key, Name),
	upsert,
};

import { create } from "./warrior";

export let createBucket = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getBucket: get => get(resource, 'Bucket'),
	};
};
