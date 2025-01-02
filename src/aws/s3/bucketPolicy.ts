import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'bucket-policy';

type Attributes = {
	Bucket: string,
	Policy: PolicyDocument,
};

let delete_ = ({ Bucket }) => [
	`aws s3api delete-bucket-policy \\`,
	`  --bucket ${Bucket} &&`,
	`rm -f ${statesDirectory}/\${KEY} ${statesDirectory}/\${KEY}#Bucket`,
];

let refresh = Bucket => [
	`BUCKET=${Bucket}`,
	`aws s3api get-bucket-policy \\`,
	`  --bucket \${BUCKET} \\`,
	`  | tee ${statesDirectory}/\${KEY}`,
	`echo '${JSON.stringify(Bucket)}' > ${statesDirectory}/\${KEY}#Bucket`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Bucket, Policy } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws s3api put-bucket-policy \\`,
			`  --bucket ${Bucket} \\`,
			`  --policy '${JSON.stringify(Policy)}'`,
			...refresh(Bucket),
		);
		state = { Bucket, Policy };
	}

	return commands;
};

export let bucketPolicyClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Bucket, Policy } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Bucket,
			JSON.stringify(Policy),
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ Bucket }) => refresh(Bucket),
	upsert,
};

import { create } from "../../warrior";
import { PolicyDocument } from "../aws";

export let createBucketPolicy = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
	};
};
