import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { certificateClass } from './aws/acm/certificate';
import { cachePolicyClass } from './aws/cloudfront/cachePolicy';
import { distributionClass } from './aws/cloudfront/distribution';
import { groupClass } from './aws/cognito-idp/group';
import { userPoolClass } from './aws/cognito-idp/userPool';
import { userPoolClientClass } from './aws/cognito-idp/userPoolClient';
import { addressAssociationClass } from './aws/ec2/addressAssociation';
import { elasticIpClass } from './aws/ec2/elasticIp';
import { instanceClass } from './aws/ec2/instance';
import { internetGatewayClass } from './aws/ec2/internetGateway';
import { internetGatewayAttachmentClass } from './aws/ec2/internetGatewayAttachment';
import { keyPairClass } from './aws/ec2/keyPair';
import { listenerClass } from './aws/ec2/listener';
import { natGatewayClass } from './aws/ec2/natGateway';
import { routesClass } from './aws/ec2/routes';
import { routeTableClass } from './aws/ec2/routeTable';
import { routeTableAssociationsClass } from './aws/ec2/routeTableAssociations';
import { securityGroupClass } from './aws/ec2/securityGroup';
import { securityGroupRuleEgressClass } from './aws/ec2/securityGroupRuleEgress';
import { securityGroupRuleIngressClass } from './aws/ec2/securityGroupRuleIngress';
import { subnetClass } from './aws/ec2/subnet';
import { volumeClass } from './aws/ec2/volume';
import { volumeAttachmentClass } from './aws/ec2/volumeAttachment';
import { vpcClass } from './aws/ec2/vpc';
import { vpcEndpointClass } from './aws/ec2/VpcEndpoint';
import { lifecyclePolicyClass } from './aws/ecr/lifecyclePolicy';
import { repositoryClass } from './aws/ecr/repository';
import { cacheClusterClass } from './aws/elasticache/cacheCluster';
import { replicationGroupClass } from './aws/elasticache/replicationGroup';
import { loadBalancerClass } from './aws/elbv2/loadBalancer';
import { targetClass } from './aws/elbv2/target';
import { targetGroupClass } from './aws/elbv2/targetGroup';
import { instanceProfileClass } from './aws/iam/instanceProfile';
import { policyClass } from './aws/iam/policy';
import { roleClass } from './aws/iam/role';
import { rolePolicyAttachmentClass } from './aws/iam/rolePolicyAttachment';
import { eventSourceMappingClass } from './aws/lambda/eventSourceMapping';
import { functionClass } from './aws/lambda/function';
import { permissionClass } from './aws/lambda/permission';
import { dbClusterClass } from './aws/rds/dbCluster';
import { dbInstanceClass } from './aws/rds/dbInstance';
import { dbSubnetGroupClass } from './aws/rds/dbSubnetGroup';
import { hostedZoneClass } from './aws/route53/hostedZone';
import { recordClass } from './aws/route53/record';
import { bucketClass } from './aws/s3/bucket';
import { bucketCorsClass } from './aws/s3/bucketCors';
import { bucketPolicyClass } from './aws/s3/bucketPolicy';
import { objectClass } from './aws/s3/object';
import { publicAccessBlockClass } from './aws/s3/publicAccessBlock';
import { queueClass } from './aws/sqs/Queue';
import { ipSetClass } from './aws/wafv2/ipSet';
import { webAclClass } from './aws/wafv2/webAcl';
import { dependenciesDirectory, statesDirectory } from './constants';
import { AttributesInput, Resource } from './types';

let readJsonIfExists = name => {
	let filename = name;
	if (existsSync(filename)) {
		let text = readFileSync(filename, 'utf8');
		return text ? JSON.parse(text) : null;
	} else {
		return null;
	}
};

let readLinesIfExists = name => {
	let filename = name;
	if (existsSync(filename)) {
		let text = readFileSync(filename, 'utf8');
		return text ? text.split('\n').filter(line => line) : null;
	} else {
		return null;
	}
};

let readTextIfExists = name => {
	let filename = name;
	if (existsSync(filename)) {
		return readFileSync(filename, 'utf8');
	} else {
		return null;
	}
};

let classes = Object.fromEntries([
	addressAssociationClass,
	bucketClass,
	bucketCorsClass,
	bucketPolicyClass,
	cacheClusterClass,
	cachePolicyClass,
	certificateClass,
	elasticIpClass,
	eventSourceMappingClass,
	dbClusterClass,
	dbInstanceClass,
	dbSubnetGroupClass,
	distributionClass,
	functionClass,
	groupClass,
	hostedZoneClass,
	instanceClass,
	instanceProfileClass,
	internetGatewayClass,
	internetGatewayAttachmentClass,
	ipSetClass,
	keyPairClass,
	lifecyclePolicyClass,
	listenerClass,
	loadBalancerClass,
	natGatewayClass,
	objectClass,
	permissionClass,
	policyClass,
	publicAccessBlockClass,
	queueClass,
	recordClass,
	replicationGroupClass,
	repositoryClass,
	roleClass,
	rolePolicyAttachmentClass,
	routesClass,
	routeTableClass,
	routeTableAssociationsClass,
	securityGroupClass,
	securityGroupRuleEgressClass,
	securityGroupRuleIngressClass,
	subnetClass,
	targetClass,
	targetGroupClass,
	userPoolClass,
	userPoolClientClass,
	volumeClass,
	volumeAttachmentClass,
	vpcClass,
	vpcEndpointClass,
	webAclClass,
].map(c => [c.class_, c]));

let resourceByKey: { [key: string]: Resource };
let stateByKey: { [key: string]: any };

let dependenciesByClassName: { [className: string]: Resource[] } = {};

let addDependency = (referredResource: Resource, resource: Resource) => {
	let { class_, name } = resource;
	let className = class_ + '_' + name;
	let dependencies = dependenciesByClassName[className];
	if (dependencies == null) dependencies = dependenciesByClassName[className] = [];
	dependencies.push(referredResource);
}

export let create = (class_: string, name: string, f: AttributesInput<Record<string, any>>) => {
	let hash = createHash('sha256').update(class_ + '_' + name).digest('hex').slice(0, 4);
	let resource: Resource = { class_, name, hash, attributes: undefined };
	let { getKey } = classes[class_];

	let get = (referredResource: Resource, prop: string) => {
		addDependency(referredResource, resource);

		let key = referredResource.key;
		let state = stateByKey[key];
		let value: string;

		if (state) {
			let v = state;
			let begin = 0;
			for (let i = 0; i < prop.length; i++) {
				if (prop[i] === '.') {
					if (begin !== i) v = v[prop.slice(begin, i)];
					begin = i + 1;
				} else if (prop[i] === '[') {
					v = v[prop.slice(begin, i)];
					begin = i + 1;
				} else if (prop[i] === ']') {
					v = v[+prop.slice(begin, i)];
					begin = i + 1;
				}
			}
			v = v[prop.slice(begin)];
			value = v;
		} else {
			value = `$(cat \${STATE_${referredResource.hash}} | jq -r .${prop})`;
		}

		return value;
	};

	let key: string;
	resource.attributes = f(get);
	resource.key = key = getKey(resource);
	return resourceByKey[key] = resource;
};

export let run = (action: string, f: () => void) => {
	let stateFilenames = readdirSync(statesDirectory);

	resourceByKey = {};
	stateByKey = {};

	for (let stateFilename of stateFilenames) {
		let isText = stateFilename.endsWith('.text');
		let [key, subKey] = stateFilename.split('#');
		if (subKey && isText) subKey = subKey.slice(0, -5);
		let state = !isText
			? readJsonIfExists(`${statesDirectory}/${stateFilename}`)
			: readTextIfExists(`${statesDirectory}/${stateFilename}`);
		if (state) {
			if (subKey) state = { [subKey]: state };
			stateByKey[key] = { ...stateByKey[key] ?? {}, key, ...state };
		}
	}

	f();

	let commands: string[] = [];

	if (action === 'refresh') {
		for (let [key, state] of Object.entries(stateByKey)) {
			let [class_, name] = key.split('_');	
			let hash = createHash('sha256').update(class_ + '_' + name).digest('hex').slice(0, 4);
			let { refresh } = classes[class_];

			commands.push(
				'',
				`KEY=${key}`,
				`KEY_${hash}=\${KEY}`,
				`STATE_${hash}=${statesDirectory}/\${KEY}`,
				...refresh(state),
			);
		}
	} else {
		let dependersByKey = {};
		let dependenciesFilenames = readdirSync(dependenciesDirectory);

		for (let dependenciesFilename of dependenciesFilenames) {
			let [key, subKey] = dependenciesFilename.split('#');
			let dependencies = readLinesIfExists(`${dependenciesDirectory}/${dependenciesFilename}`) ?? [];
			for (let dependency of dependencies) {
				let dependers = dependersByKey[dependency];
				if (dependers == null) dependers = dependersByKey[dependency] = [];
				dependers.push(key);
			}
		}

		if (['refresh-dependencies', 'up'].includes(action)) {
			let upserted = new Set<string>();

			let _upsert = (keys: string[], resource: Resource) => {
				let { key, name, hash } = resource;

				if (keys.includes(key)) throw new Error(`recursive dependencies for ${key}`);

				if (!upserted.has(key)) {
					let [class_, _] = key.split('_');
					let className = class_ + '_' + name;
					let dependencies = dependenciesByClassName[className] ?? [];

					for (let dependency of dependencies) _upsert([key, ...keys], dependency);

					let dependencyHashes = dependencies.map(r => r.hash).sort((a, b) => a.localeCompare(b));
					let dependencyHashes_ = [];
					let set = new Set<string>();

					for (let dependencyHash of dependencyHashes) {
						if (!set.has(dependencyHash)) {
							set.add(dependencyHash);
							dependencyHashes_.push(dependencyHash);
						}
					}

					let { upsert } = classes[class_];
					let upsertCommands = action === 'up' ? upsert(stateByKey[key], resource) : [];

					if (action !== 'up' || upsertCommands.length > 0 || process.env.KEEP_EMPTY_BLOCKS) {
						commands.push(
							'',
							`# ${stateByKey[key] ? 'update' : 'create'} ${name}`,
							`KEY=${key}`,
							`KEY_${hash}=\${KEY}`,
							`STATE_${hash}=${statesDirectory}/\${KEY}`,
							...upsertCommands,
							...(
								dependencyHashes_.length === 0 ? [
									`echo -n > ${dependenciesDirectory}/\${KEY}`,
								]
								: dependencyHashes_.length === 1 ? [
									`echo \${KEY_${dependencyHashes_[0]}} > ${dependenciesDirectory}/\${KEY}`,
								]
								: [
									`(`,
									...dependencyHashes_.map(dependencyHash => `  echo \${KEY_${dependencyHash}}`),
									`) > ${dependenciesDirectory}/\${KEY}`,
								]
							),
						);
					}

					upserted.add(key);
				}
			};

			for (let [key, resource] of Object.entries(resourceByKey)) _upsert([], resource);
		}

		if (['down', 'up'].includes(action)) {
			let deleted = new Set<string>();

			let _delete = (keys: string[], key, state) => {
				if (keys.includes(key)) throw new Error(`recursive dependencies for ${key}`);

				if (!deleted.has(key)) {
					let [class_, name] = key.split('_');
					let hash = createHash('sha256').update(class_ + '_' + name).digest('hex').slice(0, 4);
					let dependers = dependersByKey[key] ?? [];

					for (let depender of dependers) {
						let state = stateByKey[depender];
						if (state) _delete([key, ...keys], depender, state);
					}

					let { delete_ } = classes[class_];

					if (action === 'down' || resourceByKey[key] == null) {
						commands.push(
							'',
							`# delete ${name}`,
							`KEY=${key}`,
							`KEY_${hash}=\${KEY}`,
							`STATE_${hash}=${statesDirectory}/\${KEY}`,
							...delete_(state),
							`rm -f ${dependenciesDirectory}/\${KEY}`,
						);
					}

					deleted.add(key);
				}
			};

			for (let [key, state] of Object.entries(stateByKey)) _delete([], key, state);
		}
	}

	console.log(commands.join('\n'));
};
