import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'cache-cluster';

type Attributes = {
	CacheClusterId: string,
	CacheNodeType?: string,
	Engine: 'memcached' | 'redis',
	EngineVersion?: string,
	NumCacheNodes?: number,
	Port?: number,
};

let delete_ = ({ CacheClusterId }) => [
	`aws elasticache delete-cache-cluster \\`,
	`  --cache-cluster-id ${CacheClusterId} &&`,
	`aws elasticache wait cache-cluster-deleted --cache-cluster-id ${CacheClusterId} &&`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let {
		CacheClusterId,
		CacheNodeType,
		Engine,
		EngineVersion,
		NumCacheNodes,
	} = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws elasticache create-cache-cluster \\`,
			`  --cache-cluster-id ${CacheClusterId} \\`,
			...CacheNodeType != null ? [`  --cache-node-type ${CacheNodeType} \\`] : [],
			`  --engine ${Engine} \\`,
			...EngineVersion != null ? [`  --engine-version ${EngineVersion} \\`] : [],
			...NumCacheNodes != null ? [`  --num-cache-nodes ${NumCacheNodes} \\`] : [],
			`  --tag '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  | jq .CacheCluster | tee ${statesDirectory}/\${KEY} &&`,
			`aws elasticache wait cache-cluster-available --cache-cluster-id ${CacheClusterId}`,
		);
		state = {
			CacheClusterId,
			CacheNodeType,
			Engine,
			EngineVersion,
			NumCacheNodes,
		};
	}

	let updates = Object
	.entries({
		CacheNodeType: r => r != null ? [`--cache-node-type ${r}`] : [],
		EngineVersion: r => r != null ? [`--engine-version ${r}`] : [],
		NumCacheNodes: r => r != null ? [`--num-cache-nodes ${r}`] : [],
		Port: r => r != null ? [`--port ${r}`] : [],
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
		updates.push(`--cache-cluster-id ${CacheClusterId}`);
		commands.push(
			`aws elasticache modify-cache-cluster \\`,
			...updates.sort((a, b) => a.localeCompare(b)).map(s => `  ${s} \\`),
			`  | jq -r .CacheCluster | tee ${statesDirectory}/\${KEY}`,
		);
	}

	return commands;
};

export let cacheClusterClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {
		CacheClusterId,
		Engine,
	} }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			CacheClusterId,
			Engine,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ CacheClusterId }) => [
		`ID=${CacheClusterId}`,
		`aws elasticache describe-cache-clusters \\`,
		`  --cache-cluster-id \${ID} \\`,
		`  | jq .CacheClusters[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createCacheCluster = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getCacheClusterId: (get: (resource: any, prop: string) => string) => get(resource, 'CacheClusterId'),
	};
};
