import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'certificate';

type Attributes = {
	DomainName: string,
};

let delete_ = ({ CertificateArn }) => [
	`AWS_DEFAULT_REGION=us-east-1 \\`,
	`aws acm delete-certificate \\`,
	`  --certificate-arn ${CertificateArn} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = CertificateArn => [
	`ARN=${CertificateArn}`,
	`AWS_DEFAULT_REGION=us-east-1 \\`,
	`aws acm describe-certificate \\`,
	`  --certificate-arn \${ARN} \\`,
	`  | jq .Certificate | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { DomainName } = attributes;
	let commands = [];

	let CertificateArn = `$(cat ${statesDirectory}/\${KEY} | jq -r .CertificateArn)`;

	if (state == null) {
		commands.push(
			`AWS_DEFAULT_REGION=us-east-1 \\`,
			`aws acm request-certificate \\`,
			`  --domain-name ${DomainName} \\`,
			`  --validation-method DNS \\`,
			`  --tags Key=Name,Value=${prefix}-${name} \\`,
			`  | tee ${statesDirectory}/\${KEY}`,
			...refresh(CertificateArn),
			// TODO add CNAME to route53 hosted znoe
			`AWS_DEFAULT_REGION=us-east-1 \\`,
			`aws acm wait certificate-validated \\`,
			`  --certificate-arn ${CertificateArn}`,
			...refresh(CertificateArn),
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
	refresh: ({ CertificateArn }) => refresh(CertificateArn),
	upsert,
};

import { create } from "../../warrior";

export let createCertificate = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getArn: (get: (resource: any, prop: string) => string) => get(resource, 'CertificateArn'),
		getValidationName: (get: (resource: any, prop: string) => string) => get(resource, 'DomainValidationOptions[0].ResourceRecord.Name'),
		getValidationValue: (get: (resource: any, prop: string) => string) => get(resource, 'DomainValidationOptions[0].ResourceRecord.Value'),
		/*
		getDomainValidationOptions: (get: (resource: any, prop: string) => {
			DomainName: string,
			ResourceRecord: { Name: string, Type: string, Value: string },
			ValidationDomain: string,
			ValidationMethod: string,
			ValidationStatus: string,
		}) => get(resource, 'DomainValidationOptions'),
		*/
	};
};
