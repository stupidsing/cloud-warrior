import { createHash } from "crypto";
import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'user-pool-client';

type Attributes = {
	AccessTokenValidity?: number,
	ClientId?: string,
	ClientName: string,
	ExplicitAuthFlows?: (
		'ALLOW_ADMIN_USER_PASSWORD_AUTH'
		| 'ALLOW_CUSTOM_AUTH'
		| 'ADMIN_NO_SRP_AUTH'
		| 'ALLOW_REFRESH_TOKEN_AUTH'
		| 'ALLOW_USER_PASSWORD_AUTH'
		| 'ALLOW_USER_SRP_AUTH'
		| 'CUSTOM_AUTH_FLOW_ONLY'
		| 'USER_PASSWORD_AUTH'
	)[],
	IdTokenValidity?: number,
	RefreshTokenValidity?: number,
	TokenValidityUnits?: {
		AccessToken?: string,
		IdToken?: string,
		RefreshToken?: string,
	},
	UserPoolId: string,
};

let delete_ = ({ ClientId, UserPoolId }) => [
	`aws cognito-idp delete-user-pool-client \\`,
	`  --client-id ${ClientId} \\`,
	`  --user-pool-id ${UserPoolId} &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = (ClientId, UserPoolId) => [
	`CLIENT_ID=${ClientId}`,
	`USER_POOL_ID=${UserPoolId}`,
	`aws cognito-idp describe-user-pool-client \\`,
	`  --client-id \${CLIENT_ID} \\`,
	`  --user-pool-id \${USER_POOL_ID} \\`,
	`  | jq .UserPoolClient | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { ClientName, UserPoolId } = attributes;
	let commands = [];

	let ClientId = `$(cat ${statesDirectory}/\${KEY} | jq -r .ClientId)`;

	if (state == null) {
		commands.push(
			`aws cognito-idp create-user-pool-client \\`,
			`  --client-name ${ClientName} \\`,
			`  --user-pool-id ${UserPoolId} \\`,
			`  | jq .UserPoolClient | tee ${statesDirectory}/\${KEY}`,
		);
		state = { ClientName, UserPoolId };
	}

	let updates = Object
	.entries({
		AccessTokenValidity: r => r != null ? [`--access-token-validity ${r}`] : [],
		IdTokenValidity: r => r != null ? [`--id-token-validity ${r}`] : [],
		ExplicitAuthFlows: r => r != null ? [`--explicit-auth-flows ${r.join(' ')}`] : [],
		RefreshTokenValidity: r => r != null ? [`--refresh-token-validity ${r}`] : [],
		TokenValidityUnits: r => r != null ? [
			`--token-validity-units AccessToken=${r.AccessToken} IdToken=${r.IdToken} RefreshToken=${r.RefreshToken}`,
		] : [],
	})
	.flatMap(([prop, transform]) => {
		let source = transform(state[prop]);
		let target = transform(attributes[prop]);
		let same = source.length === target.length;
		if (same) {
			for (let i = 0; i < source.length; i++) same &&= source[i] === target[i];
		}
		return same ? [] : target;
	});

	if (updates.length > 0) {
		updates.push(`--client-id ${ClientId}`);
		updates.push(`--user-pool-id ${UserPoolId}`);
		commands.push(
			`aws cognito-idp update-user-pool-client \\`,
			...updates.sort((a, b) => a.localeCompare(b)).map(s => `  ${s} \\`),
			`  | jq .UserPoolClient | tee ${statesDirectory}/\${KEY}`,
		);
	}

	return commands;
};

export let userPoolClientClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: { ClientName, UserPoolId } }: Resource_<Attributes>) => [
		class_,
		name,
		UserPoolId,
		createHash('sha256').update([
			ClientName,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ ClientName, UserPoolId }) => refresh(ClientName, UserPoolId),
	upsert,
};

import { create } from "../../warrior";

export let createUserPoolClient = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getClientId: (get: (resource: any, prop: string) => string) => get(resource, 'ClientId'),
	};
};
