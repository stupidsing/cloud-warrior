import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'db-cluster';

type Attributes = {
	AllocatedStorage?: number,
	AvailabilityZones?: string[],
	DatabaseName?: string,
	DBClusterIdentifier: string,
	DBClusterInstanceClass?: string,
	DBSubnetGroup?: string,
	Engine: string,
	EngineVersion?: string,
	MasterUserPassword?: string,
	MasterUsername: string,
	Port?: number,
	PreferredBackupWindow?: string,
	PreferredMaintenanceWindow?: string,
	VpcSecurityGroups?: { VpcSecurityGroupId: string },
};

let delete_ = ({ DBClusterIdentifier }) => [
	`aws rds delete-db-cluster \\`,
	`  --db-cluster-identifier ${DBClusterIdentifier} \\`,
	`  --skip-final-snapshot &&`,
	`aws rds wait db-cluster-deleted --db-cluster-identifier ${DBClusterIdentifier} &&`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
	`  ${statesDirectory}/\${KEY}#MasterUserPassword`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let {
		AllocatedStorage,
		AvailabilityZones,
		DatabaseName,
		DBClusterIdentifier,
		DBClusterInstanceClass,
		DBSubnetGroup,
		Engine,
		EngineVersion,
		MasterUserPassword,
		MasterUsername,
	} = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws rds create-db-cluster \\`,
			...AllocatedStorage != null ? [`  --allocated-storage ${AllocatedStorage} \\`] : [],
			...AvailabilityZones != null ? [`  --availability-zones ${AvailabilityZones.join(' ')} \\`] : [],
			...DatabaseName != null ? [`  --database-name ${DatabaseName} \\`] : [],
			`  --db-cluster-identifier ${DBClusterIdentifier} \\`,
			...DBClusterInstanceClass != null ? [`  --db-cluster-instance-class ${DBClusterInstanceClass} \\`] : [],
			...DBSubnetGroup != null ? [`  --db-subnet-group-name ${DBSubnetGroup} \\`] : [],
			`  --engine ${Engine} \\`,
			...EngineVersion != null ? [`  --engine-version ${EngineVersion} \\`] : [],
			...MasterUserPassword != null ? [`  --master-user-password ${MasterUserPassword} \\`] : [],
			`  --master-username ${MasterUsername} \\`,
			`  --tag '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  | jq .DBCluster | tee ${statesDirectory}/\${KEY} &&`,
			`aws rds wait db-cluster-available --db-cluster-identifier ${DBClusterIdentifier}`,
		);
		state = {
			AllocatedStorage,
			AvailabilityZones,
			DatabaseName,
			DBClusterIdentifier,
			DBClusterInstanceClass,
			DBSubnetGroup,
			Engine,
			EngineVersion,
			MasterUserPassword,
			MasterUsername,
		};
	}

	let updates = Object
	.entries({
		AllocatedStorage: r => r != null ? [`--allocated-storage ${r}`] : [],
		DBClusterInstanceClass: r => r != null  ? [`--db-cluster-instance-class ${r}`] : [],
		EngineVersion: r => r != null ? [`--engine-version ${r}`] : [],
		MasterUserPassword: r => r != null ? [`--master-user-password '${r}'`] : [],
		Port: r => r != null ? [`--port ${r}`] : [],
		PreferredBackupWindow: r => r != null ? [`--preferred-backup-window ${r}`] : [],
		PreferredMaintenanceWindow: r => r != null ? [`--preferred-maintenance-window ${r}`] : [],
		VpcSecurityGroups: r => r != null ? [`--vpc-security-group-ids ${r.map(r => r.VpcSecurityGroupId).join(' ')}`] : [],
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
		updates.push(`--db-cluster-identifier ${DBClusterIdentifier}`);
		commands.push(
			`aws rds modify-db-cluster \\`,
			...updates.sort((a, b) => a.localeCompare(b)).map(s => `  ${s} \\`),
			`  | jq -r .DBCluster | tee ${statesDirectory}/\${KEY}`,
		);
	}

	if (state.MasterUserPassword !== attributes.MasterUserPassword) {
		commands.push(`echo ${MasterUserPassword} > ${statesDirectory}/\${KEY}#MasterUserPassword`);
	}

	return commands;
};

export let dbClusterClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {
		AvailabilityZones,
		DatabaseName,
		DBClusterIdentifier,
		DBSubnetGroup,
		Engine,
		MasterUsername,
	} }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			...AvailabilityZones != null ? AvailabilityZones.sort((a, b) => a.localeCompare(b)) : [],
			DatabaseName,
			DBClusterIdentifier,
			DBSubnetGroup,
			Engine,
			MasterUsername,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ DBClusterIdentifier }) => [
		`ID=${DBClusterIdentifier}`,
		`aws rds describe-db-clusters \\`,
		`  --db-cluster-identifier \${ID} \\`,
		`  | jq .DBClusters[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createDbCluster = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getDBClusterIdentifier: get => get(resource, 'DBClusterIdentifier'),
	};
};
