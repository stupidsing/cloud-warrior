import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'certificate';

type Attributes = {
	DomainName: string,
};

let delete_ = ({ CertificateArn }, key: string) => [
	`aws acm delete-certificate \\`,
	`  --certificate-arn ${CertificateArn} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshByArn = (key, arn) => [
	`ARN=${arn}`,
	`aws acm describe-certificate \\`,
	`  --certificate-arn \${ARN} \\`,
	`  | jq .Certificates[0] | tee ${getStateFilename(key)}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes: { DomainName }, key } = resource;
	let commands = [];

	let CertificateArn = `$(cat ${getStateFilename(key)} | jq -r .CertificateArn)`;

	if (state == null) {
		commands.push(
			`aws acm request-certificate \\`,
			`  --domain-name ${DomainName} \\`,
			`  --validation-method DNS \\`,
			`  --tags Key=Name,Value='${prefix}-${name}' \\`,
			`  | tee ${getStateFilename(key)}`,
			// TODO add CNAME to route53 hosted znoe
			`aws acm wait certificate-validated --certificate-arn ${CertificateArn}`,
			...refreshByArn(key, CertificateArn),
		);
		state = { DomainName };
	}

	return commands;
};

export let certificateClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
		attributes.DomainName,
	].join('_'),
	refresh: ({ CertificateArn }, key: string) => refreshByArn(key, CertificateArn),
	upsert,
};

import { create } from "./warrior";

export let createCertificate = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getArn: get => get(resource, 'CertificateArn'),
	};
};
