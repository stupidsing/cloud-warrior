import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'bucket-cors';

type Attributes = {
	Bucket: string,
	CORSRules: {
		AllowedOrigins?: string[],
		AllowedHeaders?: string[],
		AllowedMethods?: string[],
		ExposeHeaders?: string[],
		MaxAgeSeconds?: number,
	}[],
};

let delete_ = ({ Bucket }) => [
	`aws s3api delete-bucket-cors \\`,
	`  --bucket ${Bucket} &&`,
	`rm -f ${statesDirectory}/\${KEY} ${statesDirectory}/\${KEY}#Bucket`,
];

let refresh = Bucket => [
	`BUCKET=${Bucket}`,
	`aws s3api get-bucket-cors \\`,
	`  --bucket \${BUCKET} \\`,
	`  | tee ${statesDirectory}/\${KEY}`,
	`echo '${JSON.stringify(Bucket)}' > ${statesDirectory}/\${KEY}#Bucket`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Bucket, CORSRules } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws s3api put-bucket-cors \\`,
			`  --bucket ${Bucket} \\`,
			`  --cors-configuration '${JSON.stringify({ CORSRules })}'`,
			...refresh(Bucket),
		);
		state = { Bucket, CORSRules };
	}

	return commands;
};

export let bucketCorsClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Bucket, CORSRules } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Bucket,
			JSON.stringify(CORSRules),
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ Bucket }) => refresh(Bucket),
	upsert,
};

import { create } from "../../warrior";

export let createBucketCors = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
	};
};
