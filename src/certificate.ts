import { createHash } from "crypto";
import { prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'certificate';

type Attributes = {
	DomainName: string,
};

let delete_ = ({ CertificateArn }, key: string) => [
	`aws acm delete-certificate \\`,
	`  --certificate-arn ${CertificateArn} &&`,
	`rm -f \${STATE}`,
];

let refreshByArn = (key, arn) => [
	`ARN=${arn}`,
	`aws acm describe-certificate \\`,
	`  --certificate-arn \${ARN} \\`,
	`  | jq .Certificates[0] | tee \${STATE}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { DomainName } = attributes;
	let commands = [];

	let CertificateArn = `$(cat \${STATE} | jq -r .CertificateArn)`;

	if (state == null) {
		commands.push(
			`aws acm request-certificate \\`,
			`  --domain-name ${DomainName} \\`,
			`  --validation-method DNS \\`,
			`  --tags Key=Name,Value=${prefix}-${name} \\`,
			`  | tee \${STATE}`,
			// TODO add CNAME to route53 hosted znoe
			`aws acm wait certificate-validated \\`,
			`  --certificate-arn ${CertificateArn}`,
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
		class_,
		name,
		createHash('sha256').update([
			attributes.DomainName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ CertificateArn }, key: string) => refreshByArn(key, CertificateArn),
	upsert,
};

import { create } from "./warrior";

export let createCertificate = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: get => get(resource, 'CertificateArn'),
	};
};
