import { PolicyDocument } from "./aws";
import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'policy';

type Attributes = {
	Description?: string,
	PolicyDocument: PolicyDocument,
	PolicyName: string,
};

let delete_ = (state, key: string) => [
	`aws iam delete-policy \\`,
	`  --policy-arn ${state.Arn} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshByArn = (key, arn) => [
	`ARN=${arn}`,
	`aws iam get-policy \\`,
	`  --policy-arn \${ARN} \\`,
	`  | jq .Policy | tee ${getStateFilename(key)}`,
	`aws iam get-policy-version \\`,
	`  --policy-arn \${ARN} \\`,
	`  --version-id $(aws iam list-policy-version --policy-arn \${ARN} | jq -r '.Versions | map(select(.IsDefaultVersion).VersionId)[0]') \\`,
	`  | jq .PolicyDocument | tee ${getStateFilename(key)}#PolicyDocument`,
];

let upsert = (state, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { Description, PolicyDocument, PolicyName } = attributes;
	let commands = [];

	let PolicyArn = `$(cat ${getStateFilename(key)} | jq -r .Arn)`;

	if (state == null) {
		commands.push(
			`echo '${JSON.stringify(PolicyDocument)}' > /tmp/policy_document_${key}.json`,
			`aws iam create-policy \\`,
			...Description != null ? [`  --description ${Description} \\`] : [],
			`  --policy-document file:///tmp/policy_document_${key}.json \\`,
			`  --policy-name ${PolicyName} \\`,
			`  --tags Key=Name,Value='${prefix}-${name}' \\`,
			`  | jq .Policy | tee ${getStateFilename(key)}`,
			`aws iam wait policy-exists --policy-arn ${PolicyArn}`,
			`echo ${JSON.stringify(PolicyDocument)} | tee ${getStateFilename(key)}#PolicyDocument`,
		);
		state = { Description, PolicyDocument, PolicyName };
	}

	{
		let prop = 'PolicyDocument';
		let source = JSON.stringify(state[prop]);
		let target = JSON.stringify(attributes[prop]);
		if (source !== target) {
			commands.push(
				`aws iam delete-policy-version \\`,
				`  --policy-arn ${PolicyArn} \\`,
				`  --version-id $(aws iam list-policy-version --policy-arn ${PolicyArn} | jq -r '.Versions | map(select(.IsDefaultVersion | not).VersionId)[0]')`,
				`echo '${target}' > /tmp/policy_document_${key}.json`,
				`aws iam create-policy-version \\`,
				`  --policy-arn ${PolicyArn} \\`,
				`  --policy-document '${PolicyDocument}' \\`,
				`  --set-as-default`,
				...refreshByArn(key, PolicyArn),
			);
		}
	}

	return commands;
};

export let policyClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
		attributes.PolicyName,
		attributes.Description,
	].join('_'),
	refresh: ({ PolicyArn }, key: string) => refreshByArn(key, PolicyArn),
	upsert,
};

import { create } from "./warrior";

export let createPolicy = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getArn: get => get(resource, 'Arn'),
		getPolicyName: get => get(resource, 'PolicyName'),
	};
};
