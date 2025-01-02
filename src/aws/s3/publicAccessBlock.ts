import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'public-access-block';

type Attributes = {
	BlockPublicAcls: boolean,
	BlockPublicPolicy: boolean,
	Bucket: string,
	IgnorePublicAcls: boolean,
	RestrictPublicBuckets: boolean,
};

let delete_ = ({ Bucket }) => [
	`aws s3api delete-public-access-block \\`,
	`  --bucket ${Bucket} &&`,
	`rm -f ${statesDirectory}/\${KEY} ${statesDirectory}/\${KEY}#Bucket`,
];

let refresh = Bucket => [
	`BUCKET=${Bucket}`,
	`aws s3api get-public-access-block \\`,
	`  --bucket \${BUCKET} \\`,
	`  | jq .PublicAccessBlockConfiguration | tee ${statesDirectory}/\${KEY}`,
	`echo '${JSON.stringify(Bucket)}' > ${statesDirectory}/\${KEY}#Bucket`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { BlockPublicAcls, BlockPublicPolicy, Bucket, IgnorePublicAcls, RestrictPublicBuckets } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws s3api put-public-access-block \\`,
			`  --bucket ${Bucket} \\`,
			`  --public-access-block-configuration BlockPublicAcls=${BlockPublicAcls},BlockPublicPolicy=${BlockPublicPolicy},IgnorePublicAcls=${IgnorePublicAcls},RestrictPublicBuckets=${RestrictPublicBuckets}`,
			...refresh(Bucket),
		);
		state = { BlockPublicAcls, BlockPublicPolicy, Bucket, IgnorePublicAcls, RestrictPublicBuckets };
	}

	return commands;
};

export let publicAccessBlockClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { BlockPublicAcls, BlockPublicPolicy, Bucket, IgnorePublicAcls, RestrictPublicBuckets } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			BlockPublicAcls,
			BlockPublicPolicy,
			Bucket,
			IgnorePublicAcls,
			RestrictPublicBuckets,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ Bucket }) => refresh(Bucket),
	upsert,
};

import { create } from "../../warrior";

export let createPublicAccessBlock = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
	};
};
