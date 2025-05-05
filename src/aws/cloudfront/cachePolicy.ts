import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { equals, shellEscape } from "../../utils";

let class_ = 'cache-policy';

type Attributes = {
	CachePolicyConfig: {
		Comment?: string,
		DefaultTTL?: number,
		MaxTTL?: number,
		MinTTL?: number,
		Name: string,
		ParametersInCacheKeyAndForwardedToOrigin: {
			CookiesConfig: {
				CookieBehavior: string,
				Cookies?: { Items?: string[], Quantity: number },
			},
			EnableAcceptEncodingBrotli: boolean,
			EnableAcceptEncodingGzip: boolean,
			HeadersConfig: {
				HeaderBehavior: string,
				Headers?: { Items?: string[], Quantity: number },
			},
			QueryStringsConfig: {
				QueryStringBehavior: string,
				QueryStrings?: { Items?: string[], Quantity: number },
			},
		},
	},
};

let delete_ = ({ Id }) => [
	`aws cloudfront delete-cache-policy \\`,
	`  --id ${Id} \\`,
	`  --if-match $(aws cloudfront get-cache-policy --id ${Id} | jq -r .ETag) &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = cachePolicyId => [
	`ID=${cachePolicyId}`,
	`aws cloudfront get-cache-policy \\`,
	`  --id \${ID} \\`,
	`  | jq .CachePolicy | tee ${statesDirectory}/\${KEY}`
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { CachePolicyConfig } = attributes;
	let commands = [];

	let CachePolicyId = `$(cat ${statesDirectory}/\${KEY} | jq -r .Id)`;

	if (state == null) {
		commands.push(
			`aws cloudfront create-cache-policy \\`,
			`  --cache-policy-config ${shellEscape(JSON.stringify(CachePolicyConfig))} \\`,
			`  | jq .CachePolicy | tee ${statesDirectory}/\${KEY}`,
		);
		state = { CachePolicyConfig };
	}

	{
		let prop = 'CachePolicy';
		let source = state[prop];
		let target = attributes[prop];
		if (!equals(source, target)) {
			commands.push(
				`ID=${CachePolicyId}`,
				`aws cloudfront update-cache-policy \\`,
				`  --cache-policy-config ${shellEscape(JSON.stringify(target))} \\`,
				`  --id \${ID} \\`,
				`  --if-match $(aws cloudfront get-cache-policy --id \${ID} | jq -r .ETag) \\`,
				`  | jq .CachePolicy | tee ${statesDirectory}/\${KEY}`,
				...refresh(CachePolicyId),
			);
		}
	}

	return commands;
};

export let cachePolicyClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {} }: Resource_<Attributes>) => [
		class_,
		name,
	].join('_'),
	refresh: ({ Id }) => refresh(Id),
	upsert,
};

import { create } from "../../warrior";

export let createCachePolicy = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getId: (get: (resource: any, prop: string) => string) => get(resource, 'Id'),
	};
};
