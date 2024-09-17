import { createHash } from "crypto";
import { prefix, statesDirectory } from "../../constants";
import { AttributesInput, Class, Resource_ } from "../../types";

let class_ = 'db-instance';

type Attributes = {
	AllocatedStorage?: number,
	AvailabilityZone?: string,
	DBClusterIdentifier?: string,
	DBInstanceClass?: string,
	DBInstanceIdentifier: string,
	DBName?: string,
	DBSubnetGroup?: string,
	Engine: string,
	EngineVersion?: string,
	MasterUserPassword?: string,
	MasterUsername?: string,
	Port?: number,
	PreferredBackupWindow?: string,
	PreferredMaintenanceWindow?: string,
	VpcSecurityGroups?: { VpcSecurityGroupId: string },
};

let delete_ = ({ DBInstanceIdentifier }) => [
	`aws rds delete-db-instance \\`,
	`  --db-instance-identifier ${DBInstanceIdentifier} &&`,
	`rm -f \\`,
	`  ${statesDirectory}/\${KEY} \\`,
	`  ${statesDirectory}/\${KEY}#MasterUserPassword`,
];

let upsert = (state: Attributes, resource: Resource_<Attributes>) => {
	let { name, attributes } = resource;
	let {
		AllocatedStorage,
		AvailabilityZone,
		DBClusterIdentifier,
		DBInstanceClass,
		DBInstanceIdentifier,
		DBName,
		DBSubnetGroup,
		Engine,
		EngineVersion,
		MasterUserPassword,
		MasterUsername,
	} = attributes;
	let commands = [];

	if (state == null) {
		commands.push(
			`aws rds create-db-instance \\`,
			...AllocatedStorage != null ? [`  --allocated-storage ${AllocatedStorage} \\`] : [],
			...AvailabilityZone != null ? [`  --availability-zone ${AvailabilityZone} \\`] : [],
			...DBClusterIdentifier != null ? [`  --db-cluster-identifier ${DBClusterIdentifier} \\`] : [],
			...DBInstanceClass != null ? [`  --db-instance-class ${DBInstanceClass} \\`] : [],
			`  --db-instance-identifier ${DBInstanceIdentifier} \\`,
			...DBName != null ? [`  --db-name ${DBName} \\`] : [],
			...DBSubnetGroup != null ? [`  --db-subnet-group-name ${DBSubnetGroup} \\`] : [],
			`  --engine ${Engine} \\`,
			...EngineVersion != null ? [`  --engine-version ${EngineVersion} \\`] : [],
			...MasterUsername != null ? [`  --master-username ${MasterUsername} \\`] : [],
			`  --tag '${JSON.stringify([{ Key: 'Name', Value: `${prefix}-${name}` }])}' \\`,
			`  | jq .DBInstance | tee ${statesDirectory}/\${KEY}`,
		);
		state = {
			AllocatedStorage,
			AvailabilityZone,
			DBInstanceIdentifier,
			DBInstanceClass,
			DBName,
			DBSubnetGroup,
			Engine,
			EngineVersion,
			MasterUsername,
		};
	}

	let updates = Object
	.entries({
		AllocatedStorage: r => r != null ? [`--allocated-storage ${r}`] : [],
		DBInstanceClass: r => r != null  ? [`--db-instance-class ${r}`] : [],
		EngineVersion: r => r != null ? [`--engine-version ${r}`] : [],
		MasterUserPassword: r => r != null ? [`--master-user-password '${r}'`] : [],
		Port: r => r != null ? [`--port ${r}`] : [],
		PreferredBackupWindow: r => r != null ? [`-- preferred-backup-window ${r}`] : [],
		PreferredMaintenanceWindow: r => r != null ? [`-- preferred-maintenance-window ${r}`] : [],
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
		updates.push(`--db-instance-identifier ${DBInstanceIdentifier}`);
		commands.push(
			`aws rds modify-db-instance \\`,
			...updates.sort((a, b) => a.localeCompare(b)).map(s => `  ${s} \\`),
			`  | jq -r .DBInstance | tee ${statesDirectory}/\${KEY}`,
		);
	}

	if (state.MasterUserPassword !== attributes.MasterUserPassword) {
		commands.push(`echo ${MasterUserPassword} > ${statesDirectory}/\${KEY}#MasterUserPassword`);
	}

	return commands;
};

export let dbInstanceClass: Class = {
	class_,
	delete_,
	getKey: ({ name, attributes: {
		AvailabilityZone,
		DBClusterIdentifier,
		DBName,
		DBInstanceIdentifier,
		DBSubnetGroup,
		Engine,
		MasterUsername,
	} }: Resource_<Attributes>) => [
		class_,
		name,
		createHash('sha256').update([
			AvailabilityZone,
			DBClusterIdentifier,
			DBInstanceIdentifier,
			DBName,
			DBSubnetGroup,
			Engine,
			MasterUsername,
		].join('_')).digest('hex').slice(0, 4),
	].join('_'),
	refresh: ({ DBInstanceIdentifier }) => [
		`ID=${DBInstanceIdentifier}`,
		`aws rds describe-db-instances \\`,
		`  --db-instance-identifier \${ID} \\`,
		`  | jq .DBInstances[0] | tee ${statesDirectory}/\${KEY}`,
	],
	upsert,
};

import { create } from "../../warrior";

export let createDbInstance = (name: string, f: AttributesInput<Attributes>) => {
	let resource = create(class_, name, f) as Resource_<Attributes>;
	return {
		getDBInstanceIdentifier: get => get(resource, 'DBInstanceIdentifier'),
	};
};
