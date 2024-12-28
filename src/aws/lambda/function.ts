import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'function';

type Attributes = {
	Code: {
		ImageUri?: string,
		S3Bucket?: string,
		S3Key?: string,
		S3ObjectVersion?: string,
	},
	Description?: string,
	Environment?: { Variables: Record<string, string> },
	FileSystemConfigs?: { Arn: string, LocalMountPath: string }[],
	FunctionName: string,
	Handler?: string,
	ImageConfigResponse?: { ImageConfig: {
		Command: string[],
		EntryPoint: string,
		WorkingDirectory: string,
	} },
	MemorySize?: number,
	PackageType: 'Image' | 'Zip',
	Role: string,
	Runtime?: string,
	Timeout?: number,
	VpcConfig?: { SecurityGroupIds: string[], SubnetIds: string[] },
};

let delete_ = ({ FunctionName }) => [
	`aws lambda delete-function \\`,
	`  --name ${FunctionName} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { Code, FunctionName, PackageType, Role, Runtime } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws lambda create-function \\`,
			`  --code ${Object.entries(Code).map(([key, value]) => `${key}=${value}`).join(',')} \\`,
			`  --function-name ${FunctionName} \\`,
			`  --package-type ${PackageType} \\`,
			`  --role ${Role} \\`,
			...Runtime != null ? [`  --runtime ${Runtime} \\`] : [],
			`  --tags Name=${prefix}-${name} \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
			`aws lambda wait function-exists \\`,
			`  --function-name ${FunctionName}`,
		);
		state = { Code, FunctionName, PackageType, Role, Runtime };
	}

	let updates = Object
	.entries({
		Description: r => [`--description '${r}'`],
		Environment: r => [`--environment ${JSON.stringify(r ?? {})}`],
		FileSystemConfigs: r => r != null
			? [`--file-system-configs ${r.map(({ Arn, LocalMountPath }) => `Arn=${Arn},LocalMountPath=${LocalMountPath}`).join(',')}`]
			: [],
		Handler: r => [`--handler ${r}`],
		ImageConfigResponse: r => r != null
			? [`--image-config '${JSON.stringify(r.ImageConfig)}'`]
			: [],
		MemorySize: r => [`--memory-size ${r}`],
		Role: r => [`--role ${r}`],
		Runtime: r => [`--runtime ${r}`],
		Timeout: r => [`--timeout ${r}`],
		VpcConfig: r => r != null
			? [`--vpc-config SecurityGroupIds=${r.SecurityGroupIds.join(',')},SubnetIds=${r.SubnetIds.join(',')}`]
			: [],
	})
	.flatMap(([prop, transform]) => {
		let source = transform(state[prop]);
		let target = transform(attributes[prop]);
		let same = source.length === target.length;
		if (same) {
			for (let i = 0; i < source.length; i++) same &&= source[i] === target[i];
		}
		return !same ? transform(target).map(s => `  ${s} \\`) : [];
	});

	if (updates.length > 0) {
		updates.push(`  --function-name ${FunctionName} \\`);
		commands.push(
			`aws lambda update-function-configuration \\`,
			...updates.sort((a, b) => a.localeCompare(b)),
			`  | tee ${statesDirectory}/\${KEY}`,
		);
	}

	return commands;
};

export let functionClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { Code, FunctionName, PackageType } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			JSON.stringify(Code),
			FunctionName,
			PackageType,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ FunctionName }) => [
		`NAME=${FunctionName}`,
		`aws lambda get-function \\`,
		`  --function-name \${NAME} \\`,
		`  | jq .Configuration | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createFunction = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: (get: (resource: any, prop: string) => string) => get(resource, 'FunctionArn'),
		getFunctionName: (get: (resource: any, prop: string) => string) => get(resource, 'FunctionName'),
	};
};
