import { existsSync, readdirSync, readFileSync } from 'fs';
import { bucketClass } from './bucket';
import { certificateClass } from './certificate';
import { dependenciesDirectory, getStateFilename, statesDirectory } from './constants';
import { distributionClass } from './distribution';
import { instanceClass } from './instance';
import { instanceProfileClass } from './instanceProfile';
import { internetGatewayClass } from './internetGateway';
import { internetGatewayAttachmentClass } from './internetGatewayAttachment';
import { listenerClass } from './listener';
import { loadBalancerClass } from './loadBalancer';
import { policyClass } from './policy';
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

let classes = Object.fromEntries([
	bucketClass,
	certificateClass,
	distributionClass,
	instanceClass,
	instanceProfileClass,
	internetGatewayClass,
	internetGatewayAttachmentClass,
	listenerClass,
	loadBalancerClass,
	policyClass,
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
	let resource: Resource = { class_, name, attributes: undefined };
	let { getKey } = classes[class_];

	let get = (referredResource: Resource, prop: string) => {
		addDependency(referredResource, resource);

		let key = referredResource.key;
		let state = stateByKey[key];
		let value: string = state ? state[prop] : `$(cat ${getStateFilename(key)} | jq -r .${prop})`;
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
			let [prefix, class_, name] = key.split('_');	
			let { refresh } = classes[class_];

			commands.push(
				'',
				...refresh(state, key),
			);
		}
	} else if (action === 'refresh-dependencies') {
		for (let [key, state] of Object.entries(stateByKey)) {
			let [prefix, class_, name] = key.split('_');	
			let className = class_ + '_' + name;
			let dependencies = JSON.stringify((dependenciesByClassName[className] ?? []).map(r => r.key).sort((a, b) => a.localeCompare(b)));

			commands.push(
				'',
				`echo '${dependencies}' > ${dependenciesDirectory}/${key}`,
			);
		}
	} else {
		let dependersByKey = {};
		let dependenciesFilenames = readdirSync(dependenciesDirectory);

		for (let dependenciesFilename of dependenciesFilenames) {
			let [key, subKey] = dependenciesFilename.split('#');
			let dependencies = readJsonIfExists(`${dependenciesDirectory}/${dependenciesFilename}`);
			for (let dependency of dependencies) {
				let dependers = dependersByKey[dependency];
				if (dependers == null) dependers = dependersByKey[dependency] = [];
				dependers.push(key);
			}
		}

		if (action !== 'down') {
			let upserted = new Set<string>();

			let _upsert = (keys: string[], resource: Resource) => {
				let { key } = resource;

				if (keys.includes(key)) throw new Error(`recursive dependencies for ${key}`);

				if (!upserted.has(key)) {
					let [prefix, class_, name] = key.split('_');
					let className = class_ + '_' + name;
					let dependencies = dependenciesByClassName[className] ?? [];

					for (let dependency of dependencies) _upsert([key, ...keys], dependency);

					let { upsert } = classes[class_];

					commands.push(
						'',
						`# ${stateByKey[key] ? 'update' : 'create'} ${name}`,
						...upsert(stateByKey[key], resource),
						...dependencies.length > 0 ? [`echo '${JSON.stringify(dependencies.map(r => r.key).sort((a, b) => a.localeCompare(b)))}' > ${dependenciesDirectory}/${key}`] : [],
					);

					upserted.add(key);
				}
			};

			for (let resource of Object.values(resourceByKey)) _upsert([], resource);
		}

		let deleted = new Set<string>();

		let _delete = (keys: string[], state) => {
			let { key } = state;

			if (keys.includes(key)) throw new Error(`recursive dependencies for ${key}`);

			if (!deleted.has(key)) {
				let [prefix, class_, name] = key.split('_');
				let dependers = dependersByKey[key] ?? [];

				for (let depender of dependers) {
					let state = stateByKey[depender];
					if (state) _delete([key, ...keys], state);
				}

				let { delete_ } = classes[class_];

				if (action === 'down' || resourceByKey[key] == null) {
					commands.push(
						'',
						`# delete ${name}`,
						`rm -f ${dependenciesDirectory}/${key}`,
						...delete_(state, key),
					);
				}

				deleted.add(key);
			}
		};

		for (let state of Object.values(stateByKey)) _delete([], state);
	}

	console.log(commands.join('\n'));
};
