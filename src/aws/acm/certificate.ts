import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'certificate';

type Attributes = {
	DomainName: string,
};

let delete_ = ({ CertificateArn }) => [
	`aws acm delete-certificate \\`,
	`  --certificate-arn ${CertificateArn} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refreshByArn = arn => [
	`ARN=${arn}`,
	`aws acm describe-certificate \\`,
	`  --certificate-arn \${ARN} \\`,
	`  | jq .Certificates[0] | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { DomainName } = attributes;
	let commands = [];

	let CertificateArn = `$(cat ${statesDirectory}/\${KEY} | jq -r .CertificateArn)`;

	if (state == null) {
		commands.push(
			`aws acm request-certificate \\`,
			`  --domain-name ${DomainName} \\`,
			`  --validation-method DNS \\`,
			`  --tags Key=Name,Value=${prefix}-${name} \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
			// TODO add CNAME to route53 hosted znoe
			`aws acm wait certificate-validated \\`,
			`  --certificate-arn ${CertificateArn}`,
			...refreshByArn(CertificateArn),
		);
		state = { DomainName };
	}

	return commands;
};

export let certificateClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { DomainName } }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			DomainName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ CertificateArn }) => refreshByArn(CertificateArn),
	upsert,
};

import { create } from "../../warrior";

export let createCertificate = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: (get: (resource: any, prop: string) => string) => get(resource, 'CertificateArn'),
	};
};
