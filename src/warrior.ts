import { existsSync, readdirSync, readFileSync } from 'fs';
import { dependersDirectory, getStateFilename, stateDirectory } from './constants';
import { instanceClass } from './instance';
import { instanceProfileClass } from './instanceProfile';
import { policyClass } from './policy';
import { roleClass } from './role';
import { securityGroupClass } from './securityGroup';
import { subnetClass } from './subnet';
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
	instanceClass,
	instanceProfileClass,
	policyClass,
	roleClass,
	securityGroupClass,
	subnetClass,
	vpcClass,
].map(c => [c.class_, c]));

let resourceByKey: { [key: string]: Resource };
let stateByKey: { [key: string]: any };

let dependenciesByClassName: { [className: string]: Resource[] } = {};
let dependersByKey: { [key: string]: Resource[] } = {};

let addDependency = (referredResource: Resource, resource: Resource) => {
		let referredKey = referredResource.key;

		{
			let { class_, name } = resource;
			let className = class_ + '_' + name;
			let dependencies = dependenciesByClassName[className];
			if (dependencies == null) dependencies = dependenciesByClassName[className] = [];
			dependencies.push(referredResource);
		}

		{
			let dependers = dependersByKey[referredKey];
			if (dependers == null) dependers = dependersByKey[referredKey] = [];
			dependers.push(resource);
		}
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

export let run = f => {
	let stateFilenames = readdirSync(stateDirectory);
	let action = process.env.ACTION ?? 'up';

	resourceByKey = {};
	stateByKey = {};

	for (let stateFilename of stateFilenames) {
		let [key, subKey] = stateFilename.split('#');
		let state = readJsonIfExists(`${stateDirectory}/${stateFilename}`);
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
			let dependers = dependersByKey[key] ?? [];

			commands.push(
				'',
				...refresh(state, key),
				...dependers.length > 0 ? [`echo '${JSON.stringify(dependers.map(r => r.key).sort((a, b) => a.localeCompare(b)))}' > ${dependersDirectory}/${key}`] : [],
			);
		}
	} else {
		if (action !== 'down') {
			let upserted = new Set<string>();

			let _upsert = (keys: string[], resource: Resource) => {
				let { key } = resource;

				if (keys.includes(key)) throw new Error(`recursive dependencies for ${key}`);

				if (!upserted.has(key)) {
					let [prefix, class_, name] = key.split('_');
					let dependencies = dependenciesByClassName[class_ + '_' + name];

					for (let dependency of dependencies ?? []) _upsert([key, ...keys], dependency);

					let { upsert } = classes[class_];
					let dependers0 = JSON.stringify(readJsonIfExists(`${dependersDirectory}/${key}`));
					let dependers1 = JSON.stringify((dependersByKey[key] ?? []).map(r => r.key).sort((a, b) => a.localeCompare(b)));

					commands.push(
						'',
						`# ${stateByKey[key] ? 'update' : 'create'} ${class_} ${name}`,
						...upsert(stateByKey[key], resource),
						...dependers0 !== dependers1 ? [`echo '${JSON.stringify(dependers1)}' > ${dependersDirectory}/${key}`] : [],
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
				let dependers = readJsonIfExists(`${dependersDirectory}/${key}`);

				for (let depender of dependers ?? []) {
					let state = stateByKey[depender];
					if (state) _delete([key, ...keys], state);
				}

				let { delete_ } = classes[class_];

				if (action === 'down' || resourceByKey[key] == null) {
					commands.push(
						'',
						`# delete ${class_} ${name}`,
						...dependers ? [`rm -f ${dependersDirectory}/${key}`] : [],
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
