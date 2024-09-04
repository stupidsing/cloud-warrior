import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'distribution';

type Attributes = {
	DefaultRootObject: string,
	Origins: { Items: { DomainName: string }[] },
};

let delete_ = ({ Id }, key: string) => [
	`aws cloudfront delete-distribution \\`,
	`  --id ${Id} &&`,
	`rm -f ${getStateFilename(key)}`,
];

let refreshById = (key, id) => [
	`ID=${id}`,
	`aws cloudfront get-distribution \\`,
	`  --ids \${ID} \\`,
	`  | jq .Distribution | tee ${getStateFilename(key)}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes, key } = resource;
	let { DefaultRootObject, Origins } = attributes;
	let commands = [];

	let DistributionId = `$(cat ${getStateFilename(key)} | jq -r .Id)`;

	if (state == null) {
		let originDomainName = Origins.Items[0].DomainName;
		commands.push(
			`aws cloudfront create-distribution \\`,
			`  --default-root-object ${DefaultRootObject} \\`,
			`  --origin-domain-name ${originDomainName} \\`,
			`  | jq .Distribution | tee ${getStateFilename(key)}`,
			`aws cloudfront wait distribution-exists --ids ${DistributionId}`,
			...refreshById(key, DistributionId),
		);
		state = { DefaultRootObject, Origins: { Items: [{ DomainName: originDomainName }]} };
	}

	{
		let prop = 'DefaultRootObject';
		if (state[prop] !== attributes[prop]) {
			commands.push(
				`aws cloudfront update-distribution \\`,
				`  --default-root-object ${attributes[prop]} \\`,
				`  --id ${DistributionId} \\`,
				`  | jq .Distribution | tee ${getStateFilename(key)}`,
			);
		}
	}

	return commands;
};

export let distributionClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes }: Resource_<Attributes>) => [
		prefix,
		class_,
		name,
		attributes.DefaultRootObject,
	].join('_'),
	refresh: ({ Id }, key: string) => refreshById(key, Id),
	upsert,
};

import { create } from "./warrior";

export let createDistribution = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		...resource,
		getDistributionId: get => get(resource, 'Id'),
	};
};
