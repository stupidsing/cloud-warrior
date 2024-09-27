import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'replication-group';

type Attributes = {
	AutomaticFailover?: boolean,
	CacheNodeType?: string,
	Description: string,
	Engine: string,
	EngineVersion?: string,
	NodeGroups?: { NodeGroupMembers: {}[] }[],
	ParameterGroupName?: string,
	Port?: number,
	PreferredMaintenanceWindow?: string,
	ReplicationGroupId: string,
	SecurityGroupIds?: string[],
	SnapshotWindow?: string,
	SubnetGroupName?: string,
};

let delete_ = ({ ReplicationGroupId }) => [
	`aws elasticache delete-replication-group \\`,
	`  --replication-group-id ${ReplicationGroupId} &&`,
	`aws elasticache wait replication-group-deleted --replication-group-id ${ReplicationGroupId} &&`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
	`  ${statesDirectory}/\${KEY}#ParameterGroupName \\`,
	`  ${statesDirectory}/\${KEY}#PreferredMaintenanceWindow \\`,
	`  ${statesDirectory}/\${KEY}#SubnetGroupName`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let {
		CacheNodeType,
		Description,
		ReplicationGroupId,
		Engine,
		EngineVersion,
		ParameterGroupName,
		PreferredMaintenanceWindow,
		NodeGroups,
		SubnetGroupName,
	} = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws elasticache create-replication-group \\`,
			...CacheNodeType != null ? [`  --cache-node-type ${CacheNodeType} \\`] : [],
			...SubnetGroupName != null ? [`  --cache-subnet-group-name ${SubnetGroupName} \\`] : [],
			`  --engine ${Engine} \\`,
			...EngineVersion != null ? [`  --engine-version ${EngineVersion} \\`] : [],
			...NodeGroups != null ? [`  --num-node-groups ${NodeGroups.length} \\`] : [],
			...NodeGroups?.[0] != null ? [`  --replicas-per-node-group ${NodeGroups[0].NodeGroupMembers.length - 1} \\`] : [],
			`  --replication-group-description ${Description} \\`,
			`  --replication-group-id ${ReplicationGroupId} \\`,
			`  --tag '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  | jq .ReplicationGroup | tee ${statesDirectory}/\${KEY} &&`,
			`aws elasticache wait replication-group-available --replication-group-id ${ReplicationGroupId}`,
		);
		state = {
			CacheNodeType,
			Description,
			ReplicationGroupId,
			Engine,
			EngineVersion,
			NodeGroups,
		};
	}

	let updates = Object
	.entries({
		AutomaticFailover: r => [r === 'true' ? `--automatic-failover-enabled` : `--no-automatic-failover-enabled`],
		CacheNodeType: r => r != null ? [`--cache-node-type ${r}`] : [],
		Description: r => r != null ? [`--replication-group-description '${r}'`] : [],
		EngineVersion: r => r != null ? [`--engine-version ${r}`] : [],
		ParameterGroupName: r => r != null ? [`--cache-parameter-group-name ${r}`] : [],
		Port: r => r != null ? [`--port ${r}`] : [],
		PreferredMaintenanceWindow: r => r != null ? [`--preferred-maintenance-window ${r}`] : [],
		SecurityGroupIds: r => r != null ? [`--security-group-ids ${r}`] : [],
		SnapshotWindow: r => r !=  null ? [`--snapshot-window ${r}`] : [],
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
		updates.push(`--replication-group-id ${ReplicationGroupId}`);
		commands.push(
			`aws elasticache modify-replication-group \\`,
			...updates.sort((a, b) => a.localeCompare(b)).map(s => `  ${s} \\`),
			`  | jq -r .ReplicationGroup | tee ${statesDirectory}/\${KEY}`,
			`echo '${JSON.stringify(ParameterGroupName ?? null)}' > ${statesDirectory}/\${KEY}#ParameterGroupName`,
			`echo '${JSON.stringify(PreferredMaintenanceWindow ?? null)}' > ${statesDirectory}/\${KEY}#PreferredMaintenanceWindow`,
			`echo '${JSON.stringify(SubnetGroupName ?? null)}' > ${statesDirectory}/\${KEY}#SubnetGroupName`,
		);
	}

	return commands;
};

export let replicationGroupClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {
		Engine,
		NodeGroups,
		ReplicationGroupId,
	} }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			Engine,
			NodeGroups,
			ReplicationGroupId,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ ReplicationGroupId }) => [
		`ID=${ReplicationGroupId}`,
		`aws elasticache describe-replication-groups \\`,
		`  --replication-group-id \${ID} \\`,
		`  | jq .ReplicationGroups[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createReplicationGroup = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getReplicationGroupId: get => get(resource, 'ReplicationGroupId'),
	};
};
