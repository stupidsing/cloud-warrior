import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { bucketClass } from './bucket';
import { certificateClass } from './certificate';
import { dependenciesDirectory, statesDirectory } from './constants';
import { distributionClass } from './distribution';
import { functionClass } from './function';
import { hostedZoneClass } from './hostedZone';
import { instanceClass } from './instance';
import { instanceProfileClass } from './instanceProfile';
import { internetGatewayClass } from './internetGateway';
import { internetGatewayAttachmentClass } from './internetGatewayAttachment';
import { listenerClass } from './listener';
import { loadBalancerClass } from './loadBalancer';
import { natGatewayClass } from './natGateway';
import { policyClass } from './policy';
import { recordClass } from './record';
import { roleClass } from './role';
import { securityGroupClass } from './securityGroup';
import { securityGroupRuleIngressClass } from './securityGroupRule';
import { subnetClass } from './subnet';
import { targetClass } from './target';
import { targetGroupClass } from './targetGroup';
import { AttributesInput, Resource } from './types';
import { vpcClass } from './vpc';

let readJsonIfExists = name => {
	let filename = name;
	if (existsSync(filename)) {
		let text = readFileSync(filename, 'ascii');
		return text ? JSON.parse(text) : null;
	} else {
		return null;
	}
};

let readTextIfExists = name => {
	let filename = name;
	if (existsSync(filename)) {
		let text = readFileSync(filename, 'ascii');
		return text ? text.split('\n').filter(line => line) : null;
	} else {
		return null;
	}
};

let classes = Object.fromEntries([
	bucketClass,
	certificateClass,
	distributionClass,
	functionClass,
	instanceClass,
	instanceProfileClass,
	internetGatewayClass,
	internetGatewayAttachmentClass,
	hostedZoneClass,
	listenerClass,
	loadBalancerClass,
	natGatewayClass,
	policyClass,
	recordClass,
	roleClass,
	securityGroupClass,
	securityGroupRuleIngressClass,
	subnetClass,
	targetClass,
	targetGroupClass,
	vpcClass,
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
		let value: string = state ? state[prop] : `$(cat \${STATE_${referredResource.hash}} | jq -r .${prop})`;
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
		let [key, subKey] = stateFilename.split('#');
		let state = readJsonIfExists(`${statesDirectory}/${stateFilename}`);
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
			let dependencies = readTextIfExists(`${dependenciesDirectory}/${dependenciesFilename}`) ?? [];
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

					commands.push(
						'',
						`# ${stateByKey[key] ? 'update' : 'create'} ${name}`,
						`KEY=${key}`,
						`KEY_${hash}=\${KEY}`,
						`STATE_${hash}=${statesDirectory}/\${KEY}`,
						...action === 'up' ? upsert(stateByKey[key], resource) : [],
					);

					if (dependencyHashes_.length === 0) {
						commands.push(
							`echo -n > ${dependenciesDirectory}/\${KEY}`,
						);
					} else if (dependencyHashes_.length === 1) {
						commands.push(
							`echo \${KEY_${dependencyHashes_[0]}} > ${dependenciesDirectory}/\${KEY}`,
						);
					} else {
						commands.push(
							`(`,
							...dependencyHashes_.map(dependencyHash => `  echo \${KEY_${dependencyHash}}`),
							`) > ${dependenciesDirectory}/\${KEY}`,
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
							`rm -f \${KEY}`,
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
