import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'db-cluster';

type Attributes = {
	AvailabilityZones?: string[],
	DatabaseName?: string,
	DBClusterIdentifier: string,
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
	`aws ec2 delete-db-cluster \\`,
	`  --db-cluster-identifier ${DBClusterIdentifier} &&`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
	`  ${statesDirectory}/\${KEY}#MasterUserPassword`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let {
		AvailabilityZones,
		DatabaseName,
		DBClusterIdentifier,
		DBSubnetGroup,
		Engine,
		EngineVersion,
		MasterUserPassword,
		MasterUsername,
	} = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws ec2 create-db-cluster \\`,
			`  --availability-zones ${AvailabilityZones.join(' ')} \\`,
			...DatabaseName != null ? [`  --database-name ${DatabaseName} \\`] : [],
			`  --db-cluster-identifier ${DBClusterIdentifier} \\`,
			...DBSubnetGroup != null ? [`  --db-subnet-group-name ${DBSubnetGroup} \\`] : [],
			`  --engine ${Engine} \\`,
			...EngineVersion != null ? [`  --engine-version ${EngineVersion} \\`] : [],
			`  --master-username ${MasterUsername} \\`,
			`  --tag '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  | jq .DBCluster | tee ${statesDirectory}/\${KEY}`,
		);
		state = { AvailabilityZones, DBClusterIdentifier, DBSubnetGroup, Engine, EngineVersion, MasterUsername };
	}

	let updates = Object
	.entries({
		EngineVersion: r => [`--engine-version ${r}`],
		MasterUserPassword: r => [`--master-user-password '${r}'`],
		Port: r => [`--port ${r}`],
		PreferredBackupWindow: r => [`-- preferred-backup-window ${r}`],
		PreferredMaintenanceWindow: r => [`-- preferred-maintenance-window ${r}`],
		VpcSecurityGroups: r => [`--vpc-security-group-ids ${r.map(r => r.VpcSecurityGroupId).join(' ')}`],
	})
	.flatMap(([prop, transform]) => {
		let source = transform(state[prop]);
		let target = transform(attributes[prop]);
		let same = source.length === target.length;
		if (same) {
			for (let i = 0; i < source.length; i++) same &&= source[i] === target[i];
		}
		return !same ? transform(target) : [];
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
			AvailabilityZones,
			DatabaseName,
			DBClusterIdentifier,
			DBSubnetGroup,
			Engine,
			MasterUsername,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ DBClusterIdentifier }) => [
		`ID=${DBClusterIdentifier}`,
		`aws ec2 describe-db-clusters \\`,
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
