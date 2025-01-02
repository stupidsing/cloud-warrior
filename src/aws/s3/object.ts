import { createHash } from "crypto";
import * as fs from 'fs';
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'object';

type Attributes = {
	Acl?: 'authenticated-read' | 'aws-exec-read' | 'bucket-owner-full-control' | 'bucket-owner-read' | 'log-delivery-write' | 'private' | 'public-read' | 'public-read-write',
	Bucket: string,
	Content?: string, // direct substitution in shell
	Key: string,
};

let delete_ = ({ Bucket, Key }) => [
	`aws s3api delete-object \\`,
	`  --bucket ${Bucket} \\`,
	`  --key ${Key} &&`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
	`  ${statesDirectory}/\${KEY}#Bucket \\`,
	`  ${statesDirectory}/\${KEY}#Context.text`,
];

let refresh = (Bucket, Key) => [
	`BUCKET=${Bucket} KEY_=${Key}`,
	`aws s3api list-objects-v2 \\`,
	`  --bucket \${BUCKET} \\`,
	`  --query "Contents[?Key == '\${KEY_}']" \\`,
	`  | jq .[0] | tee ${statesDirectory}/\${KEY}`,
	`echo '${JSON.stringify(Bucket)}' > ${statesDirectory}/\${KEY}#Bucket`,
	`aws s3 cp s3://\${BUCKET}/\${KEY_} ${statesDirectory}/\${KEY}#Content.text`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Acl, Bucket, Content, Key } = attributes;
	let commands = [];

	if (state == null || state.Acl !== Acl || state.Content !== Content) {
		if (Content != null) {
			commands.push(`echo -n ${JSON.stringify(Content)} > ${statesDirectory}/\${KEY}#Content.text`);
		}

		commands.push(
			`aws s3api put-object \\`,
			...Acl != null ? [`  --acl ${Acl} \\`] : [],
			`  --body ${statesDirectory}/\${KEY}#Content.text \\`,
			`  --bucket ${Bucket} \\`,
			`  --key ${Key}`,
			`aws s3api wait object-exists \\`,
			`  --bucket ${Bucket} \\`,
			`  --key ${Key}`,
			`echo '${JSON.stringify(Bucket)}' > ${statesDirectory}/\${KEY}#Bucket`,
			`echo '${JSON.stringify({ ...attributes, Content: undefined })}' > ${statesDirectory}/\${KEY}`,
		);
		state = { Acl, Bucket, Key };
	}

	return commands;
};

export let objectClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Acl, Bucket, Content, Key } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Acl,
			Bucket,
			Content,
			Key,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ Bucket, Key }) => refresh(Bucket, Key),
	upsert,
};

import { create } from "../../warrior";

export let createObject = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
	};
};
