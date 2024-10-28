import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'repository';

type Attributes = {
	encryptionConfiguration?: { encryptionType: string, kmsKey: string },
	imageScanningConfiguration?: { scanOnPush: boolean },
	imageTagMutability?: string,
	repositoryName: string,
};

let delete_ = ({ repositoryName }) => [
	`aws ecr delete-repository \\`,
	`  --repository-name ${repositoryName} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshByName = name => [
	`NAME=${name}`,
	`aws ecr describe-repositories \\`,
	`  --repository-names \${NAME} \\`,
	`  | jq .repositories[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { encryptionConfiguration, imageScanningConfiguration, imageTagMutability, repositoryName } = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ecr create-repository \\`,
			...encryptionConfiguration != null ? [`  --encryption-configuration '${JSON.stringify(encryptionConfiguration)}' \\`] : [],
			...imageScanningConfiguration?.scanOnPush != null ? [`  --image-scanning-configuration scanOnPush=${imageScanningConfiguration.scanOnPush} \\`] : [],
			...imageTagMutability != null ? [`  --image-tag-mutability ${imageTagMutability} \\`] : [],
			`  --repository-name ${repositoryName} \\`,
			`  --tag-specifications '${JSON.stringify([
				{ ResourceType: 'repository', Tags: [{ Key: 'Name', Value: `${prefix}-${name}` }] },
			])}' \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
			`aws ecr wait \\`,
			`  repository-exists --repository-names ${repositoryName}`,
			...refreshByName(repositoryName),
		);
		state = { encryptionConfiguration, imageScanningConfiguration, imageTagMutability, repositoryName };
	}

	{
		let source = state?.['imageScanningConfiguration']?.['scanOnPush'];
		let target = attributes?.['imageScanningConfiguration']?.['scanOnPush'];
		if (source !== target) {
			commands.push(
				`aws iam put-image-scanning-configuration \\`,
				`  --image-scanning-configuration scanOnPush=${target} \\`,
				`  --repository-name ${repositoryName} \\`,
				...refreshByName(repositoryName),
			);
		}
	}

	{
		let prop = 'imageTagMutability';
		let source = state[prop];
		let target = attributes[prop];
		if (source !== target) {
			commands.push(
				`aws iam put-image-tag-mutability \\`,
				`  --image-tag-mutability ${imageTagMutability} \\`,
				`  --repository-name ${repositoryName} \\`,
				...refreshByName(repositoryName),
			);
		}
	}

	return commands;
};

export let repositoryClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { encryptionConfiguration, repositoryName } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			JSON.stringify(encryptionConfiguration),
			repositoryName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ repositoryName }) => refreshByName(repositoryName),
	upsert,
};

import { create } from "../../warrior";

export let createRepository = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getRepositoryName: get => get(resource, 'repositoryName'),
		getRepositoryUri: get => get(resource, 'repositoryUri'),
	};
};
