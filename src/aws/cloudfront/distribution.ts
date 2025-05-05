import { statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";
import { equals, shellEscape } from "../../utils";

let class_ = 'distribution';

type Attributes = {
	DistributionConfig: {
		Aliases?: { Items?: string[], Quantity: number },
		AllowedMethods?: {
			CachedMethods: { Items: string[] },
			Items?: string[],
		},
		CacheBehaviors: {
			Items?: {
				AllowedMethods?: {
					CachedMethods: { Items?: string[], Quantity: number },
					Items?: string[],
					Quantity: number,
				},
				CachePolicyId?: string,
				Compress?: boolean,
				DefaultTTL?: number,
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
				FunctionAssociations?: {
					Items?: {
						EventType: string,
						FunctionARN: string,
					}[],
					Quantity: number,
				},
				LambdaFunctionAssociations?: {
					Items?: {
						EventType: string,
						IncludeBody: boolean,
						LambdaFunctinoARN: string,
					}[],
					Quantity: number,
				},
				MaxTTL?: number,
				MinTTL?: number,
				OriginRequestPolicyId?: string,
				PathPattern: string,
				RealtimeLogConfigArn?: string,
				ResponseHeadersPolicyId?: string,
				SmoothStreaming?: boolean,
				TargetOriginId?: string,
				TrustedKeyGroups?: { Enabled: boolean, Items?: string[], Quantity: number },
				TrustedSigners?: { Enabled: boolean, Items?: string[], Quantity: number },
				ViewerProtocolPolicy: string,
			}[],
			Quantity: number,
		},
		CachePolicyId?: string,
		CallerReference?: string,
		Comment: string,
		Compress?: boolean,
		ContinuousDeploymentPolicyId?: string,
		CustomErrorResponses?: {
			Items?: {
				ErrorCachingMinTTL: number,
				ErrorCode: number,
				ResponseCode: string,
				ResponsePagePath: string,
			}[],
			Quantity: number,
		},
		DefaultCacheBehavior?: {
			AllowedMethods?: {
				CachedMethods: { Items?: string[], Quantity: number },
				Items?: string[],
				Quantity: number,
			},
			CachePolicyId?: string,
			Compress: boolean,
			DefaultTTL?: number,
			FieldLevelEncryptionId: string,
			ForwardedValues?: {
				Cookies: {
					Forward: string,
					WhitelistedNames?: { Items?: string[], Quantity: number },
				},
				Headers: { Items?: string[], Quantity: number },
				QueryString: boolean,
				QueryStringCacheKeys: { Items?: string[], Quantity: number },
			},
			FunctionAssociations?: {
				Items?: {
					EventType: string,
					FunctionARN: string,
				}[],
				Quantity: number,
			},
			LambdaFunctionAssociations?: {
				Items?: {
					EventType: string,
					IncludeBody: boolean,
					LambdaFunctinoARN: string,
				}[],
				Quantity: number,
			},
			MaxTTL?: number,
			MinTTL?: number,
			SmoothStreaming: boolean,
			TargetOriginId: string,
			TrustedKeyGroups: { Enabled: boolean, Items?: string[], Quantity: number },
			TrustedSigners: { Enabled: boolean, Items?: string[], Quantity: 0 },
			ViewerProtocolPolicy: string,
		},
		DefaultRootObject: string,
		Enabled?: boolean,
		FieldLevelEncryptionId?: string,
		FunctionAssociations?: { Items: {
			EventType: string,
			FunctionARN: string,
		}[] },
		HttpVersion: string,
		IsIPV6Enabled?: boolean,
		Logging: {
			Bucket: string,
			Enabled: boolean,
			IncludeCookies: boolean,
			Prefix: string,
		},
		OriginGroups?: {
			Items?: {
				FailoverCriteria: { StatusCodes: { Items: number[] } },
				Id: string,
				Numbers: { Items:  { OriginId: string }[] },
			}[],
			Quantity: number,
		},
		OriginRequestPolicyId?: string,
		Origins: { Items: {
			ConnectionAttempts?: number,
			ConnectionTimeout?: number,
			CustomHeaders?: { Items?: { HeaderName: string, HeaderValue: string }[], Quantity: number },
			CustomOriginConfig?: {
				OriginKeepaliveTimeout: number,
				OriginProtocolPolicy: 'http-only' | 'https-only' | 'match-viewer',
				OriginReadTimeout: number,
				OriginSslProtocols: { Items?: string[], Quantity: number },
				HTTPPort: number,
				HTTPSPort: number,
			},
			DomainName: string,
			Id?: string,
			OriginAccessControlId?: string,
			OriginPath?: string,
			OriginShield?: {
				Enabled: boolean,
				OriginShieldRegion?: string,
			},
			S3OriginConfig?: { OriginAccessIdentity: string },
		}[] },
		PriceClass?: string,
		RealtimeLogConfigArn?: string,
		ResponseHeadersPolicyId?: string,
		Restrictions?: {
			GeoRestriction: { RestrictionType: string, Items?: string[], Quantity: number },
		},
		Staging?: boolean,
		ViewerCertificate?: {
			ACMCertificateArn?: string,
			Certificate?: string,
			CertificateSource?: string,
			CloudFrontDefaultCertificate: boolean,
			IAMCertificateId?: string,
			MinimumProtocolVersion: string,
			SSLSupportMethod: string,
		},
		WebACLId?: string,
	},
};

let delete_ = ({ Id }) => [
	`CONFIG=$(mktemp)`,
	`aws cloudfront get-distribution-config \\`,
	`  --id ${Id} \\`,
	`  | jq .DistributionConfig | jq .Enabled=false > \${CONFIG}`,
	`aws cloudfront update-distribution \\`,
	`  --distribution-config file://\${CONFIG} \\`,
	`  --id ${Id} \\`,
	`  --if-match $(aws cloudfront get-distribution-config --id ${Id} | jq -r .ETag)`,
	// TODO wait until distribution is disabled
	`aws cloudfront delete-distribution \\`,
	`  --id ${Id} \\`,
	`  --if-match $(aws cloudfront get-distribution-config --id ${Id} | jq -r .ETag) &&`,
	`rm -f ${statesDirectory}/\${KEY}`,
];

let refresh = Id => [
	`ID=${Id}`,
	`aws cloudfront get-distribution \\`,
	`  --id \${ID} \\`,
	`  | jq .Distribution | tee ${statesDirectory}/\${KEY}`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let { DistributionConfig: { CacheBehaviors, Comment, DefaultRootObject, HttpVersion, Logging, Origins } } = attributes;
	let commands = [];

	let CallerReference = `$(cat ${statesDirectory}/\${KEY} | jq -r .DistributionConfig.CallerReference)`;
	let DistributionId = `$(cat ${statesDirectory}/\${KEY} | jq -r .Id)`;

	if (state == null) {
		let originDomainName = Origins.Items[0].DomainName;
		commands.push(
			`aws cloudfront create-distribution \\`,
			`  --default-root-object ${DefaultRootObject} \\`,
			`  --origin-domain-name ${originDomainName} \\`,
			`  | jq .Distribution | tee ${statesDirectory}/\${KEY}`,
			...refresh(DistributionId),
		);
		state = { DistributionConfig: {
			CacheBehaviors,
			Comment,
			DefaultRootObject,
			HttpVersion,
			Logging,
			Origins: { Items: [{ DomainName: originDomainName }]} },
		};
	}

	{
		let prop = 'DistributionConfig';
		let source = state[prop];
		let target = attributes[prop];
		if (!equals({ ...source, CallerReference: undefined }, target)) {
			commands.push(
				`CALLER_REFERENCE=${CallerReference}`,
				`ID=${DistributionId}`,
				`aws cloudfront update-distribution \\`,
				`  --distribution-config ${shellEscape(
					JSON.stringify({ ...target, CallerReference: '${CALLER_REFERENCE}' })
				)} \\`,
				`  --id \${ID} \\`,
				`  --if-match $(aws cloudfront get-distribution-config --id \${ID} | jq -r .ETag)`,
				...refresh(DistributionId),
			);
		}
	}

	if (commands.length > 0) {
		commands.push(
			`aws cloudfront wait distribution-deployed \\`,
			`  --id ${DistributionId}`,
		);
	}

	return commands;
};

export let distributionClass: Class = {
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

export let createDistribution = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getDistributionId: (get: (resource: any, prop: string) => string) => get(resource, 'Id'),
		getDomainName: (get: (resource: any, prop: string) => string) => get(resource, 'DomainName'),
		getHostedZoneId: (get: (resource: any, prop: string) => string) => 'Z2FDTNDATAQYW2',
	};
};
