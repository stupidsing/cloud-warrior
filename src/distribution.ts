import { getStateFilename, prefix } from "./constants";
import { AttributesInput, Class, Resource_ } from "./types";

let class_ = 'distribution';

type Attributes = {
	DistributionConfig: {
		AllowedMethods?: {
			CachedMethods: { Items: string[] },
			Items: string[],
		},
		CacheBehaviors?: { Items: {
			AllowedMethods?: {
				CachedMethods: { Items: string[] },
				Items: string[],
			},
			CachePolicyId?: string,
			CachedMethods: { Items: string[] },
			Compress: boolean,
			FieldLevelEncryptionId?: string,
			ForwardedValues?: {
				Cookies: {
					Forward: string,
					Headers: { Items: string[] },
					QueryStringCacheKeys: { Items: string[] },
					WhitelistedNames: { Items: string[] },
				},
				QueryString: boolean,
			},
			FunctionAssociations: { Items: {
				EventType: string,
				FunctionARN: string,
			}[] },
			LambdaFunctionAssociations: { Items: {
				EventType: string,
				IncludeBody: boolean,
				LambdaFunctinoARN: string,
			}[] },
			OriginRequestPolicyId?: string,
			PathPattern: string,
			RealtimeLogConfigArn?: string,
			ResponseHeadersPolicyId: string,
			SmoothStreaming: boolean,
			TargetOriginId: string,
			TrustedKeyGroups: { Enabled: boolean, Items: string[] },
			TrustedSigners: { Enabled: boolean, Items: string[] },
			ViewerProtocolPolicy: string,
		}[] },
		CachePolicyId?: string,
		Comment?: string,
		Compress?: boolean,
		ContinuousDeploymentPolicyId?: string,
		CustomErrorResponses?: { Items: {
			ErrorCachingMinTTL: number,
			ErrorCode: number,
			ResponseCode: string,
			ResponsePagePath: string,
		}[] },
		DefaultCacheBehavior?: {
			TargetOriginId: string,
			TrustedSigners: { Enabled: boolean, Items: string[] },
		},
		DefaultRootObject: string,
		Enabled?: boolean,
		FieldLevelEncryptionId?: string,
		ForwardedValues?: {
			Cookies: {
				Forward: string,
				Headers: { Items: string[] },
				QueryStringCacheKeys: { Items: string[] },
				WhitelistedNames: { Items: string[] },
			},
			QueryString: boolean,
		},
		FunctionAssociations?: { Items: {
			EventType: string,
			FunctionARN: string,
		}[] },
		HttpVersion?: string,
		IsIPV6Enabled?: boolean,
		LambdaFunctionAssociations?: { Items: {
			EventType: string,
			IncludeBody: boolean,
			LambdaFunctinoARN: string,
		}[] },
		Logging?: {
			Bucket: string,
			Enabled: boolean,
			IncludeCookies: boolean,
			Prefix: string,
		},
		OriginGroups?: { Items: {
			FailoverCriteria: { StatusCodes: { Items: number[] } },
			Id: string,
			Numbers: { Items:  { OriginId: string }[] },
		}[] },
		OriginRequestPolicyId?: string,
		Origins: { Items: {
			ConnectionAttempts?: number,
			ConnectionTimeout?: number,
			CustomHeaders?: { Items?: { HeaderName: string, HeaderValue: string }[] },
			CustomOriginConfig?: {
				OriginKeepaliveTimeout: number,
				OriginProtocolPolicy: string,
				OriginReadTimeout: number,
				OriginSslProtocols: { Items: string[] },
				HTTPPort: number,
				HTTPSPort: number,
			},
			DomainName: string,
			Id?: string,
			OriginAccessControlId?: string,
			OriginPath?: string,
			OriginShield?: {
				Enabled: boolean,
				OriginShieldRegion: string,
			},
			S3OriginConfig?: { OriginAccessIdentity: string },
		}[] },
		PriceClass?: string,
		RealtimeLogConfigArn?: string,
		ResponseHeadersPolicyId?: string,
		Restrictions?: {
			GeoRestriction: { RestrictionType: string, Items: string[] },
		},
		SmoothStreaming?: boolean,
		Staging?: boolean,
		TrustedKeyGroups?: { Enabled: boolean, Items: string[] },
		ViewerCertificate?: {
			ACMCertificateArn: string,
			Certificate: string,
			CertificateSource: string,
			CloudFrontDefaultCertificate: boolean,
			IAMCertificateId: string,
			MinimumProtocolVersion: string,
			SSLSupportMethod: string,
		},
		ViewerProtocolPolicy?: string,
		WebACLId?: string,
	},
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
	let { DistributionConfig: { DefaultRootObject, Origins } } = attributes;
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
		state = { DistributionConfig: { DefaultRootObject, Origins: { Items: [{ DomainName: originDomainName }]} } };
	}

	{
		let prop = 'DistributionConfig';
		let source = JSON.stringify(state[prop]);
		let target = JSON.stringify(attributes[prop]);
		if (source !== target) {
			commands.push(
				`aws cloudfront update-distribution \\`,
				`  --distribution-config ${target} \\`,
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
		class_,
		name,
	].join('_'),
	refresh: ({ Id }, key: string) => refreshById(key, Id),
	upsert,
};

import { create } from "./warrior";

export let createDistribution = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getDistributionId: get => get(resource, 'Id'),
	};
};
